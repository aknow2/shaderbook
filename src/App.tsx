import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { ChatPanel } from './components/ChatPanel'
import { EditorPane } from './components/EditorPane'
import { ErrorPanel } from './components/ErrorPanel'
import { Header } from './components/Header'
import { PreviewPane } from './components/PreviewPane'
import { StatusBar, type CompileStatus } from './components/StatusBar'
import { defaultShader } from './constants/defaultShader'
import {
  initialFlipbookSettings,
  initialPreviewMode,
  type FlipbookSettings,
  type PreviewMode,
} from './types/preview'

type Resolution = {
  width: number
  height: number
}

function isFromAiChatInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('[data-ai-chat-input="true"]') !== null
}

function App() {
  const [code, setCode] = useState(defaultShader)
  const [compileStatus, setCompileStatus] = useState<CompileStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fps, setFps] = useState(0)
  const [resolution, setResolution] = useState<Resolution>({ width: 0, height: 0 })
  const [gpuName, setGpuName] = useState<string | undefined>('Unknown')
  const [shouldCompile, setShouldCompile] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>(initialPreviewMode)
  const [flipbook, setFlipbook] = useState<FlipbookSettings>(initialFlipbookSettings)

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
      if (isFromAiChatInput(event.target)) {
        return
      }

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
        <div className="editor-column">
          <EditorPane code={code} onChange={setCode} />
          <ErrorPanel message={errorMessage} />
          <ChatPanel code={code} onApplyCode={setCode} />
        </div>
        <PreviewPane
          code={code}
          shouldCompile={shouldCompile}
          previewMode={previewMode}
          flipbook={flipbook}
          onPreviewModeChange={setPreviewMode}
          onFlipbookChange={setFlipbook}
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
        previewMode={previewMode}
        fps={fps}
        resolution={resolution}
        gpuName={gpuName}
      />
    </div>
  )
}

export default App
