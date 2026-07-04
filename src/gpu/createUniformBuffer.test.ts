import { describe, expect, it, vi } from 'vitest'
import { createUniformBuffer, updateUniforms } from './createUniformBuffer'

describe('createUniformBuffer', () => {
  it('creates a 16-byte uniform buffer with copy destination usage', () => {
    const buffer = { label: 'buffer' }
    const device = {
      createBuffer: vi.fn(() => buffer),
    }

    expect(createUniformBuffer(device as unknown as GPUDevice)).toBe(buffer)
    expect(device.createBuffer).toHaveBeenCalledWith({
      label: 'Shader uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
  })
})

describe('updateUniforms', () => {
  it('writes time, padding, width, and height as a Float32Array', () => {
    const buffer = { label: 'buffer' } as unknown as GPUBuffer
    const writeBuffer = vi.fn()
    const device = {
      queue: { writeBuffer },
    } as unknown as GPUDevice

    updateUniforms(buffer, device, 1.25, 1280, 720)

    expect(writeBuffer).toHaveBeenCalledTimes(1)
    const [writtenBuffer, offset, data] = writeBuffer.mock.calls[0]
    expect(writtenBuffer).toBe(buffer)
    expect(offset).toBe(0)
    expect(data).toBeInstanceOf(Float32Array)
    expect(Array.from(data as Float32Array)).toEqual([1.25, 0, 1280, 720])
  })
})
