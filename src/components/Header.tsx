export type HeaderProps = {
  onRun: () => void
  onReset: () => void
  onSave: () => void
}

export function Header({ onRun, onReset, onSave }: HeaderProps) {
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
          onClick={onRun}
        >
          <span>Run</span>
          <kbd>Ctrl+Enter</kbd>
        </button>
        <button type="button" className="button" aria-label="Reset" onClick={onReset}>
          Reset
        </button>
        <button type="button" className="button" aria-label="Save" onClick={onSave}>
          Save
        </button>
      </div>
    </header>
  )
}
