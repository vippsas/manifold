import React from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { viewerStyles } from './CodeViewer.styles'

const BASE_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  fontFamily: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
  lineNumbers: 'on' as const,
  renderLineHighlight: 'none' as const,
  wordWrap: 'on' as const,
}

const EDITABLE_OPTIONS = { ...BASE_EDITOR_OPTIONS, readOnly: false }

interface EditorContentProps {
  filePath: string | null
  fileContent: string | null
  refreshVersion: number
  language: string
  monacoTheme: string
  onMount?: OnMount
  onChange?: (value: string | undefined) => void
}

export function EditorContent({
  filePath,
  fileContent,
  refreshVersion,
  language,
  monacoTheme,
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
        options={EDITABLE_OPTIONS}
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
