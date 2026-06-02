import type { editor as monacoEditor } from 'monaco-editor'
import type { FileOpenRequest } from '../file-open-request'

export function revealRequestedLocation(
  editor: monacoEditor.IStandaloneCodeEditor | null,
  activeFilePath: string | null,
  request: FileOpenRequest,
): void {
  if (!editor || !activeFilePath || request.path !== activeFilePath || !request.line) return
  const line = request.line
  const position = {
    lineNumber: line,
    column: request.column ?? 1,
  }
  requestAnimationFrame(() => {
    editor.setPosition(position)
    editor.revealPositionInCenter(position)
    editor.focus()

    // Highlight the matched line: it flashes on open (CSS), then settles into a
    // persistent band that lingers until the user moves the cursor or edits.
    // Listeners are attached after setPosition so the programmatic cursor move
    // above does not immediately clear the highlight.
    const decorations = editor.createDecorationsCollection([
      {
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
        options: { isWholeLine: true, className: 'search-reveal-line' },
      },
    ])

    const disposables = [
      editor.onDidChangeCursorPosition(() => clear()),
      editor.onDidChangeModelContent(() => clear()),
    ]

    function clear(): void {
      decorations.clear()
      disposables.forEach((d) => d.dispose())
    }
  })
}
