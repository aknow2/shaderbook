import { useCallback, useEffect, useRef, useState } from 'react'
import {
  flipbookSettingsToDraft,
  normalizeFlipbookDraft,
  normalizeFlipbookSettings,
  type FlipbookDraft,
} from '../flipbookSettings'
import { downloadFlipbookFramesAsPngs } from '../flipbookExport'
import { createShaderPipeline } from '../gpu/createShaderPipeline'
import {
  createUniformBuffer,
  createViewportOriginBuffer,
  writeViewportOrigin,
} from '../gpu/createUniformBuffer'
import { createWebGPUContext } from '../gpu/createWebGPUContext'
import {
  destroyFlipbookFrameResources,
  renderFlipbook,
  type FlipbookFrameResources,
  type FlipbookGrid,
} from '../gpu/renderFlipbook'
import {
  renderFrame,
  startRenderLoop,
  type RenderLoopController,
  type RenderLoopGpuState,
} from '../gpu/renderLoop'
import { wrapShader } from '../gpu/shaderWrapper'
import type {
  FlipbookSettings,
  LivePlaybackMode,
  LiveRecordingStatus,
  PreviewAspectRatio,
  PreviewMode,
} from '../types/preview'
import { FlipbookControls } from './FlipbookControls'
import { FlipbookLabels } from './FlipbookLabels'
import { PreviewModeControl } from './PreviewModeControl'

const webgpuUnsupportedMessage =
  'WebGPU is not supported in this browser.\nPlease use a browser that supports WebGPU.'
const deviceLostMessage = 'GPU device was lost. Please reload the page.'

type GpuState = {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
  uniformBuffer: GPUBuffer
  viewportOriginBuffer: GPUBuffer
} & (
  | { pipeline: null; bindGroup: null }
  | { pipeline: GPURenderPipeline; bindGroup: GPUBindGroup }
)

type CanvasCssSize = {
  width: number
  height: number
}

