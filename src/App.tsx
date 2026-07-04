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
  const [compileStatus] = useState<CompileStatus>('idle')
  const [fps] = useState(0)
  const [resolution] = useState<Resolution>({ width: 0, height: 0 })
  const [gpuName] = useState<string | undefined>('Unknown')

  const handleRun = () => {
    // WebGPU compilation is implemented in a later phase.
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
        <PreviewPane />
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
