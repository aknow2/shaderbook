import { useState } from 'react'
import './App.css'
import { EditorPane } from './components/EditorPane'
import { Header } from './components/Header'
import { PreviewPane } from './components/PreviewPane'
import { StatusBar, type CompileStatus } from './components/StatusBar'
import { defaultShader } from './constants/defaultShader'

type Resolution = {
  width: number
  height: number
}

function App() {
  const [code, setCode] = useState(defaultShader)
  const [compileStatus, setCompileStatus] = useState<CompileStatus>('idle')
  const [, setErrorMessage] = useState<string | null>(null)
  const [fps, setFps] = useState(0)
  const [resolution, setResolution] = useState<Resolution>({ width: 0, height: 0 })
  const [gpuName, setGpuName] = useState<string | undefined>('Unknown')
  const [shouldCompile, setShouldCompile] = useState(false)

  const handleRun = () => {
    setShouldCompile((current) => !current)
  }

  const handleReset = () => {
    setCode(defaultShader)
  }

  const handleSave = () => {
    // Local download is implemented in a later phase.
  }

  return (
    <div className="app-shell">
      <Header onRun={handleRun} onReset={handleReset} onSave={handleSave} />
      <main className="workspace" aria-label="Shader workspace">
        <EditorPane code={code} onChange={setCode} />
        <PreviewPane
          code={code}
          shouldCompile={shouldCompile}
          onCompileSuccess={() => {
            setCompileStatus('success')
            setErrorMessage(null)
          }}
          onCompileError={(message) => {
            setCompileStatus('error')
            setErrorMessage(message)
          }}
          onFpsChange={setFps}
          onResolutionChange={(width, height) => setResolution({ width, height })}
          onGpuInfo={setGpuName}
        />
      </main>
      <StatusBar
        compileStatus={compileStatus}
        fps={fps}
        resolution={resolution}
        gpuName={gpuName}
      />
    </div>
  )
}

export default App
