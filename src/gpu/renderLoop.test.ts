import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startRenderLoop, type RenderLoopGpuState } from './renderLoop'

type RafCallback = FrameRequestCallback

function installRafMock() {
  let nextId = 1
  const callbacks = new Map<number, RafCallback>()
  const requestAnimationFrame = vi.fn((callback: RafCallback) => {
    const id = nextId
    nextId += 1
    callbacks.set(id, callback)
    return id
  })
  const cancelAnimationFrame = vi.fn((id: number) => {
    callbacks.delete(id)
  })
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

  return {
    requestAnimationFrame,
    cancelAnimationFrame,
    runFrame(id?: number) {
      const frameId = id ?? Math.max(...callbacks.keys())
      const callback = callbacks.get(frameId)
      callbacks.delete(frameId)
      callback?.(0)
    },
  }
}

function createGpuState(pipeline: GPURenderPipeline | null): {
  calls: string[]
  state: RenderLoopGpuState
} {
  const calls: string[] = []
  const pass = {
    setPipeline: vi.fn(() => calls.push('setPipeline')),
    setBindGroup: vi.fn(() => calls.push('setBindGroup')),
    draw: vi.fn(() => calls.push('draw')),
    end: vi.fn(() => calls.push('end')),
  }
  const encoder = {
    beginRenderPass: vi.fn(() => {
      calls.push('beginRenderPass')
      return pass
    }),
    finish: vi.fn(() => {
      calls.push('finish')
      return { label: 'command buffer' }
    }),
  }
  const device = {
    createCommandEncoder: vi.fn(() => {
      calls.push('createCommandEncoder')
      return encoder
    }),
    queue: {
      writeBuffer: vi.fn(() => calls.push('writeBuffer')),
      submit: vi.fn(() => calls.push('submit')),
    },
  }
  const context = {
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => {
        calls.push('createView')
        return { label: 'view' }
      }),
    })),
  }
  const baseState = {
    device: device as unknown as GPUDevice,
    context: context as unknown as GPUCanvasContext,
    uniformBuffer: {} as GPUBuffer,
  }

  return {
    calls,
    state:
      pipeline === null
        ? { ...baseState, pipeline: null, bindGroup: null }
        : { ...baseState, pipeline, bindGroup: { label: 'bind group' } as unknown as GPUBindGroup },
  }
}

describe('startRenderLoop', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('continues the loop but skips render pass work when pipeline is null', () => {
    const raf = installRafMock()
    const { calls, state } = createGpuState(null)

    startRenderLoop({
      getGpuState: () => state,
      getResolution: () => ({ width: 640, height: 360 }),
      onFpsChange: vi.fn(),
    })
    raf.runFrame()

    expect(calls).not.toContain('beginRenderPass')
    expect(calls).not.toContain('setPipeline')
    expect(calls).not.toContain('draw')
    expect(calls).not.toContain('submit')
    expect(raf.requestAnimationFrame).toHaveBeenCalledTimes(2)
  })

  it('updates uniforms, renders a full-screen triangle, and submits commands when pipeline exists', () => {
    const raf = installRafMock()
    const pipeline = { label: 'pipeline' } as unknown as GPURenderPipeline
    const { calls, state } = createGpuState(pipeline)

    startRenderLoop({
      getGpuState: () => state,
      getResolution: () => ({ width: 800, height: 600 }),
      onFpsChange: vi.fn(),
    })
    raf.runFrame()

    expect(calls).toEqual([
      'writeBuffer',
      'createCommandEncoder',
      'createView',
      'beginRenderPass',
      'setPipeline',
      'setBindGroup',
      'draw',
      'end',
      'finish',
      'submit',
    ])
  })

  it('does not advance frames after stop', () => {
    const raf = installRafMock()
    const { calls, state } = createGpuState({ label: 'pipeline' } as unknown as GPURenderPipeline)

    const loop = startRenderLoop({
      getGpuState: () => state,
      getResolution: () => ({ width: 800, height: 600 }),
      onFpsChange: vi.fn(),
    })
    loop.stop()
    raf.runFrame()

    expect(calls).toEqual([])
    expect(raf.cancelAnimationFrame).toHaveBeenCalledTimes(1)
  })

  it('calls onFpsChange every 0.5 to 1 second with a finite FPS value', () => {
    const raf = installRafMock()
    const onFpsChange = vi.fn()
    const { state } = createGpuState(null)
    const nowSpy = vi.spyOn(performance, 'now')
    nowSpy.mockReturnValueOnce(0).mockReturnValueOnce(200).mockReturnValueOnce(400).mockReturnValueOnce(700)

    startRenderLoop({
      getGpuState: () => state,
      getResolution: () => ({ width: 800, height: 600 }),
      onFpsChange,
    })
    raf.runFrame()
    raf.runFrame()
    raf.runFrame()

    expect(onFpsChange).toHaveBeenCalledTimes(1)
    const fps = onFpsChange.mock.calls[0][0] as number
    expect(fps).toBeGreaterThan(0)
    expect(Number.isFinite(fps)).toBe(true)
  })
})
