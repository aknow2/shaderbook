export type HeaderProps = {
  onRun: () => void
  onReset: () => void
  onSave: () => void
  isRunDisabled?: boolean
  isResetDisabled?: boolean
}

export function Header({
  onRun,
  onReset,
  onSave,
  isRunDisabled = false,
  isResetDisabled = false,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          W
        </div>
        <div>
          <h1>Shaderbook</h1>
          <p>Write and preview WGSL shaders in real time.</p>
        </div>
      </div>
      <div className="header-actions" aria-label="Shader actions">
        <button
          type="button"
          className="button button-primary"
          aria-label="Run"
          disabled={isRunDisabled}
          onClick={onRun}
        >
          <span>Run</span>
          <kbd>Ctrl+Enter</kbd>
        </button>
        <button
          type="button"
          className="button"
          aria-label="Reset"
          disabled={isResetDisabled}
          onClick={onReset}
        >
          Reset
        </button>
        <button type="button" className="button" aria-label="Save" onClick={onSave}>
          Save
        </button>
      </div>
    </header>
  )
}
