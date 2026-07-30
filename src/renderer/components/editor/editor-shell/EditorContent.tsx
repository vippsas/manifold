import React from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import { viewerStyles } from '../code-viewer/CodeViewer.styles'

interface EditorContentProps {
  filePath: string | null
  fileContent: string | null
  language: string
  monacoTheme: string
  options: monacoEditor.IStandaloneEditorConstructionOptions
  onMount?: OnMount
  onChange?: (value: string | undefined) => void
}

export function EditorContent({
  filePath,
  fileContent,
  language,
  monacoTheme,
  options,
  onMount,
  onChange,
}: EditorContentProps): React.JSX.Element {
  if (fileContent !== null) {
    return (
      <Editor
        // Keep Monaco mounted across disk refreshes so its undo stack survives.
        // A file switch still remounts the editor and starts a separate history.
        key={filePath ?? '__no-file__'}
        value={fileContent}
        language={language}
        theme={monacoTheme}
        options={options}
        onMount={onMount}
        onChange={onChange}
      />
    )
  }

  return (
    <div style={viewerStyles.empty}>
      Select a file to view its contents
    </div>
  )
}
