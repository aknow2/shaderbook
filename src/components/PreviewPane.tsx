export function PreviewPane() {
  return (
    <section className="panel preview-pane" aria-labelledby="preview-title">
      <div className="panel-header preview-header">
        <h2 id="preview-title">Preview</h2>
        <div className="preview-tools">
          <button type="button" className="control-button" aria-label="Preview scale: Fit">
            Fit
          </button>
          <button type="button" className="control-button" aria-label="Fullscreen preview">
            Fullscreen
          </button>
        </div>
      </div>
      <div className="canvas-frame">
        <canvas aria-label="WebGPU shader preview" />
      </div>
    </section>
  )
}
