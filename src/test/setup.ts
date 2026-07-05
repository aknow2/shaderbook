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

const emptyClientRects = () => ({
  length: 0,
  item: () => null,
  [Symbol.iterator]: function* () {},
})

const defaultBoundingRect = () =>
  ({
    x: 0,
    y: 0,
    width: 1024,
    height: 768,
    top: 0,
    right: 1024,
    bottom: 768,
    left: 0,
    toJSON: () => {},
  }) as DOMRect

if (typeof HTMLElement !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value: emptyClientRects,
  })

  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: defaultBoundingRect,
  })
}

if (typeof Range !== 'undefined') {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: emptyClientRects,
  })

  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: defaultBoundingRect,
  })
}

afterEach(() => {
  cleanup()
})
