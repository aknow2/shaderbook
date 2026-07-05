export type PreviewMode = 'live' | 'flipbook'

export type FlipbookSettings = {
  frameCount: number
  frameIntervalMs: number
  startTimeMs: number
}

export const initialPreviewMode: PreviewMode = 'live'

export const initialFlipbookSettings: FlipbookSettings = {
  frameCount: 16,
  frameIntervalMs: 100,
  startTimeMs: 0,
}
