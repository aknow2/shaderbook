import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FlipbookLabels, type FlipbookLabelGrid } from './FlipbookLabels'

const grid: FlipbookLabelGrid = {
  cells: [
    { index: 0, x: 0, y: 0, timeSeconds: 0 },
    { index: 1, x: 20, y: 40, timeSeconds: 1.234 },
  ],
}

describe('FlipbookLabels', () => {
  it('renders no labels when grid is null', () => {
    const { container } = render(<FlipbookLabels grid={null} devicePixelRatio={2} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders one label per grid cell with formatted frame time', () => {
    render(<FlipbookLabels grid={grid} devicePixelRatio={2} />)

    expect(screen.getByText('#0 0.00s')).toBeInTheDocument()
    expect(screen.getByText('#1 1.23s')).toBeInTheDocument()
  })

  it('converts device pixels to CSS pixels and offsets labels by 6px', () => {
    render(<FlipbookLabels grid={grid} devicePixelRatio={2} />)

    expect(screen.getByText('#0 0.00s')).toHaveStyle({ left: '6px', top: '6px' })
    expect(screen.getByText('#1 1.23s')).toHaveStyle({ left: '16px', top: '26px' })
  })

  it('hides the overlay from assistive technology and pointer events', () => {
    const { container } = render(<FlipbookLabels grid={grid} devicePixelRatio={2} />)
    const overlay = container.firstElementChild

    expect(overlay).toHaveAttribute('aria-hidden', 'true')
    expect(overlay).toHaveStyle({ pointerEvents: 'none' })
  })
})
