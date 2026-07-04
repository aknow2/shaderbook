import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Header } from './Header'

describe('Header', () => {
  it('renders title, supporting text, and action buttons without an overflow menu', () => {
    render(<Header onRun={vi.fn()} onReset={vi.fn()} onSave={vi.fn()} />)

    expect(screen.getByText('WGSL Playground')).toBeInTheDocument()
    expect(
      screen.getByText('Write and preview WGSL shaders in real time.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /more|menu|overflow/i })).not.toBeInTheDocument()
    expect(screen.queryByText('⋮')).not.toBeInTheDocument()
  })

  it('calls each handler when the matching button is clicked', () => {
    const onRun = vi.fn()
    const onReset = vi.fn()
    const onSave = vi.fn()

    render(<Header onRun={onRun} onReset={onReset} onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: /run/i }))
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(onRun).toHaveBeenCalledTimes(1)
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})
