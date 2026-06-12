import React from 'react'
import { viewerStyles } from './code-viewer/CodeViewer.styles'

export interface EditorStatusInfo {
  line: number
  column: number
  selectionLength: number
  language: string
  indent: string
  eol: 'LF' | 'CRLF'
}

export function EditorStatusBar({ info }: { info: EditorStatusInfo }): React.JSX.Element {
  return (
    <div style={viewerStyles.statusBar} data-testid="editor-status-bar">
      <span style={viewerStyles.statusItem}>Ln {info.line}, Col {info.column}</span>
      {info.selectionLength > 0 && (
        <span style={viewerStyles.statusItem}>({info.selectionLength} selected)</span>
      )}
      <span style={viewerStyles.statusSpacer} />
      <span style={viewerStyles.statusItem}>{info.indent}</span>
      <span style={viewerStyles.statusItem}>{info.eol}</span>
      <span style={viewerStyles.statusItem}>{info.language}</span>
    </div>
  )
}
