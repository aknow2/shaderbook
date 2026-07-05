import { describe, expect, it, vi } from 'vitest'
import {
  alignUniformStride,
  createUniformBuffer,
  createViewportOriginBuffer,
  updateUniforms,
  writeUserUniforms,
  writeViewportOrigin,
} from './createUniformBuffer'

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
  it('keeps the existing signature and writes user uniforms at offset 0', () => {
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

describe('writeUserUniforms', () => {
  it('writes time, padding, width, and height at an arbitrary offset', () => {
    const buffer = { label: 'buffer' } as unknown as GPUBuffer
    const writeBuffer = vi.fn()
    const device = {
      queue: { writeBuffer },
    } as unknown as GPUDevice

    writeUserUniforms(buffer, device, 256, 2.5, 320, 240)

    const [writtenBuffer, offset, data] = writeBuffer.mock.calls[0]
    expect(writtenBuffer).toBe(buffer)
    expect(offset).toBe(256)
    expect(Array.from(data as Float32Array)).toEqual([2.5, 0, 320, 240])
  })
})

describe('createViewportOriginBuffer', () => {
  it('creates an 8-byte viewport origin uniform buffer', () => {
    const buffer = { label: 'viewport origin buffer' }
    const device = {
      createBuffer: vi.fn(() => buffer),
    }

    expect(createViewportOriginBuffer(device as unknown as GPUDevice)).toBe(buffer)
    expect(device.createBuffer).toHaveBeenCalledWith({
      label: 'Viewport origin uniforms',
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
  })
})

describe('writeViewportOrigin', () => {
  it('writes x and y at an arbitrary offset', () => {
    const buffer = { label: 'buffer' } as unknown as GPUBuffer
    const writeBuffer = vi.fn()
    const device = {
      queue: { writeBuffer },
    } as unknown as GPUDevice

    writeViewportOrigin(buffer, device, 512, 12, 34)

    const [writtenBuffer, offset, data] = writeBuffer.mock.calls[0]
    expect(writtenBuffer).toBe(buffer)
    expect(offset).toBe(512)
    expect(Array.from(data as Float32Array)).toEqual([12, 34])
  })
})

describe('alignUniformStride', () => {
  it('aligns write sizes to the device uniform offset alignment', () => {
    expect(alignUniformStride(16, 256)).toBe(256)
    expect(alignUniformStride(8, 256)).toBe(256)
    expect(alignUniformStride(300, 256)).toBe(512)
  })
})
