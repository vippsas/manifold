import type { editor as monacoEditor } from 'monaco-editor'
import type { FileOpenRequest } from '../file-open-request'

export function revealRequestedLocation(
  editor: monacoEditor.IStandaloneCodeEditor | null,
  activeFilePath: string | null,
  request: FileOpenRequest,
): void {
  if (!editor || !activeFilePath || request.path !== activeFilePath || !request.line) return
  const position = {
    lineNumber: request.line,
    column: request.column ?? 1,
  }
  requestAnimationFrame(() => {
    editor.setPosition(position)
    editor.revealPositionInCenter(position)
    editor.focus()
  })
}
