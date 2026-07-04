import { describe, expect, it, vi } from 'vitest'
import { createWebGPUContext } from './createWebGPUContext'

function setNavigatorGpu(gpu: unknown) {
  Object.defineProperty(navigator, 'gpu', {
    configurable: true,
    value: gpu,
  })
}

describe('createWebGPUContext', () => {
  it('throws when navigator.gpu is unavailable', async () => {
    setNavigatorGpu(undefined)

    await expect(createWebGPUContext(document.createElement('canvas'))).rejects.toThrow(
      'WebGPU is not supported in this browser',
    )
  })

  it('throws when requestAdapter returns null', async () => {
    setNavigatorGpu({
      requestAdapter: vi.fn().mockResolvedValue(null),
      getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
    })

    await expect(createWebGPUContext(document.createElement('canvas'))).rejects.toThrow(
      'No suitable GPU adapter found',
    )
  })

  it('returns device, context, format, and adapterInfo and configures the canvas context', async () => {
    const device = { label: 'device' }
    const adapterInfo = { description: 'Mock GPU' }
    const adapter = {
      info: adapterInfo,
      requestDevice: vi.fn().mockResolvedValue(device),
    }
    const context = { configure: vi.fn() }
    const canvas = document.createElement('canvas')
    const getContext = vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as GPUCanvasContext)
    setNavigatorGpu({
      requestAdapter: vi.fn().mockResolvedValue(adapter),
      getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
    })

    await expect(createWebGPUContext(canvas)).resolves.toEqual({
      device,
      context,
      format: 'bgra8unorm',
      adapterInfo,
    })
    expect(getContext).toHaveBeenCalledWith('webgpu')
    expect(context.configure).toHaveBeenCalledWith({
      device,
      format: 'bgra8unorm',
      alphaMode: 'premultiplied',
    })
  })
})
