export interface EditorPaneModeControls {
  canShowPreview: boolean
  canShowDiff: boolean
  showEditor: () => void
  showPreview: () => void
  showDiff: () => void
}

const controlsByPaneId = new Map<string, EditorPaneModeControls>()
const listeners = new Set<() => void>()

function emitChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function registerEditorPaneModeControls(paneId: string, controls: EditorPaneModeControls): void {
  controlsByPaneId.set(paneId, controls)
  emitChange()
}

export function unregisterEditorPaneModeControls(paneId: string, controls: EditorPaneModeControls): void {
  if (controlsByPaneId.get(paneId) === controls) {
    controlsByPaneId.delete(paneId)
    emitChange()
  }
}

export function getEditorPaneModeControls(paneId: string): EditorPaneModeControls | null {
  return controlsByPaneId.get(paneId) ?? null
}

export function subscribeEditorPaneModeControls(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
