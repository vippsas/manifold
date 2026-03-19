import type { SessionEditorPaneState } from '../../shared/types'

export const DEFAULT_EDITOR_PANE_ID = 'editor'

export type EditorPaneState = SessionEditorPaneState

export function createEditorPaneState(id: string = DEFAULT_EDITOR_PANE_ID): EditorPaneState {
  return {
    id,
    openFilePaths: [],
    activeFilePath: null,
  }
}

export function buildLegacyEditorPanes(
  openFilePaths: string[],
  activeFilePath: string | null,
): EditorPaneState[] {
  return [
    {
      id: DEFAULT_EDITOR_PANE_ID,
      openFilePaths: [...openFilePaths],
      activeFilePath,
    },
  ]
}

export function collectOpenFilePaths(panes: EditorPaneState[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const pane of panes) {
    for (const path of pane.openFilePaths) {
      if (seen.has(path)) continue
      seen.add(path)
      result.push(path)
    }
  }

  return result
}

export function findPaneContainingFile(
  panes: EditorPaneState[],
  filePath: string,
): EditorPaneState | null {
  return panes.find((pane) => pane.openFilePaths.includes(filePath)) ?? null
}

export function ensureEditorPane(
  panes: EditorPaneState[],
  paneId: string,
  referencePaneId?: string | null,
): EditorPaneState[] {
  if (panes.some((pane) => pane.id === paneId)) return panes

  const next = [...panes]
  const newPane = createEditorPaneState(paneId)

  if (referencePaneId) {
    const referenceIndex = next.findIndex((pane) => pane.id === referencePaneId)
    if (referenceIndex >= 0) {
      next.splice(referenceIndex + 1, 0, newPane)
      return next
    }
  }

  next.push(newPane)
  return next
}

export function normalizeEditorPanes(
  panes: EditorPaneState[],
  existingFilePaths: Iterable<string>,
): EditorPaneState[] {
  const existing = new Set(existingFilePaths)
  const normalized: EditorPaneState[] = []

  for (const pane of panes) {
    const openFilePaths = Array.from(new Set(
      pane.openFilePaths.filter((path) => existing.has(path)),
    ))

    normalized.push({
      id: pane.id,
      openFilePaths,
      activeFilePath: openFilePaths.includes(pane.activeFilePath ?? '')
        ? pane.activeFilePath
        : (openFilePaths[0] ?? null),
    })
  }

  return normalized.length > 0 ? normalized : [createEditorPaneState()]
}

export function resolveActiveEditorPaneId(
  panes: EditorPaneState[],
  activePaneId: string | null | undefined,
): string {
  if (activePaneId && panes.some((pane) => pane.id === activePaneId)) {
    return activePaneId
  }

  return panes[0]?.id ?? DEFAULT_EDITOR_PANE_ID
}

export function isEditorPaneEmpty(pane: EditorPaneState): boolean {
  return pane.openFilePaths.length === 0
}
