import { useCallback, useEffect, useState } from 'react'
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

  const handleRun = useCallback(() => {
    setShouldCompile((current) => !current)
  }, [])

  const handleReset = useCallback(() => {
    setCode(defaultShader)
  }, [])

  const handleSave = useCallback(() => {
    const blob = new Blob([code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = 'shader.wgsl'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }, [code])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        handleRun()
        return
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleSave()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleRun, handleSave])

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
