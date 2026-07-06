import type { FlipbookGrid } from './gpu/renderFlipbook'

export type DownloadFlipbookFramesInput = {
  sourceCanvas: HTMLCanvasElement
  grid: FlipbookGrid
  filenamePrefix?: string
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to create PNG blob'))
        return
      }

      resolve(blob)
    }, 'image/png')
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function downloadFlipbookFramesAsPngs({
  sourceCanvas,
  grid,
  filenamePrefix = 'flipbook-frame',
}: DownloadFlipbookFramesInput): Promise<number> {
  const frameNumberWidth = Math.max(3, String(grid.cells.length - 1).length)

  // drawImage/createImageBitmap read stale (blank) pixels from a canvas backed
  // by a GPUCanvasContext, so the full frame is snapshotted via toBlob first
  // and cells are cropped from that decoded bitmap instead of the live canvas.
  const sourceBlob = await canvasToPngBlob(sourceCanvas)
  const sourceBitmap = await createImageBitmap(sourceBlob)

  try {
    for (const cell of grid.cells) {
      const frameCanvas = document.createElement('canvas')
      frameCanvas.width = cell.width
      frameCanvas.height = cell.height

      const context = frameCanvas.getContext('2d')
      if (!context) {
        throw new Error('Unable to create PNG export canvas context')
      }

      context.drawImage(
        sourceBitmap,
        cell.x,
        cell.y,
        cell.width,
        cell.height,
        0,
        0,
        cell.width,
        cell.height,
      )

      const blob = await canvasToPngBlob(frameCanvas)
      const frameNumber = String(cell.index).padStart(frameNumberWidth, '0')
      downloadBlob(blob, `${filenamePrefix}-${frameNumber}.png`)
    }
  } finally {
    sourceBitmap.close()
  }

  return grid.cells.length
}
