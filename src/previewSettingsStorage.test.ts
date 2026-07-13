import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  initialPreviewSettings,
  PREVIEW_SETTINGS_STORAGE_KEY,
  readStoredPreviewSettings,
  writeStoredPreviewSettings,
  type PreviewSettings,
} from './previewSettingsStorage'

const storedSettings: PreviewSettings = {
  previewMode: 'flipbook',
  previewAspectRatio: '16:9',
  livePlaybackMode: 'once',
  flipbook: {
    frameCount: 8,
    frameIntervalMs: 250,
    startTimeMs: 1000,
  },
}

describe('previewSettingsStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trips preview settings through localStorage', () => {
    expect(writeStoredPreviewSettings(storedSettings)).toBe(true)

    expect(JSON.parse(window.localStorage.getItem(PREVIEW_SETTINGS_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      ...storedSettings,
    })
    expect(readStoredPreviewSettings()).toEqual(storedSettings)
  })

  it('returns the initial settings when nothing is stored', () => {
    expect(readStoredPreviewSettings()).toEqual(initialPreviewSettings)
  })

  it('returns the initial settings for invalid JSON', () => {
    window.localStorage.setItem(PREVIEW_SETTINGS_STORAGE_KEY, 'not json')

    expect(readStoredPreviewSettings()).toEqual(initialPreviewSettings)
  })

  it('returns the initial settings for an unknown version', () => {
    window.localStorage.setItem(
      PREVIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 2, ...storedSettings }),
    )

    expect(readStoredPreviewSettings()).toEqual(initialPreviewSettings)
  })

  it('falls back per field when stored values are invalid', () => {
    window.localStorage.setItem(
      PREVIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        previewMode: 'diashow',
        previewAspectRatio: '16:9',
        livePlaybackMode: true,
        flipbook: { frameCount: 999, frameIntervalMs: 'fast', startTimeMs: 500 },
      }),
    )

    expect(readStoredPreviewSettings()).toEqual({
      previewMode: initialPreviewSettings.previewMode,
      previewAspectRatio: '16:9',
      livePlaybackMode: initialPreviewSettings.livePlaybackMode,
      flipbook: {
        frameCount: 64,
        frameIntervalMs: initialPreviewSettings.flipbook.frameIntervalMs,
        startTimeMs: 500,
      },
    })
  })

  it('falls back to the initial flipbook settings when flipbook is not an object', () => {
    window.localStorage.setItem(
      PREVIEW_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 1, ...storedSettings, flipbook: 'broken' }),
    )

    expect(readStoredPreviewSettings().flipbook).toEqual(initialPreviewSettings.flipbook)
  })

  it('returns false without throwing when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(writeStoredPreviewSettings(storedSettings)).toBe(false)
    expect(readStoredPreviewSettings()).toEqual(initialPreviewSettings)
  })
})
