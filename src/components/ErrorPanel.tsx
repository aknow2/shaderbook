export type ErrorPanelProps = {
  message: string | null
}

const lineNumberNote = '行番号はラップ後のWGSL全体に対するものです'

export function ErrorPanel({ message }: ErrorPanelProps) {
  if (!message) {
    return null
  }

  return (
    <aside className="error-panel" role="alert" aria-label="Compile error">
      <pre>{message}</pre>
      <p>{lineNumberNote}</p>
    </aside>
  )
}
