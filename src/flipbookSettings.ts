import type { FlipbookSettings } from './types/preview'

export const flipbookFieldSpecs = {
  frameCount: { defaultValue: 16, min: 1, max: 64, step: 1 },
  frameIntervalMs: { defaultValue: 100, min: 0, max: 60000, step: 1 },
  startTimeMs: { defaultValue: 0, min: 0, max: 3600000, step: 1 },
} as const

export type FlipbookField = keyof FlipbookSettings

export type FlipbookDraft = Record<FlipbookField, string>

const fields = Object.keys(flipbookFieldSpecs) as FlipbookField[]

export function normalizeFlipbookValue(
  field: FlipbookField,
  value: string | number,
): number {
  const spec = flipbookFieldSpecs[field]

  if (typeof value === 'string' && value.trim() === '') {
    return spec.defaultValue
  }

  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return spec.defaultValue
  }

  const integer = Math.trunc(parsed)
  return Math.min(spec.max, Math.max(spec.min, integer))
}

export function normalizeFlipbookSettings(
  draft: Partial<Record<FlipbookField, string | number>>,
): FlipbookSettings {
  return {
    frameCount: normalizeFlipbookValue('frameCount', draft.frameCount ?? ''),
    frameIntervalMs: normalizeFlipbookValue('frameIntervalMs', draft.frameIntervalMs ?? ''),
    startTimeMs: normalizeFlipbookValue('startTimeMs', draft.startTimeMs ?? ''),
  }
}

export function flipbookSettingsToDraft(settings: FlipbookSettings): FlipbookDraft {
  return {
    frameCount: String(settings.frameCount),
    frameIntervalMs: String(settings.frameIntervalMs),
    startTimeMs: String(settings.startTimeMs),
  }
}

export function normalizeFlipbookDraft(
  draft: Partial<Record<FlipbookField, string | number>>,
): FlipbookDraft {
  return flipbookSettingsToDraft(normalizeFlipbookSettings(draft))
}

export function getFlipbookFields(): FlipbookField[] {
  return [...fields]
}
