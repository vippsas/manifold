import type { DockviewApi, SerializedDockview } from 'dockview'

export const PANEL_IDS = ['projects', 'agent', 'editor', 'fileTree', 'modifiedFiles', 'shell'] as const
export type DockPanelId = (typeof PANEL_IDS)[number]

export const PANEL_TITLES: Record<DockPanelId, string> = {
  projects: 'Repositories',
  agent: 'Agent',
  editor: 'Editor',
  fileTree: 'Files',
  modifiedFiles: 'Modified Files',
  shell: 'Shell',
}

type Direction = 'right' | 'left' | 'above' | 'below' | 'within'

// Fallback positions when no snapshot exists (matches default layout).
const PANEL_RESTORE_HINTS: Record<DockPanelId, Array<{ ref: DockPanelId; dir: Direction }>> = {
  projects: [{ ref: 'fileTree', dir: 'above' }, { ref: 'agent', dir: 'left' }],
  agent: [{ ref: 'projects', dir: 'right' }, { ref: 'editor', dir: 'left' }, { ref: 'shell', dir: 'above' }],
  editor: [{ ref: 'agent', dir: 'right' }, { ref: 'shell', dir: 'above' }],
  fileTree: [{ ref: 'modifiedFiles', dir: 'within' }, { ref: 'projects', dir: 'below' }],
  modifiedFiles: [{ ref: 'fileTree', dir: 'within' }, { ref: 'projects', dir: 'below' }],
  shell: [{ ref: 'agent', dir: 'below' }, { ref: 'editor', dir: 'below' }],
}

export const DEFAULT_SIDEBAR_WIDTH = 300

export interface LayoutRefs {
  isRestoringRef: React.MutableRefObject<boolean>
  lastLayoutRef: React.MutableRefObject<SerializedDockview | null>
}

// ── Sidebar width helpers ─────────────────────────────────────────────

/** Read the sidebar group's current pixel width (0 if unavailable). */
export function getSidebarWidth(api: DockviewApi): number {
  try {
    return api.getPanel('projects')?.group?.element.offsetWidth ?? 0
  } catch {
    return 0
  }
}

/** Restore the sidebar to a specific pixel width on the next frame. */
export function restoreSidebarWidth(api: DockviewApi, width: number): void {
  if (width <= 0) return
  requestAnimationFrame(() => {
    try {
      api.getPanel('projects')?.group?.api.setSize({ width })
    } catch { /* best-effort */ }
  })
}

// ── Serialized layout tree helpers ──────────────────────────────────────
// dockview doesn't export the node types so we define them locally.

type GridNode =
  | { type: 'branch'; data: GridNode[]; size: number }
  | { type: 'leaf'; data: { views: string[]; id: string; activeView?: string }; size: number }

function treeContainsPanel(node: GridNode, panelId: string): boolean {
  if (node.type === 'leaf') return node.data.views.includes(panelId)
  return node.data.some((child) => treeContainsPanel(child, panelId))
}

function removeLeafFromTree(parent: GridNode & { type: 'branch' }, panelId: string): number {
  for (let i = 0; i < parent.data.length; i++) {
    const child = parent.data[i]

    if (child.type === 'leaf' && child.data.views.includes(panelId)) {
      if (child.data.views.length > 1) {
        child.data.views = child.data.views.filter((v) => v !== panelId)
        if (child.data.activeView === panelId) child.data.activeView = child.data.views[0]
        return 0
      }
      parent.data.splice(i, 1)
      return child.size
    }

    if (child.type === 'branch' && treeContainsPanel(child, panelId)) {
      const freed = removeLeafFromTree(child, panelId)
      if (child.data.length === 1) {
        const promoted = child.data[0]
        promoted.size = child.size
        parent.data[i] = promoted
      } else if (freed > 0) {
        const scale = child.size / (child.size - freed)
        for (const sibling of child.data) sibling.size = Math.round(sibling.size * scale)
      }
      return 0
    }
  }
  return 0
}

// ── Layout loading helpers ──────────────────────────────────────────────

function isCorruptedMinimalLayout(saved: SerializedDockview): boolean {
  const panelIds = new Set(Object.keys(saved.panels))
  return panelIds.size === 2 && panelIds.has('projects') && panelIds.has('agent')
}

