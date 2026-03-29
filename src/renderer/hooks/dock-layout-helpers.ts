import type { DockviewApi, SerializedDockview } from 'dockview'

export const PANEL_IDS = ['projects', 'agent', 'editor', 'fileTree', 'modifiedFiles', 'shell', 'search'] as const
export type DockPanelId = (typeof PANEL_IDS)[number]
export const EDITOR_PANEL_ID_PREFIX = 'editor:'

export const PANEL_TITLES: Record<DockPanelId, string> = {
  projects: 'Repositories',
  agent: 'Agent',
  editor: 'Editor',
  fileTree: 'Files',
  modifiedFiles: 'Modified Files',
  shell: 'Shell',
  search: 'Search',
}

type Direction = 'right' | 'left' | 'above' | 'below' | 'within'

// Fallback positions when no snapshot exists (matches default layout).
const PANEL_RESTORE_HINTS: Record<DockPanelId, Array<{ ref: DockPanelId; dir: Direction }>> = {
  projects: [{ ref: 'agent', dir: 'left' }, { ref: 'fileTree', dir: 'left' }],
  agent: [{ ref: 'projects', dir: 'right' }, { ref: 'fileTree', dir: 'left' }, { ref: 'editor', dir: 'left' }, { ref: 'shell', dir: 'above' }],
  editor: [{ ref: 'agent', dir: 'right' }, { ref: 'shell', dir: 'above' }],
  fileTree: [{ ref: 'modifiedFiles', dir: 'within' }, { ref: 'agent', dir: 'right' }],
  modifiedFiles: [{ ref: 'fileTree', dir: 'within' }, { ref: 'agent', dir: 'right' }],
  shell: [{ ref: 'agent', dir: 'below' }, { ref: 'editor', dir: 'below' }],
  search: [{ ref: 'agent', dir: 'within' }, { ref: 'editor', dir: 'within' }],
}

const LEGACY_SIDEBAR_WIDTH = 300
export const MIN_SIDEBAR_WIDTH = 340
export const DEFAULT_SIDEBAR_WIDTH = 360

function normalizeSidebarWidth(width: number): number {
  if (width <= 0) return DEFAULT_SIDEBAR_WIDTH
  if (width <= LEGACY_SIDEBAR_WIDTH) return DEFAULT_SIDEBAR_WIDTH
  return Math.max(width, MIN_SIDEBAR_WIDTH)
}

export function isEditorPanelId(panelId: string): boolean {
  return panelId === 'editor' || panelId.startsWith(EDITOR_PANEL_ID_PREFIX)
}

export function parseEditorPanelOrder(panelId: string): number {
  if (panelId === 'editor') return 0
  const suffix = Number(panelId.slice(EDITOR_PANEL_ID_PREFIX.length))
  return Number.isFinite(suffix) ? suffix : Number.MAX_SAFE_INTEGER
}

export interface LayoutRefs {
  isRestoringRef: React.MutableRefObject<boolean>
  lastLayoutRef: React.MutableRefObject<SerializedDockview | null>
}

// ── Sidebar width helpers ─────────────────────────────────────────────

/** IDs of panels treated as sidebars (protected from resize redistribution). */
const SIDEBAR_PANEL_IDS = new Set<string>(['projects', 'fileTree', 'modifiedFiles'])

/** Read a panel group's current pixel width (0 if unavailable). */
function getPanelWidth(api: DockviewApi, panelId: string): number {
  try {
    return api.getPanel(panelId)?.group?.element.offsetWidth ?? 0
  } catch {
    return 0
  }
}

/** Read the left sidebar group's current pixel width (0 if unavailable). */
export function getSidebarWidth(api: DockviewApi): number {
  return getPanelWidth(api, 'projects')
}

/** Capture both sidebar widths. */
export function getSidebarWidths(api: DockviewApi): { left: number; right: number } {
  return {
    left: getPanelWidth(api, 'projects'),
    right: getPanelWidth(api, 'fileTree'),
  }
}

