export type CompileStatus = 'idle' | 'success' | 'error'

export type StatusBarProps = {
  compileStatus: CompileStatus
  fps: number
  resolution: {
    width: number
    height: number
  }
  gpuName?: string
}

const compileLabels: Record<CompileStatus, string> = {
  idle: 'Idle',
  success: 'Success',
  error: 'Error',
}

export function StatusBar({ compileStatus, fps, resolution, gpuName }: StatusBarProps) {
  const statusLabel = compileLabels[compileStatus]

  return (
    <footer className="status-bar" aria-label="Shader status">
      <span className={`status-item compile-status compile-${compileStatus}`}>
        Compile: {statusLabel}
      </span>
      <span className="status-item">FPS: {fps.toFixed(1)}</span>
      <span className="status-item">
        Resolution: {resolution.width} x {resolution.height}
      </span>
      <span className="status-item">GPU: {gpuName ?? 'Unknown'}</span>
      <span className="status-item">Backend: WebGPU</span>
      <span className="status-item">WGSL</span>
    </footer>
  )
}
