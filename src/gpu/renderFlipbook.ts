import type { FlipbookSettings } from '../types/preview'
import {
  USER_UNIFORM_WRITE_SIZE,
  VIEWPORT_ORIGIN_WRITE_SIZE,
  alignUniformStride,
  writeUserUniforms,
  writeViewportOrigin,
} from './createUniformBuffer'

export type FlipbookCell = {
  index: number
  row: number
  column: number
  x: number
  y: number
  width: number
  height: number
  timeSeconds: number
}

export type FlipbookGrid = {
  columns: number
  rows: number
  gapDevicePx: number
  cellWidth: number
  cellHeight: number
  cells: FlipbookCell[]
}

export type CreateFlipbookFrameResourcesInput = {
  device: GPUDevice
  pipeline: GPURenderPipeline
  grid: FlipbookGrid
}

export type FlipbookFrameResources = {
  userUniformBuffer: GPUBuffer
  viewportOriginBuffer: GPUBuffer
  bindGroups: GPUBindGroup[]
}

export type RenderFlipbookInput = {
  device: GPUDevice
  context: GPUCanvasContext
  pipeline: GPURenderPipeline
  canvasWidth: number
  canvasHeight: number
  devicePixelRatio: number
  settings: FlipbookSettings
}

export type RenderFlipbookResult = {
  grid: FlipbookGrid
  resources: FlipbookFrameResources
}

export function computeFlipbookGrid({
  canvasWidth,
  canvasHeight,
  devicePixelRatio,
  settings,
}: {
  canvasWidth: number
  canvasHeight: number
  devicePixelRatio: number
  settings: FlipbookSettings
}): FlipbookGrid {
  const columns = Math.ceil(Math.sqrt(settings.frameCount))
  const rows = Math.ceil(settings.frameCount / columns)
  const gapDevicePx = Math.round(8 * devicePixelRatio)
  const cellWidth = Math.max(
    1,
    Math.floor((canvasWidth - gapDevicePx * (columns - 1)) / columns),
  )
  const cellHeight = Math.max(
    1,
    Math.floor((canvasHeight - gapDevicePx * (rows - 1)) / rows),
  )

  return {
    columns,
    rows,
    gapDevicePx,
    cellWidth,
    cellHeight,
    cells: Array.from({ length: settings.frameCount }, (_, index) => {
      const row = Math.floor(index / columns)
      const column = index % columns

      return {
        index,
        row,
        column,
        x: column * (cellWidth + gapDevicePx),
        y: row * (cellHeight + gapDevicePx),
        width: cellWidth,
        height: cellHeight,
        timeSeconds: (settings.startTimeMs + index * settings.frameIntervalMs) / 1000,
      }
    }),
  }
}

export function destroyFlipbookFrameResources(resources: FlipbookFrameResources | null) {
  resources?.userUniformBuffer.destroy()
  resources?.viewportOriginBuffer.destroy()
}

function getUniformAlignment(device: GPUDevice): number {
  return device.limits?.minUniformBufferOffsetAlignment ?? 256
}

export function createFlipbookFrameResources({
  device,
  pipeline,
  grid,
}: CreateFlipbookFrameResourcesInput): FlipbookFrameResources {
  const frameCount = grid.cells.length
  const alignment = getUniformAlignment(device)
  const userUniformStride = alignUniformStride(USER_UNIFORM_WRITE_SIZE, alignment)
  const viewportOriginStride = alignUniformStride(VIEWPORT_ORIGIN_WRITE_SIZE, alignment)
  const userUniformBuffer = device.createBuffer({
    label: 'Flipbook user uniforms',
    size: userUniformStride * frameCount,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const viewportOriginBuffer = device.createBuffer({
    label: 'Flipbook viewport origins',
    size: viewportOriginStride * frameCount,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const bindGroupLayout = pipeline.getBindGroupLayout(0)

  const bindGroups = grid.cells.map((cell, index) => {
    const userUniformOffset = index * userUniformStride
    const viewportOriginOffset = index * viewportOriginStride

    writeUserUniforms(
      userUniformBuffer,
      device,
      userUniformOffset,
      cell.timeSeconds,
      cell.width,
      cell.height,
    )
    writeViewportOrigin(viewportOriginBuffer, device, viewportOriginOffset, cell.x, cell.y)

    return device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: userUniformBuffer,
            offset: userUniformOffset,
            size: USER_UNIFORM_WRITE_SIZE,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: viewportOriginBuffer,
            offset: viewportOriginOffset,
            size: VIEWPORT_ORIGIN_WRITE_SIZE,
          },
        },
      ],
    })
  })

  return { userUniformBuffer, viewportOriginBuffer, bindGroups }
}

export function renderFlipbook({
  device,
  context,
  pipeline,
  canvasWidth,
  canvasHeight,
  devicePixelRatio,
  settings,
}: RenderFlipbookInput): RenderFlipbookResult {
  const grid = computeFlipbookGrid({
    canvasWidth,
    canvasHeight,
    devicePixelRatio,
    settings,
  })
  const resources = createFlipbookFrameResources({ device, pipeline, grid })
  const encoder = device.createCommandEncoder()
  const view = context.getCurrentTexture().createView()
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

  pass.setPipeline(pipeline)
  for (const cell of grid.cells) {
    pass.setViewport(cell.x, cell.y, cell.width, cell.height, 0, 1)
    pass.setScissorRect(cell.x, cell.y, cell.width, cell.height)
    pass.setBindGroup(0, resources.bindGroups[cell.index])
    pass.draw(3)
  }

  pass.end()
  device.queue.submit([encoder.finish()])

  return { grid, resources }
}
