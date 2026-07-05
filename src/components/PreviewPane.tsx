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
  startRenderLoop,
  type RenderLoopController,
  type RenderLoopGpuState,
} from '../gpu/renderLoop'
import { wrapShader } from '../gpu/shaderWrapper'
import type { FlipbookSettings, PreviewMode } from '../types/preview'
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

export type PreviewPaneProps = {
  code: string
  shouldCompile: boolean
  previewMode: PreviewMode
  flipbook: FlipbookSettings
  onPreviewModeChange: (mode: PreviewMode) => void
  onFlipbookChange: (settings: FlipbookSettings) => void
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

function getResizeSize(entry: ResizeObserverEntry): { width: number; height: number } {
  const boxSize = entry.devicePixelContentBoxSize?.[0]
  if (boxSize) {
    return {
      width: Math.max(1, Math.floor(boxSize.inlineSize)),
      height: Math.max(1, Math.floor(boxSize.blockSize)),
    }
  }

  const dpr = window.devicePixelRatio || 1
  return {
    width: Math.max(1, Math.floor(entry.contentRect.width * dpr)),
    height: Math.max(1, Math.floor(entry.contentRect.height * dpr)),
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
  flipbook,
  onPreviewModeChange,
  onFlipbookChange,
  onCompileSuccess,
  onCompileError,
  onFpsChange,
  onResolutionChange,
  onGpuInfo,
}: PreviewPaneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const gpuRef = useRef<GpuState | null>(null)
  const isFirstRunEffectRef = useRef(true)
  const isFirstPreviewModeEffectRef = useRef(true)
  const lifecycleGenerationRef = useRef(0)
  const compileSeqRef = useRef(0)
  const codeRef = useRef(code)
  const previewModeRef = useRef(previewMode)
  const flipbookRef = useRef(flipbook)
  const renderLoopRef = useRef<RenderLoopController | null>(null)
  const pendingFlipbookFrameRef = useRef<number | null>(null)
  const handledPreviewModeChangeRef = useRef<PreviewMode | null>(null)
  const displayGenerationRef = useRef(0)
  const latestFlipbookResourcesRef = useRef<FlipbookFrameResources | null>(null)
  const deviceLostRef = useRef(false)
  const callbacksRef = useRef({
    onPreviewModeChange,
    onFlipbookChange,
    onCompileSuccess,
    onCompileError,
    onFpsChange,
    onResolutionChange,
    onGpuInfo,
  })
  const [previewMessage, setPreviewMessage] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [flipbookDraft, setFlipbookDraft] = useState<FlipbookDraft>(() =>
    flipbookSettingsToDraft(flipbook),
  )
  const flipbookDraftRef = useRef(flipbookDraft)
  const [latestGrid, setLatestGrid] = useState<FlipbookGrid | null>(null)

  codeRef.current = code
  previewModeRef.current = previewMode
  flipbookDraftRef.current = flipbookDraft
  callbacksRef.current = {
    onPreviewModeChange,
    onFlipbookChange,
    onCompileSuccess,
    onCompileError,
    onFpsChange,
    onResolutionChange,
    onGpuInfo,
  }

  const stopLiveLoop = useCallback(() => {
    renderLoopRef.current?.stop()
    renderLoopRef.current = null
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
  }, [])

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
      callbacksRef.current.onCompileSuccess()
      if (previewModeRef.current === 'flipbook') {
        scheduleFlipbookRender('compile-success')
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
  }, [scheduleFlipbookRender])

  const handlePreviewModeChange = useCallback(
    (nextMode: PreviewMode) => {
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
      startLiveLoop()
    },
    [
      cancelPendingFlipbookRender,
      commitFlipbookDraft,
      destroyLatestFlipbookResources,
      scheduleFlipbookRender,
      startLiveLoop,
      stopLiveLoop,
    ],
  )

  const handleFullscreenClick = useCallback(() => {
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
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    handleFullscreenChange()

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [scheduleFlipbookRender])

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

    if (previewMode === 'live') {
      cancelPendingFlipbookRender()
      destroyLatestFlipbookResources()
      setLatestGrid(null)
      startLiveLoop()
      return
    }

    stopLiveLoop()
    scheduleFlipbookRender('mode-change')
  }, [
    cancelPendingFlipbookRender,
    destroyLatestFlipbookResources,
    previewMode,
    scheduleFlipbookRender,
    startLiveLoop,
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

    const applyResolution = (width: number, height: number) => {
      canvas.width = width
      canvas.height = height
      callbacksRef.current.onResolutionChange(width, height)
      scheduleFlipbookRender('resize')
    }

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      const { width, height } = getResizeSize(entry)
      applyResolution(width, height)
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

        await compile(codeRef.current)

        if (lifecycleGenerationRef.current !== myLifecycle) {
          return
        }

        if (previewModeRef.current === 'live') {
          startLiveLoop()
        } else {
          scheduleFlipbookRender('initial')
        }

        webgpu.device.lost.then((info) => {
          if (lifecycleGenerationRef.current !== myLifecycle || info.reason === 'destroyed') {
            return
          }

          deviceLostRef.current = true
          displayGenerationRef.current += 1
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
      stopLiveLoop()
      cancelPendingFlipbookRender()
      destroyLatestFlipbookResources()
      resizeObserver?.disconnect()
      gpuRef.current?.device.destroy()
      gpuRef.current = null
    }
  }, [
    cancelPendingFlipbookRender,
    compile,
    destroyLatestFlipbookResources,
    scheduleFlipbookRender,
    startLiveLoop,
    stopLiveLoop,
  ])

  useEffect(() => {
    if (isFirstRunEffectRef.current) {
      isFirstRunEffectRef.current = false
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
          <PreviewModeControl value={previewMode} onChange={handlePreviewModeChange} />
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
          <select className="control-select" aria-label="Preview scale" defaultValue="fit">
            <option value="fit">Fit</option>
          </select>
          <button
            type="button"
            className="control-button"
            aria-label={isFullscreen ? 'Exit fullscreen preview' : 'Enter fullscreen preview'}
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
          <>
            <canvas
              ref={canvasRef}
              aria-label={
                previewMode === 'flipbook'
                  ? 'WebGPU shader flipbook preview'
                  : 'WebGPU shader preview'
              }
            />
            {previewMode === 'flipbook' ? (
              <FlipbookLabels grid={latestGrid} devicePixelRatio={window.devicePixelRatio || 1} />
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
