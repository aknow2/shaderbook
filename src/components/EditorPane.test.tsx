import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { EditorPane } from './EditorPane'

function getEditorView() {
  const editor = screen.getByLabelText('WGSL shader code')
  const view = EditorView.findFromDOM(editor)

  if (!view) {
    throw new Error('CodeMirror EditorView was not found')
  }

  return view
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

describe('EditorPane', () => {
  it('shows the shader tab and current code', () => {
    render(<EditorPane code="fn mainImage() {}" onChange={vi.fn()} />)

    expect(screen.getByText('Editor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide', expanded: true })).toBeInTheDocument()
    expect(screen.getByText('shader.wgsl')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open shader file shader.wgsl' })).toHaveAttribute(
      'aria-label',
      'Open shader file shader.wgsl',
    )
    expect(getEditorView().state.doc.toString()).toBe('fn mainImage() {}')
  })

  it('hides and shows the editor content without losing the current document', () => {
    render(<EditorPane code="fn mainImage() {}" onChange={vi.fn()} />)
    const view = getEditorView()

    act(() => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: 'updated shader code' },
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Hide', expanded: true }))

    expect(screen.getByRole('button', { name: 'Show', expanded: false })).toBeInTheDocument()
    expect(screen.getByLabelText('WGSL shader code')).not.toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Show', expanded: false }))

    expect(screen.getByRole('button', { name: 'Hide', expanded: true })).toBeInTheDocument()
    expect(getEditorView()).toBe(view)
    expect(getEditorView().state.doc.toString()).toBe('updated shader code')
  })

  it('calls onChange when the editor document changes', () => {
    const onChange = vi.fn()
    render(<EditorPane code="old" onChange={onChange} />)
    const view = getEditorView()

    act(() => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: 'new shader code' },
      })
    })

    expect(onChange).toHaveBeenCalledWith('new shader code')
  })

  it('syncs external code prop changes into the existing editor view', () => {
    const { rerender } = render(<EditorPane code="old" onChange={vi.fn()} />)
    const view = getEditorView()

    rerender(<EditorPane code="reset shader code" onChange={vi.fn()} />)

    expect(getEditorView()).toBe(view)
    expect(view.state.doc.toString()).toBe('reset shader code')
  })

  it('keeps content stable through the onChange to code prop round trip', async () => {
    const onChange = vi.fn()

    function ControlledEditor() {
      const [code, setCode] = useState('old')

      return (
        <EditorPane
          code={code}
          onChange={(nextCode) => {
            onChange(nextCode)
            setCode(nextCode)
          }}
        />
      )
    }

    render(<ControlledEditor />)
    const view = getEditorView()

    act(() => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: 'round trip shader code' },
      })
    })

    await waitFor(() => {
      expect(view.state.doc.toString()).toBe('round trip shader code')
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('renders line numbers', () => {
    const { container } = render(<EditorPane code={'first\nsecond'} onChange={vi.fn()} />)

    expect(container.querySelector('.cm-lineNumbers')).toBeInTheDocument()
    expect(container.querySelector('.cm-lineNumbers')).toHaveTextContent('1')
    expect(container.querySelector('.cm-lineNumbers')).toHaveTextContent('2')
  })

  it('opens the search panel with Mod+F and closes it with Escape', () => {
    const onChange = vi.fn()
    const { container } = render(<EditorPane code={'first\nsecond'} onChange={onChange} />)
    const editor = screen.getByLabelText('WGSL shader code')

    dispatchShortcut(editor, { key: 'f', ctrlKey: true })

    const searchInput = screen.getByPlaceholderText('Find')
    expect(searchInput).toBeInTheDocument()
    expect(container.querySelector('.cm-panels-top')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()

    dispatchShortcut(searchInput, { key: 'Escape' })

    expect(screen.queryByPlaceholderText('Find')).not.toBeInTheDocument()
  })

  it('finds and selects matches from the search panel', () => {
    render(<EditorPane code={'alpha\nbeta\nalpha'} onChange={vi.fn()} />)
    const editor = screen.getByLabelText('WGSL shader code')
    const view = getEditorView()

    dispatchShortcut(editor, { key: 'f', ctrlKey: true })
    fireEvent.change(screen.getByPlaceholderText('Find'), { target: { value: 'beta' } })
    // The search panel's Enter handler checks the legacy event.keyCode field.
    fireEvent.keyDown(screen.getByPlaceholderText('Find'), { key: 'Enter', keyCode: 13 })

    const { from, to } = view.state.selection.main
    expect(view.state.sliceDoc(from, to)).toBe('beta')
  })

  it('does not change the document for Ctrl+Enter and still lets the event bubble', () => {
    const onChange = vi.fn()
    const documentKeyDown = vi.fn()
    render(<EditorPane code={'first\nsecond'} onChange={onChange} />)
    const editor = screen.getByLabelText('WGSL shader code')
    const view = getEditorView()

    document.addEventListener('keydown', documentKeyDown)
    try {
      dispatchShortcut(editor, { key: 'Enter', ctrlKey: true })
    } finally {
      document.removeEventListener('keydown', documentKeyDown)
    }

    expect(onChange).not.toHaveBeenCalled()
    expect(view.state.doc.toString()).toBe('first\nsecond')
    expect(documentKeyDown).toHaveBeenCalledTimes(1)
  })

  it('does not change the document for Cmd+Enter and still lets the event bubble', () => {
    const onChange = vi.fn()
    const documentKeyDown = vi.fn()
    render(<EditorPane code={'first\nsecond'} onChange={onChange} />)
    const editor = screen.getByLabelText('WGSL shader code')
    const view = getEditorView()

    document.addEventListener('keydown', documentKeyDown)
    try {
      dispatchShortcut(editor, { key: 'Enter', metaKey: true })
    } finally {
      document.removeEventListener('keydown', documentKeyDown)
    }

    expect(onChange).not.toHaveBeenCalled()
    expect(view.state.doc.toString()).toBe('first\nsecond')
    expect(documentKeyDown).toHaveBeenCalledTimes(1)
  })
})
