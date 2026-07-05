import { useState } from 'react'
import type { PreviewMode } from '../types/preview'
import { initialPreviewMode } from '../types/preview'

export type PreviewModeControlProps = {
  value?: PreviewMode
  onChange: (mode: PreviewMode) => void
}

const modes: Array<{ value: PreviewMode; label: string }> = [
  { value: 'animation', label: 'Animation' },
  { value: 'flipbook', label: 'Flipbook' },
]

function nextMode(mode: PreviewMode, direction: 1 | -1): PreviewMode {
  const currentIndex = modes.findIndex((item) => item.value === mode)
  const nextIndex = (currentIndex + direction + modes.length) % modes.length
  return modes[nextIndex].value
}

export function PreviewModeControl({ value, onChange }: PreviewModeControlProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState<PreviewMode>(initialPreviewMode)
  const selectedMode = value ?? uncontrolledValue

  const commit = (mode: PreviewMode) => {
    if (value === undefined) {
      setUncontrolledValue(mode)
    }

    if (mode !== selectedMode) {
      onChange(mode)
    }
  }

  return (
    <div
      className="preview-mode-control"
      role="group"
      aria-label="Preview mode"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault()
          commit(nextMode(selectedMode, 1))
          return
        }

        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault()
          commit(nextMode(selectedMode, -1))
        }
      }}
    >
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          className="preview-mode-option"
          aria-pressed={selectedMode === mode.value}
          onClick={() => commit(mode.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              commit(mode.value)
            }
          }}
        >
          {mode.label}
        </button>
      ))}
    </div>
  )
}
