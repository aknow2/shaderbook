import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from 'react'
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

const DEFAULT_EDITOR_WIDTH_PERCENT = 45
const DEFAULT_EDITOR_STACK_HEIGHT_PERCENT = 52
const MIN_EDITOR_WIDTH = 320
const MIN_PREVIEW_WIDTH = 360
const SPLIT_HANDLE_WIDTH = 8
const MIN_EDITOR_STACK_HEIGHT = 180
const MIN_CHAT_HEIGHT = 180
const CHAT_SPLIT_HANDLE_HEIGHT = 8
const KEYBOARD_RESIZE_STEP = 32
const SHADER_DRAFT_STORAGE_KEY = 'shaderbook:shader-draft:v1'
const SHADER_DRAFT_STORAGE_VERSION = 1
const SHADER_DRAFT_SAVE_INTERVAL_MS = 5000

type StoredShaderDraft = {
  version: typeof SHADER_DRAFT_STORAGE_VERSION
  code: string
  savedAt: number
}

function readStoredShaderCode(): string {
  try {
    const storedValue = window.localStorage.getItem(SHADER_DRAFT_STORAGE_KEY)

    if (!storedValue) {
      return defaultShader
    }

    const storedDraft = JSON.parse(storedValue) as Partial<StoredShaderDraft>

    if (
      storedDraft.version !== SHADER_DRAFT_STORAGE_VERSION ||
      typeof storedDraft.code !== 'string'
    ) {
      return defaultShader
    }

    return storedDraft.code
  } catch {
    return defaultShader
  }
}

function writeStoredShaderCode(code: string): boolean {
  try {
    const storedDraft: StoredShaderDraft = {
      version: SHADER_DRAFT_STORAGE_VERSION,
      code,
      savedAt: Date.now(),
    }

    window.localStorage.setItem(SHADER_DRAFT_STORAGE_KEY, JSON.stringify(storedDraft))
    return true
  } catch {
    return false
  }
}

function clampEditorWidthPx(editorWidthPx: number, workspaceWidth: number): number {
  const maxEditorWidth = Math.max(
    MIN_EDITOR_WIDTH,
    workspaceWidth - SPLIT_HANDLE_WIDTH - MIN_PREVIEW_WIDTH,
  )

  return Math.min(Math.max(editorWidthPx, MIN_EDITOR_WIDTH), maxEditorWidth)
}

function editorWidthPxToPercent(editorWidthPx: number, workspaceWidth: number): number {
  return Number(((editorWidthPx / workspaceWidth) * 100).toFixed(1))
}

function clampEditorStackHeightPx(editorStackHeightPx: number, columnHeight: number): number {
  const maxEditorStackHeight = Math.max(
    MIN_EDITOR_STACK_HEIGHT,
    columnHeight - CHAT_SPLIT_HANDLE_HEIGHT - MIN_CHAT_HEIGHT,
  )

  return Math.min(Math.max(editorStackHeightPx, MIN_EDITOR_STACK_HEIGHT), maxEditorStackHeight)
}

function editorStackHeightPxToPercent(editorStackHeightPx: number, columnHeight: number): number {
  return Number(((editorStackHeightPx / columnHeight) * 100).toFixed(1))
}

