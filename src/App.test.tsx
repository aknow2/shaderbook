import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AiChatMessageRequest, AiChatMessageResponse } from './aiChat/types'
import type { PreviewPaneProps } from './components/PreviewPane'
import { defaultShader } from './constants/defaultShader'
import { initialFlipbookSettings } from './types/preview'

const mocks = vi.hoisted(() => ({
  PreviewPane: vi.fn(() => null),
  sendAiChatMessage: vi.fn(),
  cancelAiChatRequest: vi.fn(),
}))

vi.mock('./components/PreviewPane', () => ({
  PreviewPane: mocks.PreviewPane,
}))

vi.mock('./aiChat/client', () => ({
  AiChatClientError: class AiChatClientError extends Error {
    readonly displayMessage: string

    constructor(displayMessage: string) {
      super(displayMessage)
      this.displayMessage = displayMessage
    }
  },
  sendAiChatMessage: mocks.sendAiChatMessage,
  cancelAiChatRequest: mocks.cancelAiChatRequest,
}))

function getEditorView() {
  const editor = screen.getByLabelText('WGSL shader code')
  const view = EditorView.findFromDOM(editor)

  if (!view) {
    throw new Error('CodeMirror EditorView was not found')
  }

  return view
}

async function replaceEditorCode(code: string) {
  const view = getEditorView()

  await act(async () => {
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: code,
      },
    })
  })
}

