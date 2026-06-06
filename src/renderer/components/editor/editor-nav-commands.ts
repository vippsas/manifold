import type { editor as monacoEditor } from 'monaco-editor'

/**
 * Registers VS Code-style structural navigation on a Monaco editor:
 *  - Go to Symbol  (Cmd/Ctrl + Shift + O) → quick outline
 *  - Go to Line    (Ctrl + G)             → goto line
 * Go to Line uses KeyMod.WinCtrl — the physical Control key on macOS — so it
 * doesn't clobber Cmd+G (find-next), matching VS Code on macOS.
 */
export function registerEditorNavCommands(
  editor: monacoEditor.IStandaloneCodeEditor,
  monaco: typeof import('monaco-editor'),
): void {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyO, () => {
    editor.getAction('editor.action.quickOutline')?.run()
  })
  editor.addCommand(monaco.KeyMod.WinCtrl | monaco.KeyCode.KeyG, () => {
    editor.getAction('editor.action.gotoLine')?.run()
  })
}
