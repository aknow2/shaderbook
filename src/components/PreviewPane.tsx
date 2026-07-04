import { useCallback, useEffect, useRef, useState } from 'react'
import { createShaderPipeline } from '../gpu/createShaderPipeline'
import { createUniformBuffer } from '../gpu/createUniformBuffer'
import { createWebGPUContext } from '../gpu/createWebGPUContext'
import {
  startRenderLoop,
  type RenderLoopController,
  type RenderLoopGpuState,
} from '../gpu/renderLoop'
import { wrapShader } from '../gpu/shaderWrapper'

const webgpuUnsupportedMessage =
  'WebGPU is not supported in this browser. Please use a browser that supports WebGPU.'
const deviceLostMessage = 'GPU device was lost. Please reload the page.'

type GpuState = {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
  uniformBuffer: GPUBuffer
} & (
  | { pipeline: null; bindGroup: null }
  | { pipeline: GPURenderPipeline; bindGroup: GPUBindGroup }
)

export type PreviewPaneProps = {
  code: string
  shouldCompile: boolean
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

export function PreviewPane({
  code,
  shouldCompile,
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
  const lifecycleGenerationRef = useRef(0)
  const compileSeqRef = useRef(0)
  const codeRef = useRef(code)
  const callbacksRef = useRef({
    onCompileSuccess,
    onCompileError,
    onFpsChange,
    onResolutionChange,
    onGpuInfo,
  })
  const [previewMessage, setPreviewMessage] = useState<string | null>(null)

  codeRef.current = code
  callbacksRef.current = {
    onCompileSuccess,
    onCompileError,
    onFpsChange,
    onResolutionChange,
    onGpuInfo,
  }

  const compile = useCallback(async (wgslSourceCode: string) => {
    const currentGpu = gpuRef.current
    if (!currentGpu) {
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
      })

      if (
        compileSeqRef.current !== myCompileSeq ||
        lifecycleGenerationRef.current !== myLifecycle
      ) {
        return
      }

      const latestGpu = gpuRef.current
      if (!latestGpu) {
        return
      }

      gpuRef.current = { ...latestGpu, pipeline, bindGroup }
      callbacksRef.current.onCompileSuccess()
    } catch (error) {
      if (
        compileSeqRef.current !== myCompileSeq ||
        lifecycleGenerationRef.current !== myLifecycle
      ) {
        return
      }

      callbacksRef.current.onCompileError(getErrorMessage(error))
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const frame = frameRef.current
    if (!canvas || !frame) {
      return
    }

    const myLifecycle = ++lifecycleGenerationRef.current
    let renderLoop: RenderLoopController | null = null
    let resizeObserver: ResizeObserver | null = null

    const applyResolution = (width: number, height: number) => {
      canvas.width = width
      canvas.height = height
      callbacksRef.current.onResolutionChange(width, height)
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
          webgpu.device.destroy()
          return
        }

        setPreviewMessage(null)
        callbacksRef.current.onGpuInfo(getGpuName(webgpu.adapterInfo))

        const uniformBuffer = createUniformBuffer(webgpu.device)
        gpuRef.current = {
          device: webgpu.device,
          context: webgpu.context,
          format: webgpu.format,
          uniformBuffer,
          pipeline: null,
          bindGroup: null,
        }

        await compile(codeRef.current)

        if (lifecycleGenerationRef.current !== myLifecycle) {
          return
        }

        renderLoop = startRenderLoop({
          getGpuState: () => gpuRef.current as RenderLoopGpuState | null,
          getResolution: () => ({
            width: canvas.width,
            height: canvas.height,
          }),
          onFpsChange: (fps) => callbacksRef.current.onFpsChange(fps),
        })

        webgpu.device.lost.then((info) => {
          if (lifecycleGenerationRef.current !== myLifecycle || info.reason === 'destroyed') {
            return
          }

          renderLoop?.stop()
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
      renderLoop?.stop()
      resizeObserver?.disconnect()
      gpuRef.current?.device.destroy()
      gpuRef.current = null
    }
  }, [compile])

  useEffect(() => {
    if (isFirstRunEffectRef.current) {
      isFirstRunEffectRef.current = false
      return
    }

    if (gpuRef.current) {
      void compile(codeRef.current)
    }
  }, [compile, shouldCompile])

  return (
    <section className="panel preview-pane" aria-labelledby="preview-title">
      <div className="panel-header preview-header">
        <h2 id="preview-title">Preview</h2>
        <div className="preview-tools">
          <button type="button" className="control-button" aria-label="Preview scale: Fit">
            Fit
          </button>
          <button type="button" className="control-button" aria-label="Fullscreen preview">
            Fullscreen
          </button>
        </div>
      </div>
      <div ref={frameRef} className="canvas-frame">
        {previewMessage ? (
          <div className="preview-message" role="status">
            {previewMessage}
          </div>
        ) : (
          <canvas ref={canvasRef} aria-label="WebGPU shader preview" />
        )}
      </div>
    </section>
  )
}
