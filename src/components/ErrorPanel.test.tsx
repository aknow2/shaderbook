import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ErrorPanel } from './ErrorPanel'

describe('ErrorPanel', () => {
  it('renders nothing when message is null', () => {
    const { container } = render(<ErrorPanel message={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the error message and wrapped WGSL line-number note', () => {
    render(<ErrorPanel message="error: unresolved identifier 'uniform'" />)

    expect(screen.getByText("error: unresolved identifier 'uniform'")).toBeInTheDocument()
    expect(
      screen.getByText('行番号はラップ後のWGSL全体に対するものです'),
    ).toBeInTheDocument()
  })

  it('uses an alert role for accessible error announcements', () => {
    render(<ErrorPanel message="error: expected expression" />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