export type PreviewPaneProps = {
  code: string
  shouldCompile: boolean
  previewMode: PreviewMode
  previewAspectRatio: PreviewAspectRatio
  flipbook: FlipbookSettings
  initialLivePlaybackMode: LivePlaybackMode
  onLivePlaybackModeChange: (mode: LivePlaybackMode) => void
  onPreviewModeChange: (mode: PreviewMode) => void
  onPreviewAspectRatioChange: (aspectRatio: PreviewAspectRatio) => void
  onFlipbookChange: (settings: FlipbookSettings) => void
  onLiveRecordingChange: (isRecording: boolean) => void
  onCompileSuccess: () => void
  onCompileError: (message: string) => void
  onFpsChange: (fps: number) => void
  onResolutionChange: (width: number, height: number) => void
  onGpuInfo: (name: string | undefined) => void
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getGpuName(adapterInfo: GPUAdapterInfo | undefined): string | undefined {
  if (!adapterInfo) {
    return 'Unknown'
  }

  return (
    adapterInfo.description ||
    adapterInfo.device ||
    adapterInfo.vendor ||
    adapterInfo.architecture ||
    'Unknown'
  )
}

function getFrameCssSize(entry: ResizeObserverEntry): CanvasCssSize {
  return {
    width: Math.max(1, entry.contentRect.width),
    height: Math.max(1, entry.contentRect.height),
  }
}

export function computeCanvasCssSize(
  frameWidth: number,
  frameHeight: number,
  aspectRatio: PreviewAspectRatio,
): CanvasCssSize {
  const safeFrameWidth = Math.max(1, frameWidth)
  const safeFrameHeight = Math.max(1, frameHeight)

  if (aspectRatio === 'fit') {
    return { width: safeFrameWidth, height: safeFrameHeight }
  }

  const targetRatio =
    aspectRatio === '1:1' ? 1 : aspectRatio === '16:9' ? 16 / 9 : 9 / 16
  const frameRatio = safeFrameWidth / safeFrameHeight

  if (frameRatio > targetRatio) {
    return {
      width: safeFrameHeight * targetRatio,
      height: safeFrameHeight,
    }
  }

  return {
    width: safeFrameWidth,
    height: safeFrameWidth / targetRatio,
  }
}

function areFlipbookSettingsEqual(
  left: FlipbookSettings,
  right: FlipbookSettings,
): boolean {
  return (
    left.frameCount === right.frameCount &&
    left.frameIntervalMs === right.frameIntervalMs &&
    left.startTimeMs === right.startTimeMs
  )
}

function areFlipbookDraftsEqual(left: FlipbookDraft, right: FlipbookDraft): boolean {
  return (
    left.frameCount === right.frameCount &&
    left.frameIntervalMs === right.frameIntervalMs &&
    left.startTimeMs === right.startTimeMs
  )
}

export function PreviewPane({
  code,
  shouldCompile,
  previewMode,
  previewAspectRatio,
  flipbook,
  initialLivePlaybackMode,
  onLivePlaybackModeChange,
  onPreviewModeChange,
  onPreviewAspectRatioChange,
  onFlipbookChange,
  onLiveRecordingChange,
  onCompileSuccess,
  onCompileError,
  onFpsChange,
  onResolutionChange,
  onGpuInfo,
}: PreviewPaneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const gpuRef = useRef<GpuState | null>(null)
  const isFirstRunEffectRef = useRef(true)
  const isFirstPreviewModeEffectRef = useRef(true)
  const lifecycleGenerationRef = useRef(0)
  const compileSeqRef = useRef(0)
  const codeRef = useRef(code)
  const previewModeRef = useRef(previewMode)
  const previewAspectRatioRef = useRef(previewAspectRatio)
  const flipbookRef = useRef(flipbook)
  const frameCssSizeRef = useRef<CanvasCssSize | null>(null)
  const renderLoopRef = useRef<RenderLoopController | null>(null)
  const pendingFlipbookFrameRef = useRef<number | null>(null)
  const handledPreviewModeChangeRef = useRef<PreviewMode | null>(null)
  const displayGenerationRef = useRef(0)
  const latestFlipbookResourcesRef = useRef<FlipbookFrameResources | null>(null)
  const deviceLostRef = useRef(false)
  const callbacksRef = useRef({
    onLivePlaybackModeChange,
    onPreviewModeChange,
    onPreviewAspectRatioChange,
    onFlipbookChange,
    onLiveRecordingChange,
    onCompileSuccess,
    onCompileError,
    onFpsChange,
    onResolutionChange,
    onGpuInfo,
  })
  const [previewMessage, setPreviewMessage] = useState<string | null>(null)
  const [recordingMessage, setRecordingMessage] = useState<string | null>(null)
  const [recordingStatus, setRecordingStatus] = useState<LiveRecordingStatus>('idle')
  const [isPipelineReady, setIsPipelineReady] = useState(false)
  const [isLiveRendering, setIsLiveRendering] = useState(false)
  const [livePlaybackMode, setLivePlaybackMode] = useState<LivePlaybackMode>(
    initialLivePlaybackMode,
  )
  const livePlaybackModeRef = useRef<LivePlaybackMode>(livePlaybackMode)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [flipbookDraft, setFlipbookDraft] = useState<FlipbookDraft>(() =>
    flipbookSettingsToDraft(flipbook),
  )
  const flipbookDraftRef = useRef(flipbookDraft)
  const [latestGrid, setLatestGrid] = useState<FlipbookGrid | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingObjectUrlRef = useRef<string | null>(null)
  const shouldDownloadRecordingRef = useRef(false)
  const recordingStatusRef = useRef<LiveRecordingStatus>('idle')

  codeRef.current = code
  previewModeRef.current = previewMode
  livePlaybackModeRef.current = livePlaybackMode
  previewAspectRatioRef.current = previewAspectRatio
  flipbookDraftRef.current = flipbookDraft
  callbacksRef.current = {
    onLivePlaybackModeChange,
    onPreviewModeChange,
    onPreviewAspectRatioChange,
    onFlipbookChange,
    onLiveRecordingChange,
    onCompileSuccess,
    onCompileError,
    onFpsChange,
    onResolutionChange,
    onGpuInfo,
  }

  const setLiveRecordingStatus = useCallback((status: LiveRecordingStatus) => {
    recordingStatusRef.current = status
    setRecordingStatus(status)
  }, [])

  const stopLiveLoop = useCallback(() => {
    renderLoopRef.current?.stop()
    renderLoopRef.current = null
    setIsLiveRendering(false)
    callbacksRef.current.onFpsChange(0)
  }, [])

  const startLiveLoop = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !gpuRef.current || deviceLostRef.current || renderLoopRef.current) {
      return
    }

    renderLoopRef.current = startRenderLoop({
      getGpuState: () => gpuRef.current as RenderLoopGpuState | null,
      getResolution: () => ({
        width: canvas.width,
        height: canvas.height,
      }),
      onFpsChange: (fps) => callbacksRef.current.onFpsChange(fps),
    })
    setIsLiveRendering(true)
  }, [])

  const renderLiveFrameOnce = useCallback(() => {
    const canvas = canvasRef.current
    const currentGpu = gpuRef.current
    if (
      previewModeRef.current !== 'live' ||
      livePlaybackModeRef.current !== 'once' ||
      deviceLostRef.current ||
      !canvas ||
      !currentGpu?.pipeline
    ) {
      return
    }

    renderFrame({
      gpuState: currentGpu as RenderLoopGpuState,
      timeSeconds: 0,
      width: canvas.width,
      height: canvas.height,
    })
  }, [])

  const startLivePlayback = useCallback(() => {
    if (livePlaybackModeRef.current === 'once') {
      stopLiveLoop()
      renderLiveFrameOnce()
      return
    }

    startLiveLoop()
  }, [renderLiveFrameOnce, startLiveLoop, stopLiveLoop])

  const cancelPendingFlipbookRender = useCallback(() => {
    if (pendingFlipbookFrameRef.current !== null) {
      cancelAnimationFrame(pendingFlipbookFrameRef.current)
      pendingFlipbookFrameRef.current = null
    }
  }, [])

  const destroyLatestFlipbookResources = useCallback(() => {
    destroyFlipbookFrameResources(latestFlipbookResourcesRef.current)
    latestFlipbookResourcesRef.current = null
  }, [])

  const revokeRecordingObjectUrl = useCallback(() => {
    if (recordingObjectUrlRef.current) {
      URL.revokeObjectURL(recordingObjectUrlRef.current)
      recordingObjectUrlRef.current = null
    }
  }, [])

  const stopRecordingTracks = useCallback(() => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
  }, [])

  const cleanupRecordingRefs = useCallback(() => {
    stopRecordingTracks()
    revokeRecordingObjectUrl()
    mediaRecorderRef.current = null
    recordedChunksRef.current = []
    shouldDownloadRecordingRef.current = false
  }, [revokeRecordingObjectUrl, stopRecordingTracks])

  const finishRecording = useCallback(() => {
    const shouldDownload = shouldDownloadRecordingRef.current
    const chunks = recordedChunksRef.current

    if (shouldDownload && chunks.length > 0) {
      const blob = new Blob(chunks, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const now = new Date()
      const pad = (value: number) => String(value).padStart(2, '0')
      const timestamp = [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate()),
        '-',
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds()),
      ].join('')
      const anchor = document.createElement('a')

      recordingObjectUrlRef.current = url
      anchor.href = url
      anchor.download = `shaderbook-live-recording-${timestamp}.webm`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      setRecordingMessage(null)
    } else if (shouldDownload) {
      setRecordingMessage('Recording did not produce any video data.')
    }

    cleanupRecordingRefs()
    setLiveRecordingStatus('idle')
    callbacksRef.current.onLiveRecordingChange(false)
  }, [cleanupRecordingRefs, setLiveRecordingStatus])

  const stopLiveRecording = useCallback(
    (options: { download: boolean } = { download: true }) => {
      const recorder = mediaRecorderRef.current

      if (!recorder || recordingStatusRef.current === 'idle') {
        cleanupRecordingRefs()
        setLiveRecordingStatus('idle')
        callbacksRef.current.onLiveRecordingChange(false)
        return
      }

      shouldDownloadRecordingRef.current = options.download
      setLiveRecordingStatus('stopping')

      if (recorder.state === 'inactive') {
        finishRecording()
        return
      }

      try {
        recorder.stop()
      } catch {
        cleanupRecordingRefs()
        setLiveRecordingStatus('error')
        callbacksRef.current.onLiveRecordingChange(false)
        setRecordingMessage('Unable to stop live recording.')
      }
    },
    [cleanupRecordingRefs, finishRecording, setLiveRecordingStatus],
  )

  const startLiveRecording = useCallback(() => {
    const canvas = canvasRef.current
    const currentGpu = gpuRef.current
    const captureStream = canvas?.captureStream
    const mediaRecorderConstructor = window.MediaRecorder

    setRecordingMessage(null)

    if (
      previewModeRef.current !== 'live' ||
      !canvas ||
      !currentGpu?.pipeline ||
      typeof captureStream !== 'function' ||
      typeof mediaRecorderConstructor !== 'function' ||
      !mediaRecorderConstructor.isTypeSupported('video/webm')
    ) {
      setLiveRecordingStatus('unsupported')
      callbacksRef.current.onLiveRecordingChange(false)
      setRecordingMessage('Live recording is not supported in this browser.')
      return
    }

    try {
      const stream = captureStream.call(canvas, 60)
      const recorder = new mediaRecorderConstructor(stream, { mimeType: 'video/webm' })

      recordedChunksRef.current = []
      recordingStreamRef.current = stream
      mediaRecorderRef.current = recorder
      shouldDownloadRecordingRef.current = false

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }
      recorder.onerror = () => {
        setRecordingMessage('Live recording failed.')
        stopLiveRecording({ download: false })
      }
      recorder.onstop = () => {
        finishRecording()
      }
      recorder.start()
      setLiveRecordingStatus('recording')
      callbacksRef.current.onLiveRecordingChange(true)
    } catch {
      cleanupRecordingRefs()
      setLiveRecordingStatus('error')
      callbacksRef.current.onLiveRecordingChange(false)
      setRecordingMessage('Unable to start live recording.')
    }
  }, [cleanupRecordingRefs, finishRecording, setLiveRecordingStatus, stopLiveRecording])

  const scheduleFlipbookRender = useCallback((reason: string) => {
    void reason

    if (previewModeRef.current !== 'flipbook' || deviceLostRef.current) {
      return
    }

    const currentGpu = gpuRef.current
    if (!currentGpu?.pipeline || pendingFlipbookFrameRef.current !== null) {
      return
    }

    const scheduledGeneration = displayGenerationRef.current
    pendingFlipbookFrameRef.current = requestAnimationFrame(() => {
      try {
        const canvas = canvasRef.current
        const latestGpu = gpuRef.current
        if (
          displayGenerationRef.current !== scheduledGeneration ||
          previewModeRef.current !== 'flipbook' ||
          deviceLostRef.current ||
          !canvas ||
          !latestGpu?.pipeline
        ) {
          return
        }

        destroyLatestFlipbookResources()
        const result = renderFlipbook({
          device: latestGpu.device,
          context: latestGpu.context,
          pipeline: latestGpu.pipeline,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          devicePixelRatio: window.devicePixelRatio || 1,
          settings: flipbookRef.current,
        })

        latestFlipbookResourcesRef.current = result.resources
        setLatestGrid(result.grid)
      } finally {
        pendingFlipbookFrameRef.current = null
      }
    })
  }, [destroyLatestFlipbookResources])

  const commitFlipbookDraft = useCallback(
    (draft: FlipbookDraft, options?: { scheduleRedraw?: boolean }) => {
      const normalizedSettings = normalizeFlipbookSettings(draft)
      const normalizedDraft = normalizeFlipbookDraft(normalizedSettings)

      flipbookRef.current = normalizedSettings
      if (!areFlipbookDraftsEqual(flipbookDraftRef.current, normalizedDraft)) {
        flipbookDraftRef.current = normalizedDraft
        setFlipbookDraft(normalizedDraft)
      }
      callbacksRef.current.onFlipbookChange(normalizedSettings)
      if (options?.scheduleRedraw !== false) {
        scheduleFlipbookRender('settings-change')
      }

      return { normalizedSettings, normalizedDraft }
    },
    [scheduleFlipbookRender],
  )

  const applyCanvasSize = useCallback(
    (frameSize: CanvasCssSize) => {
      const canvas = canvasRef.current
      const stage = stageRef.current
      if (!canvas || !stage) {
        return
      }

      frameCssSizeRef.current = frameSize
      const canvasCssSize = computeCanvasCssSize(
        frameSize.width,
        frameSize.height,
        previewAspectRatioRef.current,
      )
      const dpr = window.devicePixelRatio || 1
      const width = Math.max(1, Math.floor(canvasCssSize.width * dpr))
      const height = Math.max(1, Math.floor(canvasCssSize.height * dpr))

      stage.style.width = `${canvasCssSize.width}px`
      stage.style.height = `${canvasCssSize.height}px`
      canvas.width = width
      canvas.height = height
      callbacksRef.current.onResolutionChange(width, height)
      scheduleFlipbookRender('resize')
      renderLiveFrameOnce()
    },
    [renderLiveFrameOnce, scheduleFlipbookRender],
  )

  const compile = useCallback(async (wgslSourceCode: string) => {
    const currentGpu = gpuRef.current
    if (!currentGpu || deviceLostRef.current) {
      return
    }

    const myCompileSeq = ++compileSeqRef.current
    const myLifecycle = lifecycleGenerationRef.current

    try {
      const { wgsl } = wrapShader({ userCode: wgslSourceCode })
      const { pipeline, bindGroup } = await createShaderPipeline({
        device: currentGpu.device,
        format: currentGpu.format,
        wgsl,
        uniformBuffer: currentGpu.uniformBuffer,
        viewportOriginBuffer: currentGpu.viewportOriginBuffer,
      })

      if (
        compileSeqRef.current !== myCompileSeq ||
        lifecycleGenerationRef.current !== myLifecycle ||
        deviceLostRef.current
      ) {
        return
      }

      const latestGpu = gpuRef.current
      if (!latestGpu) {
        return
      }

      gpuRef.current = { ...latestGpu, pipeline, bindGroup }
      setIsPipelineReady(true)
      callbacksRef.current.onCompileSuccess()
      if (previewModeRef.current === 'flipbook') {
        scheduleFlipbookRender('compile-success')
      } else {
        startLivePlayback()
      }
    } catch (error) {
      if (
        compileSeqRef.current !== myCompileSeq ||
        lifecycleGenerationRef.current !== myLifecycle ||
        deviceLostRef.current
      ) {
        return
      }

      callbacksRef.current.onCompileError(getErrorMessage(error))
    }
  }, [scheduleFlipbookRender, startLivePlayback])

  const handlePreviewModeChange = useCallback(
    (nextMode: PreviewMode) => {
      if (recordingStatusRef.current === 'recording' || recordingStatusRef.current === 'stopping') {
        return
      }

      if (nextMode === previewModeRef.current) {
        return
      }

      displayGenerationRef.current += 1
      previewModeRef.current = nextMode
      handledPreviewModeChangeRef.current = nextMode

      if (nextMode === 'flipbook') {
        stopLiveLoop()
        const { normalizedSettings } = commitFlipbookDraft(flipbookDraftRef.current)
        callbacksRef.current.onPreviewModeChange('flipbook')
        flipbookRef.current = normalizedSettings
        scheduleFlipbookRender('mode-change')
        return
      }

      cancelPendingFlipbookRender()
      destroyLatestFlipbookResources()
      setLatestGrid(null)
      callbacksRef.current.onPreviewModeChange('live')
      startLivePlayback()
    },
    [
      cancelPendingFlipbookRender,
      commitFlipbookDraft,
      destroyLatestFlipbookResources,
      scheduleFlipbookRender,
      startLivePlayback,
      stopLiveLoop,
    ],
  )

  const handleFullscreenClick = useCallback(() => {
    if (recordingStatusRef.current === 'recording' || recordingStatusRef.current === 'stopping') {
      return
    }

    const frame = frameRef.current
    if (!frame) {
      return
    }

    const fullscreenElement = document.fullscreenElement
    const fullscreenPromise = fullscreenElement
      ? document.exitFullscreen()
      : frame.requestFullscreen()

    void fullscreenPromise.catch(() => {
      // The browser may reject fullscreen requests outside a trusted user gesture.
    })
  }, [])

  const handleLivePlaybackModeChange = useCallback(
    (nextPlaybackMode: LivePlaybackMode) => {
      if (recordingStatusRef.current === 'recording' || recordingStatusRef.current === 'stopping') {
        return
      }

      if (nextPlaybackMode === livePlaybackModeRef.current) {
        return
      }

      livePlaybackModeRef.current = nextPlaybackMode
      setLivePlaybackMode(nextPlaybackMode)
      callbacksRef.current.onLivePlaybackModeChange(nextPlaybackMode)

      if (previewModeRef.current !== 'live') {
        return
      }

      startLivePlayback()
    },
    [startLivePlayback],
  )

  const handleAspectRatioChange = useCallback(
    (nextAspectRatio: PreviewAspectRatio) => {
      if (recordingStatusRef.current === 'recording' || recordingStatusRef.current === 'stopping') {
        return
      }

      previewAspectRatioRef.current = nextAspectRatio
      callbacksRef.current.onPreviewAspectRatioChange(nextAspectRatio)
      if (frameCssSizeRef.current) {
        applyCanvasSize(frameCssSizeRef.current)
      }
    },
    [applyCanvasSize],
  )

  const handleDownloadFlipbookPngs = useCallback(async () => {
    const canvas = canvasRef.current
    const grid = latestGrid
    if (!canvas || !grid || grid.cells.length === 0) {
      return
    }

    await gpuRef.current?.device.queue.onSubmittedWorkDone?.()
    await downloadFlipbookFramesAsPngs({ sourceCanvas: canvas, grid })
  }, [latestGrid])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === frameRef.current)
      scheduleFlipbookRender('fullscreen')
      renderLiveFrameOnce()
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    handleFullscreenChange()

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [renderLiveFrameOnce, scheduleFlipbookRender])

  useEffect(() => {
    const previousSettings = flipbookRef.current
    flipbookRef.current = flipbook
    if (areFlipbookSettingsEqual(previousSettings, flipbook)) {
      return
    }

    const nextDraft = flipbookSettingsToDraft(flipbook)
    if (!areFlipbookDraftsEqual(flipbookDraftRef.current, nextDraft)) {
      flipbookDraftRef.current = nextDraft
      setFlipbookDraft(nextDraft)
    }
  }, [flipbook])

  useEffect(() => {
    previewAspectRatioRef.current = previewAspectRatio
    if (frameCssSizeRef.current) {
      applyCanvasSize(frameCssSizeRef.current)
    }
  }, [applyCanvasSize, previewAspectRatio])

  useEffect(() => {
    if (isFirstPreviewModeEffectRef.current) {
      isFirstPreviewModeEffectRef.current = false
      return
    }

    if (handledPreviewModeChangeRef.current === previewMode) {
      handledPreviewModeChangeRef.current = null
      return
    }

    previewModeRef.current = previewMode
    displayGenerationRef.current += 1

    if (
      previewMode !== 'live' &&
      (recordingStatusRef.current === 'recording' || recordingStatusRef.current === 'stopping')
    ) {
      stopLiveRecording({ download: true })
    }

    if (previewMode === 'live') {
      cancelPendingFlipbookRender()
      destroyLatestFlipbookResources()
      setLatestGrid(null)
      startLivePlayback()
      return
    }

    stopLiveLoop()
    scheduleFlipbookRender('mode-change')
  }, [
    cancelPendingFlipbookRender,
    destroyLatestFlipbookResources,
    previewMode,
    scheduleFlipbookRender,
    startLivePlayback,
    stopLiveRecording,
    stopLiveLoop,
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    const frame = frameRef.current
    if (!canvas || !frame) {
      return
    }

    const myLifecycle = ++lifecycleGenerationRef.current
    let resizeObserver: ResizeObserver | null = null

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      if (recordingStatusRef.current === 'recording') {
        stopLiveRecording({ download: true })
      }

      applyCanvasSize(getFrameCssSize(entry))
    })
    resizeObserver.observe(frame)

    const initialize = async () => {
      try {
        const webgpu = await createWebGPUContext(canvas)

        if (lifecycleGenerationRef.current !== myLifecycle) {
          displayGenerationRef.current += 1
          webgpu.device.destroy()
          return
        }

        deviceLostRef.current = false
        setPreviewMessage(null)
        callbacksRef.current.onGpuInfo(getGpuName(webgpu.adapterInfo))

        const uniformBuffer = createUniformBuffer(webgpu.device)
        const viewportOriginBuffer = createViewportOriginBuffer(webgpu.device)
        writeViewportOrigin(viewportOriginBuffer, webgpu.device, 0, 0, 0)
        gpuRef.current = {
          device: webgpu.device,
          context: webgpu.context,
          format: webgpu.format,
          uniformBuffer,
          viewportOriginBuffer,
          pipeline: null,
          bindGroup: null,
        }
        setIsPipelineReady(false)

        await compile(codeRef.current)

        if (lifecycleGenerationRef.current !== myLifecycle) {
          return
        }

        if (previewModeRef.current === 'live') {
          startLivePlayback()
        } else {
          scheduleFlipbookRender('initial')
        }

        webgpu.device.lost.then((info) => {
          if (lifecycleGenerationRef.current !== myLifecycle || info.reason === 'destroyed') {
            return
          }

          deviceLostRef.current = true
          displayGenerationRef.current += 1
          setIsPipelineReady(false)
          stopLiveRecording({ download: false })
          stopLiveLoop()
          cancelPendingFlipbookRender()
          destroyLatestFlipbookResources()
          setPreviewMessage(deviceLostMessage)
        })
      } catch {
        if (lifecycleGenerationRef.current !== myLifecycle) {
          return
        }

        setPreviewMessage(webgpuUnsupportedMessage)
      }
    }

    void initialize()

    return () => {
      lifecycleGenerationRef.current += 1
      displayGenerationRef.current += 1
      stopLiveRecording({ download: false })
      stopLiveLoop()
      cancelPendingFlipbookRender()
      destroyLatestFlipbookResources()
      resizeObserver?.disconnect()
      gpuRef.current?.device.destroy()
      gpuRef.current = null
      setIsPipelineReady(false)
    }
  }, [
    applyCanvasSize,
    cancelPendingFlipbookRender,
    compile,
    destroyLatestFlipbookResources,
    startLivePlayback,
    stopLiveRecording,
    stopLiveLoop,
  ])

  useEffect(() => {
    if (isFirstRunEffectRef.current) {
      isFirstRunEffectRef.current = false
      return
    }

    if (recordingStatusRef.current === 'recording' || recordingStatusRef.current === 'stopping') {
      return
    }

    if (previewModeRef.current === 'flipbook') {
      commitFlipbookDraft(flipbookDraftRef.current, { scheduleRedraw: false })
    }

    if (gpuRef.current && !deviceLostRef.current) {
      void compile(codeRef.current)
    }
  }, [commitFlipbookDraft, compile, shouldCompile])

  return (
    <section className="panel preview-pane" aria-labelledby="preview-title">
      <div className="panel-header preview-header">
        <h2 id="preview-title">Preview</h2>
        <div className="preview-tools">
          <PreviewModeControl
            value={previewMode}
            onChange={handlePreviewModeChange}
            disabled={recordingStatus === 'recording' || recordingStatus === 'stopping'}
          />
          {previewMode === 'flipbook' ? (
            <FlipbookControls
              settings={flipbook}
              draft={flipbookDraft}
              onDraftChange={(draft) => {
                flipbookDraftRef.current = draft
                setFlipbookDraft(draft)
              }}
              onCommit={(_settings, draft) => {
                commitFlipbookDraft(draft)
              }}
            />
          ) : null}
          {previewMode === 'flipbook' ? (
            <button
              type="button"
              className="control-button"
              aria-label="Download flipbook frames as PNG files"
              disabled={!latestGrid || latestGrid.cells.length === 0}
              onClick={() => {
                void handleDownloadFlipbookPngs()
              }}
            >
              Download PNGs
            </button>
          ) : null}
          {previewMode === 'live' ? (
            <select
              className="control-select"
              aria-label="Live playback mode"
              value={livePlaybackMode}
              disabled={recordingStatus === 'recording' || recordingStatus === 'stopping'}
              onChange={(event) =>
                handleLivePlaybackModeChange(event.currentTarget.value as LivePlaybackMode)
              }
            >
              <option value="loop">Loop</option>
              <option value="once">Once</option>
            </select>
          ) : null}
          <select
            className="control-select"
            aria-label="Preview aspect ratio"
            value={previewAspectRatio}
            disabled={recordingStatus === 'recording' || recordingStatus === 'stopping'}
            onChange={(event) =>
              handleAspectRatioChange(event.currentTarget.value as PreviewAspectRatio)
            }
          >
            <option value="fit">Fit</option>
            <option value="1:1">1:1</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
          </select>
          {previewMode === 'live' && livePlaybackMode === 'loop' ? (
            <button
              type="button"
              className="control-button"
              aria-label={isLiveRendering ? 'Stop render' : 'Resume render'}
              aria-pressed={isLiveRendering}
              disabled={
                !isPipelineReady ||
                recordingStatus === 'recording' ||
                recordingStatus === 'stopping'
              }
              onClick={() => {
                if (isLiveRendering) {
                  stopLiveLoop()
                } else {
                  startLiveLoop()
                }
              }}
            >
              {isLiveRendering ? 'Stop Render' : 'Resume Render'}
            </button>
          ) : null}
          {previewMode === 'live' ? (
            <button
              type="button"
              className="control-button"
              aria-label={
                recordingStatus === 'recording'
                  ? 'Stop live recording'
                  : recordingStatus === 'stopping'
                    ? 'Saving live recording'
                    : 'Start live recording'
              }
              aria-pressed={recordingStatus === 'recording'}
              disabled={
                livePlaybackMode === 'once' ||
                recordingStatus === 'stopping' ||
                recordingStatus === 'unsupported' ||
                (recordingStatus !== 'recording' && !isPipelineReady)
              }
              onClick={() => {
                if (recordingStatus === 'recording') {
                  stopLiveRecording({ download: true })
                } else {
                  startLiveLoop()
                  startLiveRecording()
                }
              }}
            >
              {recordingStatus === 'recording'
                ? 'Stop'
                : recordingStatus === 'stopping'
                  ? 'Saving...'
                  : 'Record'}
            </button>
          ) : null}
          <button
            type="button"
            className="control-button"
            aria-label={isFullscreen ? 'Exit fullscreen preview' : 'Enter fullscreen preview'}
            disabled={recordingStatus === 'recording' || recordingStatus === 'stopping'}
            onClick={handleFullscreenClick}
          >
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>
      <div ref={frameRef} className="canvas-frame">
        {previewMessage ? (
          <div className="preview-message" role="status">
            {previewMessage}
          </div>
        ) : (
          <div ref={stageRef} className="canvas-stage">
            <canvas
              className="preview-canvas"
              ref={canvasRef}
              aria-label={
                previewMode === 'flipbook'
                  ? 'WebGPU shader flipbook preview'
                  : 'WebGPU shader preview'
              }
            />
            {recordingMessage ? (
              <div className="recording-message" role="status">
                {recordingMessage}
              </div>
            ) : null}
            {previewMode === 'flipbook' ? (
              <FlipbookLabels grid={latestGrid} devicePixelRatio={window.devicePixelRatio || 1} />
            ) : null}
          </div>
        )}
      </div>
    </section>
  )
}