function dispatchShortcut(target: Element, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

function getLastPreviewPaneProps(): PreviewPaneProps {
  const lastCall = mocks.PreviewPane.mock.lastCall as [PreviewPaneProps] | undefined

  if (!lastCall) {
    throw new Error('PreviewPane was not rendered')
  }

  return lastCall[0]
}

function getAiChatInput() {
  return screen.getByLabelText('AI chat message') as HTMLTextAreaElement
}

function submitAiChatMessage(message: string) {
  fireEvent.change(getAiChatInput(), { target: { value: message } })
  fireEvent.click(screen.getByRole('button', { name: 'Send AI chat message' }))
}

function mockAiChatSuccess(content = 'Assistant response', proposedCode: string | null = null) {
  mocks.sendAiChatMessage.mockImplementation(
    async (request: AiChatMessageRequest): Promise<AiChatMessageResponse> => ({
      requestId: request.requestId,
      message: {
        role: 'assistant',
        content,
        proposedCode,
        notes: [],
      },
    }),
  )
}

describe('App Run, Save, and keyboard shortcuts', () => {
  const createObjectURL = vi.fn(() => 'blob:shader')
  const revokeObjectURL = vi.fn()
  const anchorClick = vi.fn()
  let clickedAnchor: HTMLAnchorElement | null = null

  beforeEach(() => {
    mocks.PreviewPane.mockClear()
    mocks.sendAiChatMessage.mockReset()
    mocks.cancelAiChatRequest.mockReset()
    mocks.cancelAiChatRequest.mockResolvedValue({ requestId: 'request-id', canceled: true })
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    anchorClick.mockClear()
    clickedAnchor = null

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      clickedAnchor = document.querySelector('a')
      anchorClick()
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('saves the current editor code as shader.wgsl text/plain and revokes the object URL', async () => {
    render(<App />)
    await replaceEditorCode('fn mainImage(fragCoord: vec2f) -> vec4f { return vec4f(1.0); }')

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const [blob] = createObjectURL.mock.calls[0] as unknown as [Blob]
    expect(blob.type).toBe('text/plain')
    await expect(blob.text()).resolves.toBe(
      'fn mainImage(fragCoord: vec2f) -> vec4f { return vec4f(1.0); }',
    )
    expect(anchorClick).toHaveBeenCalledTimes(1)
    expect(clickedAnchor?.download).toBe('shader.wgsl')
    expect(clickedAnchor?.href).toBe('blob:shader')
    expect(document.querySelector('a')).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:shader')
  })

  it('saves only the current editor code after flipbook state changes', async () => {
    render(<App />)
    await replaceEditorCode('fn mainImage(fragCoord: vec2f) -> vec4f { return vec4f(0.5); }')

    act(() => {
      const props = getLastPreviewPaneProps()
      props.onPreviewModeChange('flipbook')
      props.onFlipbookChange({
        frameCount: 4,
        frameIntervalMs: 250,
        startTimeMs: 1000,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    const [blob] = createObjectURL.mock.calls[0] as unknown as [Blob]
    await expect(blob.text()).resolves.toBe(
      'fn mainImage(fragCoord: vec2f) -> vec4f { return vec4f(0.5); }',
    )
  })

  it('runs from the Run button by toggling shouldCompile as an edge trigger', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))

    await waitFor(() => {
      expect(mocks.PreviewPane).toHaveBeenLastCalledWith(
        expect.objectContaining({ shouldCompile: true }),
        undefined,
      )
    })

    fireEvent.click(screen.getByRole('button', { name: /^run$/i }))

    await waitFor(() => {
      expect(mocks.PreviewPane).toHaveBeenLastCalledWith(
        expect.objectContaining({ shouldCompile: false }),
        undefined,
      )
    })
  })

  it('runs with Ctrl+Enter from the CodeMirror editor without changing code', async () => {
    render(<App />)
    const editor = screen.getByLabelText('WGSL shader code')

    const event = dispatchShortcut(editor, { key: 'Enter', ctrlKey: true })

    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => {
      expect(mocks.PreviewPane).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: defaultShader, shouldCompile: true }),
        undefined,
      )
    })
  })

  it('saves with Ctrl+S from the CodeMirror editor and prevents default browser behavior', () => {
    render(<App />)
    const editor = screen.getByLabelText('WGSL shader code')

    const event = dispatchShortcut(editor, { key: 's', ctrlKey: true })

    expect(event.defaultPrevented).toBe(true)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:shader')
  })

  it('does not run or save for unmodified Enter or S key presses', () => {
    render(<App />)
    const editor = screen.getByLabelText('WGSL shader code')

    dispatchShortcut(editor, { key: 'Enter' })
    dispatchShortcut(editor, { key: 's' })

    expect(createObjectURL).not.toHaveBeenCalled()
    expect(mocks.PreviewPane).toHaveBeenLastCalledWith(
      expect.objectContaining({ shouldCompile: false }),
      undefined,
    )
  })

  it('supports Cmd shortcuts for macOS without changing code', async () => {
    render(<App />)
    const editor = screen.getByLabelText('WGSL shader code')

    const runEvent = dispatchShortcut(editor, { key: 'Enter', metaKey: true })
    const saveEvent = dispatchShortcut(editor, { key: 's', metaKey: true })

    expect(runEvent.defaultPrevented).toBe(true)
    expect(saveEvent.defaultPrevented).toBe(true)
    await waitFor(() => {
      expect(mocks.PreviewPane).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: defaultShader, shouldCompile: true }),
        undefined,
      )
    })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('A6-1: `EditorPane` / `ErrorPanel` / `ChatPanel` が `editor-column` 内に縦に並ぶ', () => {
    render(<App />)

    act(() => {
      getLastPreviewPaneProps().onCompileError('compile failed')
    })

    const editorColumn = screen.getByLabelText('Shader workspace').querySelector('.editor-column')
    const childClassNames = Array.from(editorColumn?.children ?? []).map((child) => child.className)

    expect(childClassNames[0]).toContain('editor-pane')
    expect(childClassNames[1]).toContain('error-panel')
    expect(childClassNames[2]).toContain('chat-panel')
  })

  it('A6-1: ChatPanel に現在の `code` が渡る', async () => {
    mockAiChatSuccess()
    render(<App />)
    await replaceEditorCode('fn mainImage() -> vec4f { return vec4f(0.25); }')

    submitAiChatMessage('use current code')

    await waitFor(() => expect(mocks.sendAiChatMessage).toHaveBeenCalledTimes(1))
    const payload = mocks.sendAiChatMessage.mock.calls[0][0] as AiChatMessageRequest
    expect(payload.code).toBe('fn mainImage() -> vec4f { return vec4f(0.25); }')
  })

  it('A6-1: ChatPanel の Apply callback で `EditorPane` の code が置き換わる', async () => {
    mockAiChatSuccess('Patch ready', 'fn mainImage() -> vec4f { return vec4f(0.75); }')
    render(<App />)

    submitAiChatMessage('replace code')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply proposed code from assistant message 2' }))

    await waitFor(() => {
      expect(getEditorView().state.doc.toString()).toBe(
        'fn mainImage() -> vec4f { return vec4f(0.75); }',
      )
    })
  })

  it('A6-1: Apply だけでは `shouldCompile` が反転しない', async () => {
    mockAiChatSuccess('Patch ready', 'fn mainImage() -> vec4f { return vec4f(0.75); }')
    render(<App />)

    submitAiChatMessage('replace code')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply proposed code from assistant message 2' }))

    await waitFor(() => {
      expect(getLastPreviewPaneProps().code).toBe('fn mainImage() -> vec4f { return vec4f(0.75); }')
    })
    expect(getLastPreviewPaneProps().shouldCompile).toBe(false)
  })

  it('A6-1: Apply だけでは Preview が更新されない', async () => {
    mockAiChatSuccess('Patch ready', 'fn mainImage() -> vec4f { return vec4f(0.75); }')
    render(<App />)

    submitAiChatMessage('replace code')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply proposed code from assistant message 2' }))

    await waitFor(() => {
      expect(screen.getByText('Compile: Idle')).toBeInTheDocument()
    })
    expect(getLastPreviewPaneProps().shouldCompile).toBe(false)
  })

  it('A6-1: Apply だけでは ErrorPanel が変更されない', async () => {
    mockAiChatSuccess('Patch ready', 'fn mainImage() -> vec4f { return vec4f(0.75); }')
    render(<App />)
    act(() => {
      getLastPreviewPaneProps().onCompileError('compile failed before apply')
    })

    submitAiChatMessage('replace code')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply proposed code from assistant message 2' }))

    expect(await screen.findByText('compile failed before apply')).toBeInTheDocument()
    expect(screen.getByText('Compile: Error')).toBeInTheDocument()
  })

  it('A6-1: Reset は code を戻すがチャット履歴は ChatPanel state として維持される', async () => {
    mockAiChatSuccess('History stays')
    render(<App />)
    await replaceEditorCode('fn mainImage() -> vec4f { return vec4f(0.25); }')

    submitAiChatMessage('keep history')
    expect(await screen.findByText('History stays')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }))

    await waitFor(() => {
      expect(getEditorView().state.doc.toString()).toBe(defaultShader)
    })
    expect(screen.getByText('keep history')).toBeInTheDocument()
    expect(screen.getByText('History stays')).toBeInTheDocument()
  })

  it('A6-1: Save は code だけを保存し、チャット履歴を保存しない', async () => {
    mockAiChatSuccess('Assistant text that must not be saved')
    render(<App />)
    await replaceEditorCode('fn mainImage() -> vec4f { return vec4f(0.25); }')

    submitAiChatMessage('User text that must not be saved')
    expect(await screen.findByText('Assistant text that must not be saved')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    const [blob] = createObjectURL.mock.calls[0] as unknown as [Blob]
    await expect(blob.text()).resolves.toBe('fn mainImage() -> vec4f { return vec4f(0.25); }')
    await expect(blob.text()).resolves.not.toContain('User text that must not be saved')
    await expect(blob.text()).resolves.not.toContain('Assistant text that must not be saved')
  })

  it('A6-2: チャット入力欄にフォーカスがない時の `Ctrl+Enter` は既存通り Run', async () => {
    render(<App />)
    const editor = screen.getByLabelText('WGSL shader code')

    const event = dispatchShortcut(editor, { key: 'Enter', ctrlKey: true })

    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => {
      expect(getLastPreviewPaneProps().shouldCompile).toBe(true)
    })
  })

  it('A6-2: チャット入力欄にフォーカスがない時の `Meta+Enter` は既存通り Run', async () => {
    render(<App />)
    const editor = screen.getByLabelText('WGSL shader code')

    const event = dispatchShortcut(editor, { key: 'Enter', metaKey: true })

    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => {
      expect(getLastPreviewPaneProps().shouldCompile).toBe(true)
    })
  })

  it('A6-2: チャット入力欄にフォーカスがある時の `Ctrl+Enter` は Run しない', async () => {
    mockAiChatSuccess()
    render(<App />)

    fireEvent.change(getAiChatInput(), { target: { value: 'send without run' } })
    fireEvent.keyDown(getAiChatInput(), { key: 'Enter', ctrlKey: true })

    await waitFor(() => expect(mocks.sendAiChatMessage).toHaveBeenCalledTimes(1))
    expect(getLastPreviewPaneProps().shouldCompile).toBe(false)
  })

  it('A6-2: チャット入力欄にフォーカスがある時の `Meta+Enter` は Run しない', async () => {
    mockAiChatSuccess()
    render(<App />)

    fireEvent.change(getAiChatInput(), { target: { value: 'send without run' } })
    fireEvent.keyDown(getAiChatInput(), { key: 'Enter', metaKey: true })

    await waitFor(() => expect(mocks.sendAiChatMessage).toHaveBeenCalledTimes(1))
    expect(getLastPreviewPaneProps().shouldCompile).toBe(false)
  })

  it('A6-2: チャット入力欄にフォーカスがある時の `Ctrl+Enter` はチャット送信する', async () => {
    mockAiChatSuccess('Sent by Ctrl')
    render(<App />)

    fireEvent.change(getAiChatInput(), { target: { value: 'send with ctrl' } })
    fireEvent.keyDown(getAiChatInput(), { key: 'Enter', ctrlKey: true })

    await waitFor(() => expect(mocks.sendAiChatMessage).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Sent by Ctrl')).toBeInTheDocument()
  })

  it('A6-2: チャット入力欄にフォーカスがある時の `Meta+Enter` はチャット送信する', async () => {
    mockAiChatSuccess('Sent by Meta')
    render(<App />)

    fireEvent.change(getAiChatInput(), { target: { value: 'send with meta' } })
    fireEvent.keyDown(getAiChatInput(), { key: 'Enter', metaKey: true })

    await waitFor(() => expect(mocks.sendAiChatMessage).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Sent by Meta')).toBeInTheDocument()
  })

  it('A6-2: `Ctrl+S` はチャット入力欄にフォーカスがない時だけ既存通り Save', () => {
    render(<App />)

    dispatchShortcut(getAiChatInput(), { key: 's', ctrlKey: true })
    expect(createObjectURL).not.toHaveBeenCalled()

    dispatchShortcut(screen.getByLabelText('WGSL shader code'), { key: 's', ctrlKey: true })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('A6-2: `Meta+S` はチャット入力欄にフォーカスがない時だけ既存通り Save', () => {
    render(<App />)

    dispatchShortcut(getAiChatInput(), { key: 's', metaKey: true })
    expect(createObjectURL).not.toHaveBeenCalled()

    dispatchShortcut(screen.getByLabelText('WGSL shader code'), { key: 's', metaKey: true })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })
})

describe('App preview mode and flipbook integration', () => {
  beforeEach(() => {
    mocks.PreviewPane.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes the initial live mode and flipbook settings to PreviewPane', () => {
    render(<App />)

    expect(mocks.PreviewPane).toHaveBeenLastCalledWith(
      expect.objectContaining({
        previewMode: 'live',
        flipbook: initialFlipbookSettings,
      }),
      undefined,
    )
  })

  it('updates previewMode when PreviewPane commits a mode change and passes it to StatusBar', async () => {
    render(<App />)

    act(() => {
      getLastPreviewPaneProps().onPreviewModeChange('flipbook')
    })

    await waitFor(() => {
      expect(mocks.PreviewPane).toHaveBeenLastCalledWith(
        expect.objectContaining({
          previewMode: 'flipbook',
        }),
        undefined,
      )
    })
    expect(screen.getByText('FPS: Paused')).toBeInTheDocument()
  })

  it('stores normalized flipbook settings committed by PreviewPane', async () => {
    render(<App />)
    const normalizedSettings = {
      frameCount: 64,
      frameIntervalMs: 0,
      startTimeMs: 3600000,
    }

    act(() => {
      getLastPreviewPaneProps().onFlipbookChange(normalizedSettings)
    })

    await waitFor(() => {
      expect(mocks.PreviewPane).toHaveBeenLastCalledWith(
        expect.objectContaining({
          flipbook: normalizedSettings,
        }),
        undefined,
      )
    })
  })

  it('keeps flipbook settings and preview mode when Reset restores only the shader code', async () => {
    render(<App />)
    const normalizedSettings = {
      frameCount: 9,
      frameIntervalMs: 250,
      startTimeMs: 500,
    }

    await replaceEditorCode('fn mainImage(fragCoord: vec2f) -> vec4f { return vec4f(1.0); }')
    act(() => {
      const props = getLastPreviewPaneProps()
      props.onPreviewModeChange('flipbook')
      props.onFlipbookChange(normalizedSettings)
    })

    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }))

    await waitFor(() => {
      expect(mocks.PreviewPane).toHaveBeenLastCalledWith(
        expect.objectContaining({
          code: defaultShader,
          previewMode: 'flipbook',
          flipbook: normalizedSettings,
        }),
        undefined,
      )
    })
  })
})

describe('App compile status and error display', () => {
  beforeEach(() => {
    mocks.PreviewPane.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows compile errors from PreviewPane and clears them on compile success', async () => {
    render(<App />)

    const previewProps = getLastPreviewPaneProps()

    act(() => {
      previewProps.onCompileError("error: unresolved identifier 'uniform'")
    })

    expect(screen.getByText('Compile: Error')).toBeInTheDocument()
    expect(screen.getByText("error: unresolved identifier 'uniform'")).toBeInTheDocument()
    expect(
      screen.getByText('Line numbers refer to the generated WGSL, which wraps your code.'),
    ).toBeInTheDocument()

    act(() => {
      previewProps.onCompileSuccess()
    })

    await waitFor(() => {
      expect(screen.getByText('Compile: Success')).toBeInTheDocument()
    })
    expect(screen.queryByText("error: unresolved identifier 'uniform'")).not.toBeInTheDocument()
  })
})
