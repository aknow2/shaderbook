import { history, historyKeymap, indentWithTab, defaultKeymap } from '@codemirror/commands'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  type KeyBinding,
} from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { useEffect, useRef } from 'react'
import { wgslLanguage } from '../editor/wgslLanguage'

export type EditorPaneProps = {
  code: string
  onChange: (code: string) => void
}

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'var(--color-code-bg)',
      fontSize: '13px',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      lineHeight: '1.65',
    },
    '.cm-content': {
      minHeight: '100%',
      padding: '18px 0',
      caretColor: '#ffffff',
    },
    '.cm-line': {
      padding: '0 20px',
    },
    '.cm-gutters': {
      borderRight: '1px solid var(--color-border)',
      backgroundColor: 'var(--color-code-bg)',
      color: 'var(--color-text-muted)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.045)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255, 255, 255, 0.055)',
      color: 'var(--color-text)',
    },
    '&.cm-focused': {
      outline: '2px solid var(--color-accent)',
      outlineOffset: '-2px',
    },
  },
  { dark: true },
)

const runShortcutKeymap: readonly KeyBinding[] = [{ key: 'Mod-Enter', run: () => true }]

export function EditorPane({ code, onChange }: EditorPaneProps) {
  const editorHostRef = useRef<HTMLDivElement | null>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const initialCodeRef = useRef(code)
  const onChangeRef = useRef(onChange)
  const isSyncingFromPropRef = useRef(false)

  onChangeRef.current = onChange

  useEffect(() => {
    if (!editorHostRef.current || editorViewRef.current) {
      return
    }

    const view = new EditorView({
      parent: editorHostRef.current,
      state: EditorState.create({
        doc: initialCodeRef.current,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          wgslLanguage,
          oneDark,
          editorTheme,
          keymap.of([indentWithTab, ...runShortcutKeymap, ...historyKeymap, ...defaultKeymap]),
          EditorView.contentAttributes.of({
            'aria-label': 'WGSL shader code',
            'aria-multiline': 'true',
            role: 'textbox',
            spellcheck: 'false',
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || isSyncingFromPropRef.current) {
              return
            }

            onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })

    editorViewRef.current = view

    return () => {
      view.destroy()
      editorViewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = editorViewRef.current
    if (!view) {
      return
    }

    const currentCode = view.state.doc.toString()
    if (code === currentCode) {
      return
    }

    isSyncingFromPropRef.current = true
    try {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: code,
        },
      })
    } finally {
      isSyncingFromPropRef.current = false
    }
  }, [code])

  return (
    <section className="panel editor-pane" aria-labelledby="editor-title">
      <div className="panel-header">
        <h2 id="editor-title">Editor</h2>
      </div>
      <div className="file-tabs" aria-label="Open shader files">
        <button
          type="button"
          className="file-tab"
          aria-label="Open shader file shader.wgsl"
          aria-current="page"
        >
          shader.wgsl
        </button>
      </div>
      <div ref={editorHostRef} className="shader-editor" />
    </section>
  )
}
