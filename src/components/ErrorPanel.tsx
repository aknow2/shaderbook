export type ErrorPanelProps = {
  message: string | null
}

const lineNumberNote = 'Line numbers refer to the generated WGSL, which wraps your code.'

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
