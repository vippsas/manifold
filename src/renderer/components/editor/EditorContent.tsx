import React from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import { viewerStyles } from './code-viewer/CodeViewer.styles'

interface EditorContentProps {
  filePath: string | null
  fileContent: string | null
  refreshVersion: number
  language: string
  monacoTheme: string
  options: monacoEditor.IStandaloneEditorConstructionOptions
  onMount?: OnMount
  onChange?: (value: string | undefined) => void
}

export function EditorContent({
  filePath,
  fileContent,
  refreshVersion,
  language,
  monacoTheme,
  options,
  onMount,
  onChange,
}: EditorContentProps): React.JSX.Element {
  if (fileContent !== null) {
    return (
      <Editor
        key={`${filePath ?? '__no-file__'}:${refreshVersion}`}
        defaultValue={fileContent}
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
