import { normalizeFlipbookSettings } from './flipbookSettings'
import {
  initialFlipbookSettings,
  initialLivePlaybackMode,
  initialPreviewAspectRatio,
  initialPreviewMode,
  type FlipbookSettings,
  type LivePlaybackMode,
  type PreviewAspectRatio,
  type PreviewMode,
} from './types/preview'

export const PREVIEW_SETTINGS_STORAGE_KEY = 'shaderbook:preview-settings:v1'
const PREVIEW_SETTINGS_STORAGE_VERSION = 1

export type PreviewSettings = {
  previewMode: PreviewMode
  previewAspectRatio: PreviewAspectRatio
  livePlaybackMode: LivePlaybackMode
  flipbook: FlipbookSettings
}

type StoredPreviewSettings = PreviewSettings & {
  version: typeof PREVIEW_SETTINGS_STORAGE_VERSION
}

export const initialPreviewSettings: PreviewSettings = {
  previewMode: initialPreviewMode,
  previewAspectRatio: initialPreviewAspectRatio,
  livePlaybackMode: initialLivePlaybackMode,
  flipbook: initialFlipbookSettings,
}

function isPreviewMode(value: unknown): value is PreviewMode {
  return value === 'live' || value === 'flipbook'
}

function isPreviewAspectRatio(value: unknown): value is PreviewAspectRatio {
  return value === 'fit' || value === '1:1' || value === '16:9' || value === '9:16'
}

function isLivePlaybackMode(value: unknown): value is LivePlaybackMode {
  return value === 'loop' || value === 'once'
}

function toFlipbookInput(value: unknown): string | number | undefined {
  return typeof value === 'number' || typeof value === 'string' ? value : undefined
}

function normalizeStoredFlipbook(value: unknown): FlipbookSettings {
  if (typeof value !== 'object' || value === null) {
    return initialFlipbookSettings
  }

  const stored = value as Partial<Record<keyof FlipbookSettings, unknown>>
  return normalizeFlipbookSettings({
    frameCount: toFlipbookInput(stored.frameCount),
    frameIntervalMs: toFlipbookInput(stored.frameIntervalMs),
    startTimeMs: toFlipbookInput(stored.startTimeMs),
  })
}

export function readStoredPreviewSettings(): PreviewSettings {
  try {
    const storedValue = window.localStorage.getItem(PREVIEW_SETTINGS_STORAGE_KEY)

    if (!storedValue) {
      return initialPreviewSettings
    }

    const stored = JSON.parse(storedValue) as Partial<StoredPreviewSettings>

    if (stored.version !== PREVIEW_SETTINGS_STORAGE_VERSION) {
      return initialPreviewSettings
    }

    return {
      previewMode: isPreviewMode(stored.previewMode) ? stored.previewMode : initialPreviewMode,
      previewAspectRatio: isPreviewAspectRatio(stored.previewAspectRatio)
        ? stored.previewAspectRatio
        : initialPreviewAspectRatio,
      livePlaybackMode: isLivePlaybackMode(stored.livePlaybackMode)
        ? stored.livePlaybackMode
        : initialLivePlaybackMode,
      flipbook: normalizeStoredFlipbook(stored.flipbook),
    }
  } catch {
    return initialPreviewSettings
  }
}

export function writeStoredPreviewSettings(settings: PreviewSettings): boolean {
  try {
    const stored: StoredPreviewSettings = {
      version: PREVIEW_SETTINGS_STORAGE_VERSION,
      ...settings,
    }

    window.localStorage.setItem(PREVIEW_SETTINGS_STORAGE_KEY, JSON.stringify(stored))
    return true
  } catch {
    return false
  }
}
