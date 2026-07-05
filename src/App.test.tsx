import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { PreviewPaneProps } from './components/PreviewPane'
import { defaultShader } from './constants/defaultShader'
import { initialFlipbookSettings } from './types/preview'

const mocks = vi.hoisted(() => ({
  PreviewPane: vi.fn(() => null),
}))

vi.mock('./components/PreviewPane', () => ({
  PreviewPane: mocks.PreviewPane,
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

describe('App Run, Save, and keyboard shortcuts', () => {
  const createObjectURL = vi.fn(() => 'blob:shader')
  const revokeObjectURL = vi.fn()
  const anchorClick = vi.fn()
  let clickedAnchor: HTMLAnchorElement | null = null

  beforeEach(() => {
    mocks.PreviewPane.mockClear()
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