function App() {
  const workspaceRef = useRef<HTMLElement | null>(null)
  const editorColumnRef = useRef<HTMLDivElement | null>(null)
  const [code, setCode] = useState(readStoredShaderCode)
  const latestCodeRef = useRef(code)
  const persistedCodeRef = useRef(code)
  const [compileStatus, setCompileStatus] = useState<CompileStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fps, setFps] = useState(0)
  const [resolution, setResolution] = useState<Resolution>({ width: 0, height: 0 })
  const [gpuName, setGpuName] = useState<string | undefined>('Unknown')
  const [shouldCompile, setShouldCompile] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>(initialPreviewMode)
  const [flipbook, setFlipbook] = useState<FlipbookSettings>(initialFlipbookSettings)
  const [editorWidthPercent, setEditorWidthPercent] = useState(DEFAULT_EDITOR_WIDTH_PERCENT)
  const [editorStackHeightPercent, setEditorStackHeightPercent] = useState(
    DEFAULT_EDITOR_STACK_HEIGHT_PERCENT,
  )
  const [isChatOpen, setIsChatOpen] = useState(true)
  const [isResizingWorkspace, setIsResizingWorkspace] = useState(false)
  const [isResizingEditorStack, setIsResizingEditorStack] = useState(false)

  const handleRun = useCallback(() => {
    setShouldCompile((current) => !current)
  }, [])

  const handleApplyCode = useCallback(
    (nextCode: string) => {
      setCode(nextCode)
      handleRun()
    },
    [handleRun],
  )

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

  const setEditorWidthFromClientX = useCallback((clientX: number) => {
    const workspace = workspaceRef.current
    if (!workspace) {
      return
    }

    const rect = workspace.getBoundingClientRect()
    if (rect.width <= 0) {
      return
    }

    const editorWidthPx = clampEditorWidthPx(clientX - rect.left, rect.width)
    setEditorWidthPercent(editorWidthPxToPercent(editorWidthPx, rect.width))
  }, [])

  const resizeEditorWidthBy = useCallback((deltaPx: number) => {
    const workspace = workspaceRef.current
    if (!workspace) {
      return
    }

    const rect = workspace.getBoundingClientRect()
    if (rect.width <= 0) {
      return
    }

    setEditorWidthPercent((currentPercent) => {
      const currentPx = (currentPercent / 100) * rect.width
      const nextPx = clampEditorWidthPx(currentPx + deltaPx, rect.width)
      return editorWidthPxToPercent(nextPx, rect.width)
    })
  }, [])

  const setEditorStackHeightFromClientY = useCallback((clientY: number) => {
    const editorColumn = editorColumnRef.current
    if (!editorColumn) {
      return
    }

    const rect = editorColumn.getBoundingClientRect()
    if (rect.height <= 0) {
      return
    }

    const editorStackHeightPx = clampEditorStackHeightPx(clientY - rect.top, rect.height)
    setEditorStackHeightPercent(
      editorStackHeightPxToPercent(editorStackHeightPx, rect.height),
    )
  }, [])

  const resizeEditorStackHeightBy = useCallback((deltaPx: number) => {
    const editorColumn = editorColumnRef.current
    if (!editorColumn) {
      return
    }

    const rect = editorColumn.getBoundingClientRect()
    if (rect.height <= 0) {
      return
    }

    setEditorStackHeightPercent((currentPercent) => {
      const currentPx = (currentPercent / 100) * rect.height
      const nextPx = clampEditorStackHeightPx(currentPx + deltaPx, rect.height)
      return editorStackHeightPxToPercent(nextPx, rect.height)
    })
  }, [])

  const handleSplitPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setIsResizingWorkspace(true)
      setEditorWidthFromClientX(event.clientX)
    },
    [setEditorWidthFromClientX],
  )

  const handleSplitPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isResizingWorkspace) {
        return
      }

      setEditorWidthFromClientX(event.clientX)
    },
    [isResizingWorkspace, setEditorWidthFromClientX],
  )

  const handleSplitPointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    setIsResizingWorkspace(false)
  }, [])

  const handleSplitKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        resizeEditorWidthBy(-KEYBOARD_RESIZE_STEP)
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        resizeEditorWidthBy(KEYBOARD_RESIZE_STEP)
        return
      }

      const workspaceWidth = workspaceRef.current?.getBoundingClientRect().width ?? 0
      if (workspaceWidth <= 0) {
        return
      }

      if (event.key === 'Home') {
        event.preventDefault()
        setEditorWidthPercent(
          editorWidthPxToPercent(clampEditorWidthPx(MIN_EDITOR_WIDTH, workspaceWidth), workspaceWidth),
        )
        return
      }

      if (event.key === 'End') {
        event.preventDefault()
        setEditorWidthPercent(
          editorWidthPxToPercent(
            clampEditorWidthPx(workspaceWidth - SPLIT_HANDLE_WIDTH - MIN_PREVIEW_WIDTH, workspaceWidth),
            workspaceWidth,
          ),
        )
      }
    },
    [resizeEditorWidthBy],
  )

  const handleChatSplitPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setIsResizingEditorStack(true)
      setEditorStackHeightFromClientY(event.clientY)
    },
    [setEditorStackHeightFromClientY],
  )

  const handleChatSplitPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isResizingEditorStack) {
        return
      }

      setEditorStackHeightFromClientY(event.clientY)
    },
    [isResizingEditorStack, setEditorStackHeightFromClientY],
  )

  const handleChatSplitPointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    setIsResizingEditorStack(false)
  }, [])

  const handleChatSplitKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        resizeEditorStackHeightBy(-KEYBOARD_RESIZE_STEP)
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        resizeEditorStackHeightBy(KEYBOARD_RESIZE_STEP)
        return
      }

      const columnHeight = editorColumnRef.current?.getBoundingClientRect().height ?? 0
      if (columnHeight <= 0) {
        return
      }

      if (event.key === 'Home') {
        event.preventDefault()
        setEditorStackHeightPercent(
          editorStackHeightPxToPercent(
            clampEditorStackHeightPx(MIN_EDITOR_STACK_HEIGHT, columnHeight),
            columnHeight,
          ),
        )
        return
      }

      if (event.key === 'End') {
        event.preventDefault()
        setEditorStackHeightPercent(
          editorStackHeightPxToPercent(
            clampEditorStackHeightPx(
              columnHeight - CHAT_SPLIT_HANDLE_HEIGHT - MIN_CHAT_HEIGHT,
              columnHeight,
            ),
            columnHeight,
          ),
        )
      }
    },
    [resizeEditorStackHeightBy],
  )

  const handleChatOpenChange = useCallback((nextIsOpen: boolean) => {
    setIsChatOpen(nextIsOpen)

    if (!nextIsOpen) {
      setIsResizingEditorStack(false)
    }
  }, [])

  const editorColumnGridTemplateRows = isChatOpen
    ? `minmax(${MIN_EDITOR_STACK_HEIGHT}px, ${editorStackHeightPercent}%) ${CHAT_SPLIT_HANDLE_HEIGHT}px minmax(${MIN_CHAT_HEIGHT}px, 1fr)`
    : `minmax(${MIN_EDITOR_STACK_HEIGHT}px, 1fr) auto`

  useEffect(() => {
    latestCodeRef.current = code
  }, [code])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const latestCode = latestCodeRef.current

      if (latestCode === persistedCodeRef.current) {
        return
      }

      if (writeStoredShaderCode(latestCode)) {
        persistedCodeRef.current = latestCode
      }
    }, SHADER_DRAFT_SAVE_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

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
      <main
        ref={workspaceRef}
        className={isResizingWorkspace ? 'workspace workspace-resizing' : 'workspace'}
        aria-label="Shader workspace"
        style={{
          gridTemplateColumns: `minmax(${MIN_EDITOR_WIDTH}px, ${editorWidthPercent}%) ${SPLIT_HANDLE_WIDTH}px minmax(${MIN_PREVIEW_WIDTH}px, 1fr)`,
        }}
      >
        <div
          ref={editorColumnRef}
          className={
            isResizingEditorStack && isChatOpen
              ? 'editor-column editor-column-resizing'
              : 'editor-column'
          }
          style={{
            gridTemplateRows: editorColumnGridTemplateRows,
          }}
        >
          <div className="editor-stack">
            <EditorPane code={code} onChange={setCode} />
            <ErrorPanel message={errorMessage} />
          </div>
          {isChatOpen ? (
            <div
              className="chat-splitter"
              role="separator"
              aria-label="Resize editor and AI chat panels"
              aria-orientation="horizontal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(editorStackHeightPercent)}
              tabIndex={0}
              onPointerDown={handleChatSplitPointerDown}
              onPointerMove={handleChatSplitPointerMove}
              onPointerUp={handleChatSplitPointerEnd}
              onPointerCancel={handleChatSplitPointerEnd}
              onKeyDown={handleChatSplitKeyDown}
            />
          ) : null}
          <ChatPanel
            code={code}
            isOpen={isChatOpen}
            onOpenChange={handleChatOpenChange}
            onApplyCode={handleApplyCode}
          />
        </div>
        <div
          className="workspace-splitter"
          role="separator"
          aria-label="Resize editor and preview panels"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(editorWidthPercent)}
          tabIndex={0}
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerEnd}
          onPointerCancel={handleSplitPointerEnd}
          onKeyDown={handleSplitKeyDown}
        />
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
