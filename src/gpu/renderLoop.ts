import { updateUniforms } from './createUniformBuffer'

export type RenderLoopGpuState = {
  device: GPUDevice
  context: GPUCanvasContext
  uniformBuffer: GPUBuffer
  viewportOriginBuffer: GPUBuffer
} & (
  | { pipeline: null; bindGroup: null }
  | { pipeline: GPURenderPipeline; bindGroup: GPUBindGroup }
)

export type RenderLoopController = {
  stop: () => void
}

export type StartRenderLoopInput = {
  getGpuState: () => RenderLoopGpuState | null
  getResolution: () => { width: number; height: number }
  onFpsChange: (fps: number) => void
}

export type RenderFrameInput = {
  gpuState: RenderLoopGpuState
  timeSeconds: number
  width: number
  height: number
}

export function renderFrame({ gpuState, timeSeconds, width, height }: RenderFrameInput): void {
  if (!gpuState.pipeline) {
    return
  }

  updateUniforms(gpuState.uniformBuffer, gpuState.device, timeSeconds, width, height)

  const encoder = gpuState.device.createCommandEncoder()
  const view = gpuState.context.getCurrentTexture().createView()
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  })

  pass.setPipeline(gpuState.pipeline)
  pass.setBindGroup(0, gpuState.bindGroup)
  pass.draw(3)
  pass.end()
  gpuState.device.queue.submit([encoder.finish()])
}

export function startRenderLoop({
  getGpuState,
  getResolution,
  onFpsChange,
}: StartRenderLoopInput): RenderLoopController {
  let animationFrameId: number | null = null
  let stopped = false
  const startTime = performance.now()
  let lastFpsTime = startTime
  let frameCount = 0

  const frame = () => {
    if (stopped) {
      return
    }

    const now = performance.now()
    frameCount += 1

    const gpuState = getGpuState()
    if (gpuState?.pipeline) {
      const { width, height } = getResolution()
      renderFrame({ gpuState, timeSeconds: (now - startTime) / 1000, width, height })
    }

    const fpsElapsed = now - lastFpsTime
    if (fpsElapsed >= 500) {
      onFpsChange((frameCount * 1000) / fpsElapsed)
      frameCount = 0
      lastFpsTime = now
    }

    animationFrameId = requestAnimationFrame(frame)
  }

  animationFrameId = requestAnimationFrame(frame)

  return {
    stop() {
      stopped = true
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
    },
  }
}
