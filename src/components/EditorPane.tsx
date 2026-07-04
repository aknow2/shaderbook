export type EditorPaneProps = {
  code: string
  onChange: (code: string) => void
}

export function EditorPane({ code, onChange }: EditorPaneProps) {
  return (
    <section className="panel editor-pane" aria-labelledby="editor-title">
      <div className="panel-header">
        <h2 id="editor-title">Editor</h2>
      </div>
      <div className="file-tabs" aria-label="Open shader files">
        <button type="button" className="file-tab" aria-current="page">
          shader.wgsl
        </button>
      </div>
      <textarea
        className="shader-textarea"
        aria-label="WGSL shader code"
        spellCheck={false}
        value={code}
        onChange={(event) => onChange(event.target.value)}
      />
    </section>
  )
}
