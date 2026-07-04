import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

class MockGPUValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GPUValidationError'
  }
}

Object.defineProperty(globalThis, 'GPUValidationError', {
  configurable: true,
  value: MockGPUValidationError,
})

Object.defineProperty(globalThis, 'GPUBufferUsage', {
  configurable: true,
  value: {
    UNIFORM: 0x40,
    COPY_DST: 0x8,
  },
})

Object.defineProperty(globalThis, 'GPUTextureUsage', {
  configurable: true,
  value: {
    RENDER_ATTACHMENT: 0x10,
  },
})

afterEach(() => {
  cleanup()
})
