import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditorPane } from './EditorPane'

describe('EditorPane', () => {
  it('shows the shader tab and current code', () => {
    render(<EditorPane code="fn mainImage() {}" onChange={vi.fn()} />)

    expect(screen.getByText('Editor')).toBeInTheDocument()
    expect(screen.getByText('shader.wgsl')).toBeInTheDocument()
    expect(screen.getByDisplayValue('fn mainImage() {}')).toBeInTheDocument()
  })

  it('calls onChange when the textarea value changes', () => {
    const onChange = vi.fn()
    render(<EditorPane code="old" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('WGSL shader code'), {
      target: { value: 'new shader code' },
    })

    expect(onChange).toHaveBeenCalledWith('new shader code')
  })
})
