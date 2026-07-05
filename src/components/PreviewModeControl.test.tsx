import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PreviewModeControl } from './PreviewModeControl'

describe('PreviewModeControl', () => {
  it('has an accessible preview mode label and selects Animation initially', () => {
    render(<PreviewModeControl onChange={vi.fn()} />)

    expect(screen.getByRole('group', { name: 'Preview mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Animation' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Flipbook' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('calls onChange when Flipbook is clicked', () => {
    const onChange = vi.fn()
    render(<PreviewModeControl onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Flipbook' }))

    expect(onChange).toHaveBeenCalledWith('flipbook')
  })

  it('switches selection from the keyboard', () => {
    const onChange = vi.fn()
    render(<PreviewModeControl onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('group', { name: 'Preview mode' }), { key: 'ArrowRight' })

    expect(onChange).toHaveBeenCalledWith('flipbook')
    expect(screen.getByRole('button', { name: 'Flipbook' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
