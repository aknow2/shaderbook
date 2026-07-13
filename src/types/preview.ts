export type PreviewMode = 'live' | 'flipbook'

export type LivePlaybackMode = 'loop' | 'once'

export type PreviewAspectRatio = 'fit' | '1:1' | '16:9' | '9:16'

export type LiveRecordingStatus = 'idle' | 'recording' | 'stopping' | 'unsupported' | 'error'

export type FlipbookSettings = {
  frameCount: number
  frameIntervalMs: number
  startTimeMs: number
}

export const initialPreviewMode: PreviewMode = 'live'

export const initialLivePlaybackMode: LivePlaybackMode = 'loop'

export const initialPreviewAspectRatio: PreviewAspectRatio = 'fit'

export const initialFlipbookSettings: FlipbookSettings = {
  frameCount: 16,
  frameIntervalMs: 100,
  startTimeMs: 0,
}
