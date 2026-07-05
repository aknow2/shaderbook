import { useEffect, useState } from 'react'
import {
  flipbookFieldSpecs,
  flipbookSettingsToDraft,
  normalizeFlipbookDraft,
  normalizeFlipbookSettings,
  type FlipbookDraft,
  type FlipbookField,
} from '../flipbookSettings'
import type { FlipbookSettings } from '../types/preview'

export type FlipbookControlsProps = {
  settings: FlipbookSettings
  draft?: FlipbookDraft
  onDraftChange?: (draft: FlipbookDraft) => void
  onCommit: (settings: FlipbookSettings, draft: FlipbookDraft) => void
}

const inputConfigs: Array<{
  field: FlipbookField
  label: string
  ariaLabel: string
}> = [
  { field: 'frameCount', label: 'Frames', ariaLabel: 'Flipbook frame count' },
  {
    field: 'frameIntervalMs',
    label: 'Interval ms',
    ariaLabel: 'Flipbook frame interval in milliseconds',
  },
  { field: 'startTimeMs', label: 'Start ms', ariaLabel: 'Flipbook start time in milliseconds' },
]

export function FlipbookControls({
  settings,
  draft,
  onDraftChange,
  onCommit,
}: FlipbookControlsProps) {
  const [internalDraft, setInternalDraft] = useState<FlipbookDraft>(() =>
    flipbookSettingsToDraft(settings),
  )
  const currentDraft = draft ?? internalDraft

  useEffect(() => {
    if (draft === undefined) {
      setInternalDraft(flipbookSettingsToDraft(settings))
    }
  }, [draft, settings])

  const updateDraft = (nextDraft: FlipbookDraft) => {
    if (draft === undefined) {
      setInternalDraft(nextDraft)
    }

    onDraftChange?.(nextDraft)
  }

  const commitDraft = () => {
    const normalizedSettings = normalizeFlipbookSettings(currentDraft)
    const normalizedDraft = normalizeFlipbookDraft(normalizedSettings)

    updateDraft(normalizedDraft)
    onCommit(normalizedSettings, normalizedDraft)
  }

  return (
    <div className="flipbook-controls">
      {inputConfigs.map(({ field, label, ariaLabel }) => {
        const spec = flipbookFieldSpecs[field]

        return (
          <label key={field} className="flipbook-control">
            <span>{label}</span>
            <input
              type="number"
              value={currentDraft[field]}
              aria-label={ariaLabel}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              onChange={(event) => {
                updateDraft({
                  ...currentDraft,
                  [field]: event.currentTarget.value,
                })
              }}
              onBlur={commitDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitDraft()
                }
              }}
            />
          </label>
        )
      })}
    </div>
  )
}
