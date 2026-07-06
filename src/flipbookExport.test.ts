import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadFlipbookFramesAsPngs } from './flipbookExport'
import type { FlipbookGrid } from './gpu/renderFlipbook'

const grid: FlipbookGrid = {
  columns: 2,
  rows: 1,
  gapDevicePx: 8,
  cellWidth: 30,
  cellHeight: 40,
  cells: [
    {
      index: 0,
      row: 0,
      column: 0,
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      timeSeconds: 0,
    },
    {
      index: 1,
      row: 0,
      column: 1,
      x: 48,
      y: 20,
      width: 30,
      height: 40,
      timeSeconds: 0.1,
    },
  ],
}

describe('downloadFlipbookFramesAsPngs', () => {
  const originalToBlob = HTMLCanvasElement.prototype.toBlob
  let nextObjectUrlId = 0
  const createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:${blob.type}:${nextObjectUrlId}`
    nextObjectUrlId += 1
    return url
  })
  const revokeObjectURL = vi.fn()
  const clickedAnchors: Array<{ href: string; download: string }> = []
  const drawImage = vi.fn()
  const closeBitmap = vi.fn()
  const sourceBitmap = { close: closeBitmap } as unknown as ImageBitmap
  const createImageBitmap = vi.fn(() => Promise.resolve(sourceBitmap))

  beforeEach(() => {
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    clickedAnchors.length = 0
    drawImage.mockClear()
    closeBitmap.mockClear()
    createImageBitmap.mockClear()
    nextObjectUrlId = 0

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as GPUCanvasContext)
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: vi.fn((callback: BlobCallback, type?: string) => {
        callback(new Blob(['png'], { type }))
      }),
    })
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchors.push({ href: this.href, download: this.download })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: originalToBlob,
    })
  })

  it('downloads each flipbook cell as an individual PNG file', async () => {
    const sourceCanvas = document.createElement('canvas')

    await expect(downloadFlipbookFramesAsPngs({ sourceCanvas, grid })).resolves.toBe(2)

    expect(createImageBitmap).toHaveBeenCalledTimes(1)
    expect(drawImage).toHaveBeenNthCalledWith(1, sourceBitmap, 10, 20, 30, 40, 0, 0, 30, 40)
    expect(drawImage).toHaveBeenNthCalledWith(2, sourceBitmap, 48, 20, 30, 40, 0, 0, 30, 40)
    expect(closeBitmap).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(clickedAnchors).toEqual([
      { href: 'blob:image/png:0', download: 'flipbook-frame-000.png' },
      { href: 'blob:image/png:1', download: 'flipbook-frame-001.png' },
    ])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image/png:0')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:image/png:1')
    expect(document.querySelector('a')).toBeNull()
  })
})
