export type FlipbookLabelCell = {
  index: number
  x: number
  y: number
  timeSeconds: number
}

export type FlipbookLabelGrid = {
  cells: FlipbookLabelCell[]
}

export type FlipbookLabelsProps = {
  grid: FlipbookLabelGrid | null
  devicePixelRatio?: number
}

export function FlipbookLabels({
  grid,
  devicePixelRatio = window.devicePixelRatio || 1,
}: FlipbookLabelsProps) {
  if (grid === null) {
    return null
  }

  return (
    <div
      className="flipbook-labels"
      aria-hidden="true"
      style={{
        pointerEvents: 'none',
      }}
    >
      {grid.cells.map((cell) => (
        <span
          key={cell.index}
          className="flipbook-label"
          style={{
            position: 'absolute',
            left: `${cell.x / devicePixelRatio + 6}px`,
            top: `${cell.y / devicePixelRatio + 6}px`,
          }}
        >
          {`#${cell.index} ${cell.timeSeconds.toFixed(2)}s`}
        </span>
      ))}
    </div>
  )
}