/** Restore both sidebars to specific pixel widths on the next frame. */
export function restoreSidebarWidths(api: DockviewApi, widths: { left: number; right: number }): void {
  requestAnimationFrame(() => {
    try {
      if (widths.right > 0) {
        api.getPanel('fileTree')?.group?.api.setSize({ width: widths.right })
      }
      if (widths.left > 0) {
        const targetWidth = normalizeSidebarWidth(widths.left)
        api.getPanel('projects')?.group?.api.setSize({ width: targetWidth })
      }
    } catch { /* best-effort */ }
  })
}

/** Restore the left sidebar to a specific pixel width on the next frame. */
export function restoreSidebarWidth(api: DockviewApi, width: number): void {
  restoreSidebarWidths(api, { left: width, right: 0 })
}

// ── Serialized layout tree helpers ──────────────────────────────────────
// dockview doesn't export the node types so we define them locally.

type GridNode =
  | { type: 'branch'; data: GridNode[]; size: number }
  | { type: 'leaf'; data: { views: string[]; id: string; activeView?: string }; size: number }

const RETIRED_PANEL_IDS = new Set(['memory'])

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

function stripRetiredPanelsFromTree(node: GridNode): GridNode | null {
  if (node.type === 'leaf') {
    const views = node.data.views.filter((view) => !RETIRED_PANEL_IDS.has(view))
    if (views.length === 0) return null
    node.data.views = views
    if (!node.data.activeView || !views.includes(node.data.activeView)) {
      node.data.activeView = views[0]
    }
    return node
  }

  const nextChildren = node.data
    .map((child) => stripRetiredPanelsFromTree(child))
    .filter((child): child is GridNode => child !== null)

  if (nextChildren.length === 0) return null
  if (nextChildren.length === 1) {
    const [onlyChild] = nextChildren
    onlyChild.size = node.size
    return onlyChild
  }

  node.data = nextChildren
  return node
}

export function sanitizeDockLayout(saved: SerializedDockview): SerializedDockview | null {
  const panelIds = Object.keys(saved.panels ?? {})
  if (!panelIds.some((panelId) => RETIRED_PANEL_IDS.has(panelId))) return saved

  const sanitized = JSON.parse(JSON.stringify(saved)) as SerializedDockview
  const root = stripRetiredPanelsFromTree(sanitized.grid.root as GridNode)
  if (!root) return null

  sanitized.grid.root = root
  for (const retiredPanelId of RETIRED_PANEL_IDS) {
    delete (sanitized.panels as Record<string, unknown>)[retiredPanelId]
  }

  return sanitized
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
    const rawSaved = (await window.electronAPI.invoke('dock-layout:get', sessionId)) as SerializedDockview | null
    const saved = rawSaved ? sanitizeDockLayout(rawSaved) : null
    if (saved && saved.grid && saved.panels && !isCorruptedMinimalLayout(saved)) {
      refs.isRestoringRef.current = true
      try {
        api.fromJSON(saved)
      } finally {
        refs.isRestoringRef.current = false
      }
      restoreSidebarWidths(api, getSidebarWidths(api))
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
      const isSidebarNode = (c: GridNode) => {
        const views = c.type === 'leaf' ? c.data.views : []
        return views.some((v) => SIDEBAR_PANEL_IDS.has(v)) ||
          (c.type === 'branch' && Array.from(SIDEBAR_PANEL_IDS).some((sid) => treeContainsPanel(c, sid)))
      }
      const targets = root.data.filter((c) => !isSidebarNode(c))
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
  const widths = getSidebarWidths(api)

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

  restoreSidebarWidths(api, widths)
  refs.lastLayoutRef.current = api.toJSON()
  closedPanelSnapshots.current.delete(id)
}

export function showPanelFromHints(api: DockviewApi, id: DockPanelId): void {
  const widths = getSidebarWidths(api)
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
  restoreSidebarWidths(api, widths)
}
