import { history, historyKeymap, indentWithTab, defaultKeymap } from '@codemirror/commands'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  type KeyBinding,
} from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { useEffect, useRef, useState } from 'react'
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
    '.cm-panels': {
      backgroundColor: 'var(--color-bg-elevated)',
      color: 'var(--color-text)',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid var(--color-border)',
    },
    '.cm-panel.cm-search': {
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      padding: '6px 12px',
    },
    '.cm-panel.cm-search input, .cm-panel.cm-search button': {
      fontFamily: 'inherit',
      fontSize: 'inherit',
      color: 'var(--color-text)',
    },
    '.cm-panel.cm-search .cm-textfield': {
      backgroundColor: 'var(--color-panel-soft)',
      border: '1px solid var(--color-border-strong)',
      borderRadius: '4px',
    },
    '.cm-panel.cm-search .cm-textfield:focus': {
      outline: '1px solid var(--color-accent)',
      outlineOffset: '-1px',
    },
    '.cm-panel.cm-search .cm-button': {
      background: 'var(--color-panel-soft)',
      backgroundImage: 'none',
      border: '1px solid var(--color-border-strong)',
      borderRadius: '4px',
    },
    '.cm-panel.cm-search .cm-button:hover': {
      borderColor: 'var(--color-accent)',
    },
    '.cm-panel.cm-search [name="close"]': {
      color: 'var(--color-text-muted)',
      fontSize: '16px',
      padding: '0 6px',
    },
  },
  { dark: true },
)

const runShortcutKeymap: readonly KeyBinding[] = [{ key: 'Mod-Enter', run: () => true }]

export function EditorPane({ code, onChange }: EditorPaneProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(true)
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
          search({ top: true }),
          highlightSelectionMatches(),
          wgslLanguage,
          oneDark,
          editorTheme,
          keymap.of([
            indentWithTab,
            ...runShortcutKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...defaultKeymap,
          ]),
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
    <section
      className={isEditorOpen ? 'panel editor-pane' : 'panel editor-pane editor-pane-collapsed'}
      aria-labelledby="editor-title"
    >
      <div className="panel-header">
        <h2 id="editor-title">Editor</h2>
        <button
          type="button"
          className="control-button"
          aria-controls="editor-content"
          aria-expanded={isEditorOpen}
          onClick={() => setIsEditorOpen((current) => !current)}
        >
          {isEditorOpen ? 'Hide' : 'Show'}
        </button>
      </div>
      <div id="editor-content" className="editor-pane-body" hidden={!isEditorOpen}>
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
      </div>
    </section>
  )
}
