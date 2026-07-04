import { describe, expect, it, vi } from 'vitest'
import { createShaderPipeline } from './createShaderPipeline'

function createDeviceMock(options?: {
  compilationMessages?: GPUCompilationMessage[]
  pipelineScopeError?: GPUError | null
  bindGroupScopeError?: GPUError | null
  createBindGroupThrows?: Error
}) {
  const shaderModule = {
    getCompilationInfo: vi.fn().mockResolvedValue({ messages: options?.compilationMessages ?? [] }),
  }
  const bindGroupLayout = { label: 'bind group layout' }
  const pipeline = {
    getBindGroupLayout: vi.fn(() => bindGroupLayout),
  }
  const bindGroup = { label: 'bind group' }
  const popErrors = [options?.pipelineScopeError ?? null, options?.bindGroupScopeError ?? null]
  const device = {
    createShaderModule: vi.fn(() => shaderModule),
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn(() => Promise.resolve(popErrors.shift() ?? null)),
    createRenderPipelineAsync: vi.fn(() => Promise.resolve(pipeline)),
    createBindGroup: vi.fn(() => {
      if (options?.createBindGroupThrows) {
        throw options.createBindGroupThrows
      }
      return bindGroup
    }),
  }

  return { device, shaderModule, pipeline, bindGroup, bindGroupLayout }
}

describe('createShaderPipeline', () => {
  it('returns a pipeline and bind group on success', async () => {
    const uniformBuffer = { label: 'uniform buffer' } as unknown as GPUBuffer
    const { device, pipeline, bindGroup, bindGroupLayout } = createDeviceMock()

    await expect(
      createShaderPipeline({
        device: device as unknown as GPUDevice,
        format: 'bgra8unorm',
        wgsl: 'wrapped wgsl',
        uniformBuffer,
      }),
    ).resolves.toEqual({ pipeline, bindGroup })

    expect(device.createShaderModule).toHaveBeenCalledWith({ code: 'wrapped wgsl' })
    expect(device.createRenderPipelineAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: 'auto',
        vertex: expect.objectContaining({ entryPoint: 'vertexMain' }),
        fragment: expect.objectContaining({
          entryPoint: 'fragmentMain',
          targets: [{ format: 'bgra8unorm' }],
        }),
      }),
    )
    expect(pipeline.getBindGroupLayout).toHaveBeenCalledWith(0)
    expect(device.createBindGroup).toHaveBeenCalledWith({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    })
    expect(device.pushErrorScope).toHaveBeenCalledTimes(2)
    expect(device.popErrorScope).toHaveBeenCalledTimes(2)
  })

  it('throws when getCompilationInfo returns an error message', async () => {
    const { device } = createDeviceMock({
      compilationMessages: [{ type: 'error', message: 'bad shader' } as GPUCompilationMessage],
    })

    await expect(
      createShaderPipeline({
        device: device as unknown as GPUDevice,
        format: 'bgra8unorm',
        wgsl: 'broken wgsl',
        uniformBuffer: {} as GPUBuffer,
      }),
    ).rejects.toThrow('bad shader')
    expect(device.pushErrorScope).not.toHaveBeenCalled()
    expect(device.popErrorScope).not.toHaveBeenCalled()
  })

  it('throws when pipeline validation reports a GPUValidationError', async () => {
    const { device } = createDeviceMock({
      pipelineScopeError: new GPUValidationError('pipeline invalid'),
    })

    await expect(
      createShaderPipeline({
        device: device as unknown as GPUDevice,
        format: 'bgra8unorm',
        wgsl: 'wrapped wgsl',
        uniformBuffer: {} as GPUBuffer,
      }),
    ).rejects.toThrow('pipeline invalid')
  })

  it('throws when bind group validation reports a GPUValidationError', async () => {
    const { device } = createDeviceMock({
      bindGroupScopeError: new GPUValidationError('bind group invalid'),
    })

    await expect(
      createShaderPipeline({
        device: device as unknown as GPUDevice,
        format: 'bgra8unorm',
        wgsl: 'wrapped wgsl',
        uniformBuffer: {} as GPUBuffer,
      }),
    ).rejects.toThrow('bind group invalid')
  })

  it('balances pushErrorScope and popErrorScope even when createBindGroup throws', async () => {
    const { device } = createDeviceMock({
      createBindGroupThrows: new Error('createBindGroup exploded'),
    })

    await expect(
      createShaderPipeline({
        device: device as unknown as GPUDevice,
        format: 'bgra8unorm',
        wgsl: 'wrapped wgsl',
        uniformBuffer: {} as GPUBuffer,
      }),
    ).rejects.toThrow('createBindGroup exploded')

    expect(device.pushErrorScope).toHaveBeenCalledTimes(device.popErrorScope.mock.calls.length)
    expect(device.pushErrorScope).toHaveBeenCalledTimes(2)
  })
})
