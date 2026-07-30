import { useCallback, useState } from 'react'
import type { editor as monacoEditor } from 'monaco-editor'
import type { EditorStatusInfo } from './EditorStatusBar'

type StatusState = Omit<EditorStatusInfo, 'language'>

const INITIAL: StatusState = {
  line: 1,
  column: 1,
  selectionLength: 0,
  indent: 'Spaces: 2',
  eol: 'LF',
}

/**
 * Tracks cursor position, selection size, indentation, and EOL for the active
 * editor. `bindEditor` is called from the editor's onMount; it reads the initial
 * state and subscribes to cursor/selection changes. Monaco disposes these
 * listeners when the editor instance is disposed (on file remount).
 */
export function useEditorStatusBar(language: string): {
  statusInfo: EditorStatusInfo
  bindEditor: (editor: monacoEditor.IStandaloneCodeEditor) => void
} {
  const [state, setState] = useState<StatusState>(INITIAL)

  const bindEditor = useCallback((editor: monacoEditor.IStandaloneCodeEditor): void => {
    const read = (): void => {
      const model = editor.getModel()
      const position = editor.getPosition()
      const selection = editor.getSelection()
      const options = model?.getOptions()
      const selectionLength = selection && model ? model.getValueInRange(selection).length : 0
      setState({
        line: position?.lineNumber ?? 1,
        column: position?.column ?? 1,
        selectionLength,
        indent: options?.insertSpaces
          ? `Spaces: ${options.indentSize}`
          : `Tab Size: ${options?.tabSize ?? 4}`,
        eol: model?.getEOL() === '\r\n' ? 'CRLF' : 'LF',
      })
    }
    // Call exactly once per editor instance: Monaco's onMount fires once per
    // mounted editor, and disposes these listeners when that editor is disposed
    // (the <Editor> is keyed by filePath, so it remounts on a file switch).
    // Calling bindEditor twice on the same instance would stack listeners.
    read()
    editor.onDidChangeCursorPosition(read)
    editor.onDidChangeCursorSelection(read)
  }, [])

  return { statusInfo: { ...state, language }, bindEditor }
}