export async function loadOrBuildLayout(
  api: DockviewApi,
  sessionId: string,
  buildDefault: (api: DockviewApi) => void,
  refs: LayoutRefs,
): Promise<void> {
  try {
    const saved = (await window.electronAPI.invoke('dock-layout:get', sessionId)) as SerializedDockview | null
    if (saved && saved.grid && saved.panels && !isCorruptedMinimalLayout(saved)) {
      refs.isRestoringRef.current = true
      try {
        api.fromJSON(saved)
      } finally {
        refs.isRestoringRef.current = false
      }
      refs.lastLayoutRef.current = saved
      return
    }
  } catch {
    // ignore load errors, fall through to default
  }
  refs.isRestoringRef.current = true
  try {
    api.clear()
    buildDefault(api)
  } finally {
    refs.isRestoringRef.current = false
  }
  refs.lastLayoutRef.current = api.toJSON()
}

export function applyMinimalLayout(
  api: DockviewApi,
  buildMinimal: (api: DockviewApi) => void,
  refs: LayoutRefs,
): void {
  refs.isRestoringRef.current = true
  try {
    api.clear()
    buildMinimal(api)
  } finally {
    refs.isRestoringRef.current = false
  }
  refs.lastLayoutRef.current = api.toJSON()
}

// ── Panel hide/show helpers ────────────────────────────────────────────

export function hidePanel(
  api: DockviewApi,
  id: DockPanelId,
  closedPanelSnapshots: React.MutableRefObject<Map<DockPanelId, SerializedDockview>>,
  refs: LayoutRefs,
): void {
  const preRemovalLayout = api.toJSON()
  closedPanelSnapshots.current.set(id, preRemovalLayout)

  const json = JSON.parse(JSON.stringify(preRemovalLayout)) as SerializedDockview
  const root = json.grid.root as GridNode
  if (root.type === 'branch') {
    const freed = removeLeafFromTree(root, id)
    if (freed > 0 && root.data.length > 0) {
      const sidebarIdx = root.data.findIndex((c) =>
        c.type === 'leaf'
          ? c.data.views.includes('projects')
          : treeContainsPanel(c, 'projects')
      )
      const targets = root.data.filter((_, i) => i !== sidebarIdx)
      if (targets.length > 0) {
        const share = freed / targets.length
        for (const t of targets) t.size = Math.round(t.size + share)
      } else {
        const total = root.data.reduce((s, c) => s + c.size, 0)
        const scale = (total + freed) / total
        for (const c of root.data) c.size = Math.round(c.size * scale)
      }
    }
  }
  delete (json.panels as Record<string, unknown>)[id]

  refs.isRestoringRef.current = true
  try {
    api.fromJSON(json)
  } finally {
    refs.isRestoringRef.current = false
  }
  refs.lastLayoutRef.current = api.toJSON()
}

export function showPanelFromSnapshot(
  api: DockviewApi,
  id: DockPanelId,
  snapshot: SerializedDockview,
  closedPanelSnapshots: React.MutableRefObject<Map<DockPanelId, SerializedDockview>>,
  refs: LayoutRefs,
): void {
  const currentlyVisible = new Set(
    PANEL_IDS.filter((pid) => api.getPanel(pid) !== undefined)
  )
  const sidebarWidth = getSidebarWidth(api)

  refs.isRestoringRef.current = true
  try {
    api.fromJSON(snapshot)
    for (const pid of PANEL_IDS) {
      if (pid !== id && !currentlyVisible.has(pid)) {
        const p = api.getPanel(pid)
        if (p) api.removePanel(p)
      }
    }
  } finally {
    refs.isRestoringRef.current = false
  }

  restoreSidebarWidth(api, sidebarWidth)
  refs.lastLayoutRef.current = api.toJSON()
  closedPanelSnapshots.current.delete(id)
}

export function showPanelFromHints(api: DockviewApi, id: DockPanelId): void {
  const sidebarWidth = getSidebarWidth(api)
  const hints = PANEL_RESTORE_HINTS[id]
  let position: { referencePanel: ReturnType<DockviewApi['getPanel']>; direction: Direction } | undefined
  for (const hint of hints) {
    const ref = api.getPanel(hint.ref)
    if (ref) {
      position = { referencePanel: ref, direction: hint.dir }
      break
    }
  }
  api.addPanel({
    id,
    component: id,
    title: PANEL_TITLES[id],
    ...(position ? { position } : {}),
  })
  restoreSidebarWidth(api, sidebarWidth)
}
