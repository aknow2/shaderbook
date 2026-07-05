import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Header } from './Header'

describe('Header', () => {
  it('renders title, supporting text, and action buttons without an overflow menu', () => {
    render(<Header onRun={vi.fn()} onReset={vi.fn()} onSave={vi.fn()} />)

    expect(screen.getByText('Shaderbook')).toBeInTheDocument()
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

  it('gives primary actions explicit accessible names and keeps them focusable', () => {
    render(<Header onRun={vi.fn()} onReset={vi.fn()} onSave={vi.fn()} />)

    const runButton = screen.getByRole('button', { name: 'Run' })
    const resetButton = screen.getByRole('button', { name: 'Reset' })
    const saveButton = screen.getByRole('button', { name: 'Save' })

    expect(runButton).toHaveAttribute('aria-label', 'Run')
    expect(resetButton).toHaveAttribute('aria-label', 'Reset')
    expect(saveButton).toHaveAttribute('aria-label', 'Save')

    runButton.focus()
    expect(runButton).toHaveFocus()
    resetButton.focus()
    expect(resetButton).toHaveFocus()
    saveButton.focus()
    expect(saveButton).toHaveFocus()
  })
})
