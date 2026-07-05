import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const SHADER_DRAFT_STORAGE_KEY = 'shaderbook:shader-draft:v1'

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

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

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

function mockWorkspaceRect(element: Element, rect: Partial<DOMRect>) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: rect.x ?? 0,
    y: rect.y ?? 0,
    width: rect.width ?? 1000,
    height: rect.height ?? 700,
    top: rect.top ?? 0,
    right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 1000),
    bottom: rect.bottom ?? 700,
    left: rect.left ?? 0,
    toJSON: () => {},
  } as DOMRect)
}

describe('App shader draft persistence', () => {
  it('starts with the stored WGSL draft when localStorage has a valid draft', () => {
    window.localStorage.setItem(
      SHADER_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        code: 'fn mainImage() -> vec4f { return vec4f(0.8); }',
        savedAt: 1000,
      }),
    )

    render(<App />)

    expect(getEditorView().state.doc.toString()).toBe(
      'fn mainImage() -> vec4f { return vec4f(0.8); }',
    )
  })

  it('falls back to the default shader when the stored draft is invalid', () => {
    window.localStorage.setItem(SHADER_DRAFT_STORAGE_KEY, '{"version":0,"code":false}')

    render(<App />)

    expect(getEditorView().state.doc.toString()).toBe(defaultShader)
  })

  it('stores changed WGSL code every 5 seconds only when the content changed', async () => {
    vi.useFakeTimers()
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    render(<App />)

    await replaceEditorCode('fn mainImage() -> vec4f { return vec4f(0.25); }')

    act(() => {
      vi.advanceTimersByTime(4999)
    })

    expect(window.localStorage.getItem(SHADER_DRAFT_STORAGE_KEY)).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(setItemSpy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(window.localStorage.getItem(SHADER_DRAFT_STORAGE_KEY) ?? '{}')).toEqual(
      expect.objectContaining({
        version: 1,
        code: 'fn mainImage() -> vec4f { return vec4f(0.25); }',
      }),
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(setItemSpy).toHaveBeenCalledTimes(1)

    await replaceEditorCode('fn mainImage() -> vec4f { return vec4f(0.75); }')

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(setItemSpy).toHaveBeenCalledTimes(2)
    expect(JSON.parse(window.localStorage.getItem(SHADER_DRAFT_STORAGE_KEY) ?? '{}')).toEqual(
      expect.objectContaining({
        version: 1,
        code: 'fn mainImage() -> vec4f { return vec4f(0.75); }',
      }),
    )
  })
})

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
    const editorStack = editorColumn?.querySelector('.editor-stack')
    const editorStackChildClassNames = Array.from(editorStack?.children ?? []).map(
      (child) => child.className,
    )

    expect(childClassNames[0]).toContain('editor-stack')
    expect(childClassNames[1]).toContain('chat-splitter')
    expect(childClassNames[2]).toContain('chat-panel')
    expect(editorStackChildClassNames[0]).toContain('editor-pane')
    expect(editorStackChildClassNames[1]).toContain('error-panel')
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

  it('A6-1: Apply で `shouldCompile` が反転して Run が実行される', async () => {
    mockAiChatSuccess('Patch ready', 'fn mainImage() -> vec4f { return vec4f(0.75); }')
    render(<App />)

    submitAiChatMessage('replace code')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply proposed code from assistant message 2' }))

    await waitFor(() => {
      expect(getLastPreviewPaneProps().code).toBe('fn mainImage() -> vec4f { return vec4f(0.75); }')
    })
    expect(getLastPreviewPaneProps().shouldCompile).toBe(true)
  })

  it('A6-1: Apply は Run ボタンと同じ edge trigger として毎回反転する', async () => {
    mockAiChatSuccess('Patch ready', 'fn mainImage() -> vec4f { return vec4f(0.75); }')
    render(<App />)

    submitAiChatMessage('replace code')
    const applyButton = await screen.findByRole('button', { name: 'Apply proposed code from assistant message 2' })
    fireEvent.click(applyButton)

    await waitFor(() => {
      expect(getLastPreviewPaneProps().shouldCompile).toBe(true)
    })
    fireEvent.click(applyButton)

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

describe('App workspace resizing', () => {
  beforeEach(() => {
    mocks.PreviewPane.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders an accessible separator between the editor and preview', () => {
    render(<App />)

    const splitter = screen.getByRole('separator', {
      name: 'Resize editor and preview panels',
    })

    expect(splitter).toHaveAttribute('aria-orientation', 'vertical')
    expect(splitter).toHaveAttribute('aria-valuenow', '45')
    expect(splitter).toHaveAttribute('tabindex', '0')
  })

  it('changes the editor and preview widths by dragging the separator', () => {
    render(<App />)
    const workspace = screen.getByLabelText('Shader workspace')
    const splitter = screen.getByRole('separator', {
      name: 'Resize editor and preview panels',
    })
    mockWorkspaceRect(workspace, { left: 100, width: 1000 })

    fireEvent.pointerDown(splitter, { clientX: 550, pointerId: 1 })
    fireEvent.pointerMove(splitter, { clientX: 700, pointerId: 1 })
    fireEvent.pointerUp(splitter, { pointerId: 1 })

    expect(splitter).toHaveAttribute('aria-valuenow', '60')
    expect(workspace).toHaveStyle({
      gridTemplateColumns: 'minmax(320px, 60%) 8px minmax(360px, 1fr)',
    })
  })

  it('clamps drag resizing so the preview keeps its minimum width', () => {
    render(<App />)
    const workspace = screen.getByLabelText('Shader workspace')
    const splitter = screen.getByRole('separator', {
      name: 'Resize editor and preview panels',
    })
    mockWorkspaceRect(workspace, { left: 0, width: 1000 })

    fireEvent.pointerDown(splitter, { clientX: 900, pointerId: 1 })

    expect(splitter).toHaveAttribute('aria-valuenow', '63')
    expect(workspace).toHaveStyle({
      gridTemplateColumns: 'minmax(320px, 63.2%) 8px minmax(360px, 1fr)',
    })
  })

  it('supports keyboard resizing from the separator', () => {
    render(<App />)
    const workspace = screen.getByLabelText('Shader workspace')
    const splitter = screen.getByRole('separator', {
      name: 'Resize editor and preview panels',
    })
    mockWorkspaceRect(workspace, { left: 0, width: 1000 })

    fireEvent.keyDown(splitter, { key: 'ArrowRight' })

    expect(splitter).toHaveAttribute('aria-valuenow', '48')
    expect(workspace).toHaveStyle({
      gridTemplateColumns: 'minmax(320px, 48.2%) 8px minmax(360px, 1fr)',
    })
  })

  it('renders an accessible separator between the editor and AI chat', () => {
    render(<App />)

    const splitter = screen.getByRole('separator', {
      name: 'Resize editor and AI chat panels',
    })

    expect(splitter).toHaveAttribute('aria-orientation', 'horizontal')
    expect(splitter).toHaveAttribute('aria-valuenow', '52')
    expect(splitter).toHaveAttribute('tabindex', '0')
  })

  it('changes the editor and AI chat heights by dragging the separator', () => {
    render(<App />)
    const editorColumn = screen.getByLabelText('Shader workspace').querySelector('.editor-column')
    const splitter = screen.getByRole('separator', {
      name: 'Resize editor and AI chat panels',
    })

    if (!editorColumn) {
      throw new Error('editor column was not found')
    }

    mockWorkspaceRect(editorColumn, { top: 100, height: 800 })

    fireEvent.pointerDown(splitter, { clientY: 516, pointerId: 1 })
    fireEvent.pointerMove(splitter, { clientY: 620, pointerId: 1 })
    fireEvent.pointerUp(splitter, { pointerId: 1 })

    expect(splitter).toHaveAttribute('aria-valuenow', '65')
    expect(editorColumn).toHaveStyle({
      gridTemplateRows: 'minmax(180px, 65%) 8px minmax(180px, 1fr)',
    })
  })

  it('clamps chat resizing so the AI chat keeps its minimum height', () => {
    render(<App />)
    const editorColumn = screen.getByLabelText('Shader workspace').querySelector('.editor-column')
    const splitter = screen.getByRole('separator', {
      name: 'Resize editor and AI chat panels',
    })

    if (!editorColumn) {
      throw new Error('editor column was not found')
    }

    mockWorkspaceRect(editorColumn, { top: 0, height: 800 })

    fireEvent.pointerDown(splitter, { clientY: 780, pointerId: 1 })

    expect(splitter).toHaveAttribute('aria-valuenow', '77')
    expect(editorColumn).toHaveStyle({
      gridTemplateRows: 'minmax(180px, 76.5%) 8px minmax(180px, 1fr)',
    })
  })

  it('supports keyboard resizing between the editor and AI chat', () => {
    render(<App />)
    const editorColumn = screen.getByLabelText('Shader workspace').querySelector('.editor-column')
    const splitter = screen.getByRole('separator', {
      name: 'Resize editor and AI chat panels',
    })

    if (!editorColumn) {
      throw new Error('editor column was not found')
    }

    mockWorkspaceRect(editorColumn, { top: 0, height: 800 })

    fireEvent.keyDown(splitter, { key: 'ArrowDown' })

    expect(splitter).toHaveAttribute('aria-valuenow', '56')
    expect(editorColumn).toHaveStyle({
      gridTemplateRows: 'minmax(180px, 56%) 8px minmax(180px, 1fr)',
    })
  })

  it('maximizes the editor height while AI chat is hidden', () => {
    render(<App />)
    const editorColumn = screen.getByLabelText('Shader workspace').querySelector('.editor-column')
    const chatPanel = screen.getByRole('heading', { name: 'AI Chat' }).closest('.chat-panel')

    if (!editorColumn || !chatPanel) {
      throw new Error('editor column or chat panel was not found')
    }

    fireEvent.click(within(chatPanel as HTMLElement).getByRole('button', { name: 'Hide' }))

    expect(
      screen.queryByRole('separator', { name: 'Resize editor and AI chat panels' }),
    ).not.toBeInTheDocument()
    expect(editorColumn).toHaveStyle({
      gridTemplateRows: 'minmax(180px, 1fr) auto',
    })
    expect(within(chatPanel as HTMLElement).getByRole('button', { name: 'Show' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
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
