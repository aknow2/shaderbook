import { describe, expect, it, vi } from 'vitest'
import {
  computeFlipbookGrid,
  createFlipbookFrameResources,
  renderFlipbook,
} from './renderFlipbook'

function createDeviceMock(options?: { alignment?: number }) {
  const calls: string[] = []
  const pass = {
    setPipeline: vi.fn(() => calls.push('setPipeline')),
    setViewport: vi.fn((x: number, y: number) => calls.push(`setViewport:${x},${y}`)),
    setScissorRect: vi.fn((x: number, y: number) => calls.push(`setScissorRect:${x},${y}`)),
    setBindGroup: vi.fn((_index: number, bindGroup: unknown) =>
      calls.push(`setBindGroup:${(bindGroup as { index: number }).index}`),
    ),
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
  const bindGroups: unknown[] = []
  const device = {
    limits: options?.alignment === undefined ? {} : { minUniformBufferOffsetAlignment: options.alignment },
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => ({
      label: descriptor.label,
      size: descriptor.size,
      destroy: vi.fn(),
    })),
    createBindGroup: vi.fn((descriptor: GPUBindGroupDescriptor) => {
      const bindGroup = { index: bindGroups.length, descriptor }
      bindGroups.push(bindGroup)
      return bindGroup
    }),
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
  const pipeline = {
    getBindGroupLayout: vi.fn(() => ({ label: 'layout' })),
  }

  return {
    bindGroups,
    calls,
    context,
    device,
    encoder,
    pass,
    pipeline,
  }
}

describe('computeFlipbookGrid', () => {
  it.each([
    [1, 1, 1],
    [2, 2, 1],
    [4, 2, 2],
    [9, 3, 3],
    [16, 4, 4],
    [20, 5, 4],
    [64, 8, 8],
  ])('computes columns and rows for %i frames', (frameCount, columns, rows) => {
    const grid = computeFlipbookGrid({
      canvasWidth: 1000,
      canvasHeight: 800,
      devicePixelRatio: 2,
      settings: { frameCount, frameIntervalMs: 100, startTimeMs: 0 },
    })

    expect(grid.columns).toBe(columns)
    expect(grid.rows).toBe(rows)
  })

  it('computes row-major cells, device gap, clamped size, and frame times', () => {
    const grid = computeFlipbookGrid({
      canvasWidth: 103,
      canvasHeight: 61,
      devicePixelRatio: 1.5,
      settings: { frameCount: 5, frameIntervalMs: 250, startTimeMs: 500 },
    })

    expect(grid.gapDevicePx).toBe(12)
    expect(grid.cellWidth).toBe(26)
    expect(grid.cellHeight).toBe(24)
    expect(grid.cells.map(({ row, column, x, y, timeSeconds }) => ({ row, column, x, y, timeSeconds })))
      .toEqual([
        { row: 0, column: 0, x: 0, y: 0, timeSeconds: 0.5 },
        { row: 0, column: 1, x: 38, y: 0, timeSeconds: 0.75 },
        { row: 0, column: 2, x: 76, y: 0, timeSeconds: 1 },
        { row: 1, column: 0, x: 0, y: 36, timeSeconds: 1.25 },
        { row: 1, column: 1, x: 38, y: 36, timeSeconds: 1.5 },
      ])
  })

  it('clamps cell dimensions to at least 1 and supports zero interval', () => {
    const grid = computeFlipbookGrid({
      canvasWidth: 2,
      canvasHeight: 2,
      devicePixelRatio: 2,
      settings: { frameCount: 64, frameIntervalMs: 0, startTimeMs: 1234 },
    })

    expect(grid.cellWidth).toBe(1)
    expect(grid.cellHeight).toBe(1)
    expect(grid.cells.every((cell) => cell.timeSeconds === 1.234)).toBe(true)
  })
})

describe('createFlipbookFrameResources', () => {
  it('writes one aligned user and viewport-origin slot per frame and creates offset bind groups', () => {
    const { device, pipeline } = createDeviceMock()
    const grid = computeFlipbookGrid({
      canvasWidth: 200,
      canvasHeight: 100,
      devicePixelRatio: 1,
      settings: { frameCount: 3, frameIntervalMs: 100, startTimeMs: 200 },
    })

    const resources = createFlipbookFrameResources({
      device: device as unknown as GPUDevice,
      pipeline: pipeline as unknown as GPURenderPipeline,
      grid,
    })

    expect(device.createBuffer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ label: 'Flipbook user uniforms', size: 256 * 3 }),
    )
    expect(device.createBuffer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ label: 'Flipbook viewport origins', size: 256 * 3 }),
    )
    const writeBufferCalls = device.queue.writeBuffer.mock.calls as unknown as Array<
      [GPUBuffer, number, Float32Array]
    >
    expect(device.queue.writeBuffer).toHaveBeenCalledTimes(6)
    expect(writeBufferCalls[0][1]).toBe(0)
    const firstUserUniform = Array.from(writeBufferCalls[0][2])
    expect(firstUserUniform[0]).toBeCloseTo(0.2)
    expect(firstUserUniform.slice(1)).toEqual([0, grid.cellWidth, grid.cellHeight])
    expect(writeBufferCalls[2][1]).toBe(256)
    expect(Array.from(writeBufferCalls[3][2])).toEqual([
      grid.cells[1].x,
      grid.cells[1].y,
    ])
    expect(resources.bindGroups).toHaveLength(3)
    expect(device.createBindGroup).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        entries: [
          { binding: 0, resource: { buffer: resources.userUniformBuffer, offset: 256, size: 16 } },
          { binding: 1, resource: { buffer: resources.viewportOriginBuffer, offset: 256, size: 8 } },
        ],
      }),
    )
  })
})

describe('renderFlipbook', () => {
  it('clears once, binds one pipeline, and draws each frame in ascending index order', () => {
    const { calls, context, device, encoder, pass, pipeline } = createDeviceMock({ alignment: 128 })

    const result = renderFlipbook({
      device: device as unknown as GPUDevice,
      context: context as unknown as GPUCanvasContext,
      pipeline: pipeline as unknown as GPURenderPipeline,
      canvasWidth: 200,
      canvasHeight: 100,
      devicePixelRatio: 1,
      settings: { frameCount: 4, frameIntervalMs: 100, startTimeMs: 0 },
    })

    expect(result.grid.cells).toHaveLength(4)
    expect(result.resources.userUniformBuffer).toBeTruthy()
    expect(result.resources.viewportOriginBuffer).toBeTruthy()
    expect(device.createCommandEncoder).toHaveBeenCalledTimes(1)
    expect(device.queue.submit).toHaveBeenCalledTimes(1)
    expect(device.createBuffer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ size: 128 * 4 }),
    )
    expect(device.createBuffer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ size: 128 * 4 }),
    )
    expect(encoder.beginRenderPass).toHaveBeenCalledWith({
      colorAttachments: [
        expect.objectContaining({
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }),
      ],
    })
    expect(pass.setPipeline).toHaveBeenCalledTimes(1)
    expect(pass.setViewport).toHaveBeenCalledTimes(4)
    expect(pass.setScissorRect).toHaveBeenCalledTimes(4)
    expect(pass.setBindGroup).toHaveBeenCalledTimes(4)
    expect(pass.draw).toHaveBeenCalledTimes(4)
    expect(calls.filter((call) => call.startsWith('setBindGroup'))).toEqual([
      'setBindGroup:0',
      'setBindGroup:1',
      'setBindGroup:2',
      'setBindGroup:3',
    ])
  })
})
