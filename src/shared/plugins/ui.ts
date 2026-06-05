// src/shared/plugins/ui.ts — shared shapes for plugin UI primitives (messages, quick pick, input box).
export type MessageLevel = 'info' | 'warning' | 'error'

export interface QuickPickItem { label: string; description?: string; detail?: string }
export interface QuickPickOptions { placeholder?: string; title?: string }
export interface InputBoxOptions { prompt?: string; placeholder?: string; value?: string; password?: boolean; title?: string }

/** Discriminated request the main process sends to the renderer's PluginUiHost. */
export type UiRequest =
  | { requestId: string; kind: 'message'; level: MessageLevel; message: string; actions: string[] }
  | { requestId: string; kind: 'quickPick'; items: QuickPickItem[]; options: QuickPickOptions }
  | { requestId: string; kind: 'inputBox'; options: InputBoxOptions }

/** Normalize showQuickPick input (vscode accepts string[] or QuickPickItem[]) into QuickPickItem[]. */
export function normalizeQuickPickItems(items: ReadonlyArray<string | QuickPickItem>): QuickPickItem[] {
  return items.map((it) => (typeof it === 'string' ? { label: it } : it))
}
