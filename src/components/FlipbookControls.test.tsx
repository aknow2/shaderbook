import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { initialFlipbookSettings } from '../types/preview'
import { FlipbookControls } from './FlipbookControls'

function renderControls(onCommit = vi.fn()) {
  render(<FlipbookControls settings={initialFlipbookSettings} onCommit={onCommit} />)
  return { onCommit }
}

describe('FlipbookControls', () => {
  it('renders the three number inputs with labels and spec metadata', () => {
    renderControls()

    const frames = screen.getByLabelText('Frames')
    const interval = screen.getByLabelText('Interval ms')
    const start = screen.getByLabelText('Start ms')

    expect(frames).toHaveAttribute('aria-label', 'Flipbook frame count')
    expect(frames).toHaveAttribute('min', '1')
    expect(frames).toHaveAttribute('max', '64')
    expect(frames).toHaveAttribute('step', '1')

    expect(interval).toHaveAttribute('aria-label', 'Flipbook frame interval in milliseconds')
    expect(interval).toHaveAttribute('min', '0')
    expect(interval).toHaveAttribute('max', '60000')
    expect(interval).toHaveAttribute('step', '1')

    expect(start).toHaveAttribute('aria-label', 'Flipbook start time in milliseconds')
    expect(start).toHaveAttribute('min', '0')
    expect(start).toHaveAttribute('max', '3600000')
    expect(start).toHaveAttribute('step', '1')
  })

  it('does not commit while draft input is changing', () => {
    const { onCommit } = renderControls()

    fireEvent.change(screen.getByLabelText('Frames'), { target: { value: '12' } })

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits normalized settings and draft on blur', () => {
    const { onCommit } = renderControls()
    const frames = screen.getByLabelText('Frames')

    fireEvent.change(frames, { target: { value: '65' } })
    fireEvent.blur(frames)

    expect(onCommit).toHaveBeenCalledWith(
      { frameCount: 64, frameIntervalMs: 100, startTimeMs: 0 },
      { frameCount: '64', frameIntervalMs: '100', startTimeMs: '0' },
    )
    expect(frames).toHaveValue(64)
  })

  it('commits normalized settings and draft on Enter', () => {
    const { onCommit } = renderControls()
    const interval = screen.getByLabelText('Interval ms')

    fireEvent.change(interval, { target: { value: '12.9' } })
    fireEvent.keyDown(interval, { key: 'Enter' })

    expect(onCommit).toHaveBeenCalledWith(
      { frameCount: 16, frameIntervalMs: 12, startTimeMs: 0 },
      { frameCount: '16', frameIntervalMs: '12', startTimeMs: '0' },
    )
    expect(interval).toHaveValue(12)
  })

  it('restores invalid values to default or clamp values', () => {
    const { onCommit } = renderControls()
    const frames = screen.getByLabelText('Frames')
    const start = screen.getByLabelText('Start ms')

    fireEvent.change(frames, { target: { value: '' } })
    fireEvent.blur(frames)
    fireEvent.change(start, { target: { value: '3600001' } })
    fireEvent.blur(start)

    expect(onCommit).toHaveBeenLastCalledWith(
      { frameCount: 16, frameIntervalMs: 100, startTimeMs: 3600000 },
      { frameCount: '16', frameIntervalMs: '100', startTimeMs: '3600000' },
    )
    expect(frames).toHaveValue(16)
    expect(start).toHaveValue(3600000)
  })
})
