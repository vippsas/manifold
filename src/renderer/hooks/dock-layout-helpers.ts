import type { DockviewApi, SerializedDockview } from 'dockview'

export const PANEL_IDS = ['projects', 'agent', 'editor', 'fileTree', 'modifiedFiles', 'shell', 'search', 'backgroundAgent'] as const
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
  backgroundAgent: 'Ideas',
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
  backgroundAgent: [{ ref: 'agent', dir: 'within' }, { ref: 'search', dir: 'within' }],
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

/** Anchor panels that define the sidebars (protected from resize redistribution).
 *  modifiedFiles is intentionally excluded — it can be dragged to the center. */
const SIDEBAR_PANEL_IDS = new Set<string>(['projects', 'fileTree'])

/** Read a panel group's current pixel width (0 if unavailable). */
function getPanelWidth(api: DockviewApi, panelId: string): number {
  try {
    return api.getPanel(panelId)?.group?.element.offsetWidth ?? 0
  } catch (err) {
    console.warn(`[getPanelWidth] failed for panel '${panelId}':`, err)
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

/**
 * Restore both sidebar widths by patching the serialized grid tree.
 * Sequential setSize calls interfere with each other (dockview redistributes
 * freed space proportionally), so we patch sizes in the JSON and reload.
 */
export function restoreSidebarWidths(api: DockviewApi, widths: { left: number; right: number }, refs?: LayoutRefs): void {
  if (widths.left <= 0 && widths.right <= 0) return
  if (api.width <= 0) return
  try {
    const json = api.toJSON()
    const root = (json as { grid: { root: GridNode } }).grid.root
    if (root.type !== 'branch' || root.data.length < 2) return

    const total = root.data.reduce((s, c) => s + c.size, 0)
    if (total <= 0) return

    // Find which root children contain the sidebars
    const leftIdx = root.data.findIndex((c) =>
      c.type === 'leaf' ? c.data.views.includes('projects') : treeContainsPanel(c, 'projects'))
    const rightIdx = root.data.findIndex((c) =>
      c.type === 'leaf'
        ? c.data.views.includes('fileTree')
        : treeContainsPanel(c, 'fileTree'))

    let consumed = 0
    if (leftIdx >= 0 && widths.left > 0) {
      const leftSize = Math.round((widths.left / api.width) * total)
      root.data[leftIdx].size = leftSize
      consumed += leftSize
    } else if (leftIdx >= 0) {
      consumed += root.data[leftIdx].size
    }
    if (rightIdx >= 0 && rightIdx !== leftIdx && widths.right > 0) {
      const rightSize = Math.round((widths.right / api.width) * total)
      root.data[rightIdx].size = rightSize
      consumed += rightSize
    } else if (rightIdx >= 0 && rightIdx !== leftIdx) {
      consumed += root.data[rightIdx].size
    }

    // Give remaining space to center panels
    const centerNodes = root.data.filter((_, i) => i !== leftIdx && i !== rightIdx)
    const remaining = total - consumed
    if (centerNodes.length > 0 && remaining > 0) {
      const centerTotal = centerNodes.reduce((s, c) => s + c.size, 0)
      const scale = centerTotal > 0 ? remaining / centerTotal : 1
      for (const c of centerNodes) c.size = Math.round(c.size * scale)
    }

    if (refs) refs.isRestoringRef.current = true
    try {
      api.fromJSON(json)
    } finally {
      if (refs) refs.isRestoringRef.current = false
    }
    if (refs) refs.lastLayoutRef.current = api.toJSON()
  } catch (err) {
    console.warn('[restoreSidebarWidths] failed to restore sidebar widths:', err)
  }
}

/** Restore the left sidebar to a specific pixel width. */
export function restoreSidebarWidth(api: DockviewApi, width: number): void {
  restoreSidebarWidths(api, { left: width, right: 0 })
}

// ── Serialized layout tree helpers ──────────────────────────────────────
// dockview doesn't export the node types so we define them locally.

type GridNode =
  | { type: 'branch'; data: GridNode[]; size: number }
  | { type: 'leaf'; data: { views: string[]; id: string; activeView?: string }; size: number }

/**
 * Produce a string that captures the grid's panel arrangement (which panels
 * live in which groups, how groups are nested) but ignores sizes.  Two layouts
 * with the same signature differ only in panel/group dimensions — any panel
 * add, remove, or drag-to-new-group changes the signature.
 */
function nodeSignature(node: GridNode): string {
  if (node.type === 'leaf') return `L[${[...node.data.views].sort().join(',')}]`
  return `B[${node.data.map(nodeSignature).join('|')}]`
}

export function getGridSignature(layout: SerializedDockview): string {
  return nodeSignature(layout.grid.root as GridNode)
}

// ── Bottom-panel height helpers ───────────────────────────────────────

/**
 * Walk the grid tree and set the leaf containing `panelId` to `fraction`
 * of its parent branch total, scaling siblings to fill the remainder.
 * Returns true if the node was found and patched.
 */
function applyHeightInTree(node: GridNode, panelId: string, fraction: number): boolean {
  if (node.type !== 'branch') return false

  const idx = node.data.findIndex((c) =>
    c.type === 'leaf' && c.data.views.includes(panelId))

  if (idx >= 0) {
    const total = node.data.reduce((s, c) => s + c.size, 0)
    const panelSize = Math.round(total * fraction)
    const remaining = total - panelSize
    const otherTotal = node.data.reduce((s, c, i) => s + (i === idx ? 0 : c.size), 0)
    const scale = otherTotal > 0 ? remaining / otherTotal : 1
    for (let i = 0; i < node.data.length; i++) {
      node.data[i].size = i === idx ? panelSize : Math.round(node.data[i].size * scale)
    }
    return true
  }

  return node.data.some((child) => applyHeightInTree(child, panelId, fraction))
}

/** Patch the serialised grid so `panelId` occupies `fraction` of its parent branch. */
function applyPanelHeightFraction(api: DockviewApi, panelId: string, fraction: number, refs?: LayoutRefs): void {
  try {
    const json = api.toJSON()
    if (!applyHeightInTree(json.grid.root as GridNode, panelId, fraction)) return
    if (refs) refs.isRestoringRef.current = true
    try { api.fromJSON(json) } finally { if (refs) refs.isRestoringRef.current = false }
    if (refs) refs.lastLayoutRef.current = api.toJSON()
  } catch (err) {
    console.warn(`[applyPanelHeightFraction] failed for '${panelId}':`, err)
  }
}

const RETIRED_PANEL_IDS = new Set(['memory'])
const SUPPORTED_OPTIONAL_PANEL_IDS = new Set(['webPreview'])

function isSupportedSavedPanelId(panelId: string): boolean {
  return PANEL_IDS.includes(panelId as DockPanelId) ||
    isEditorPanelId(panelId) ||
    SUPPORTED_OPTIONAL_PANEL_IDS.has(panelId)
}

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

function stripInvalidPanelsFromTree(node: GridNode, validPanelIds: Set<string>): GridNode | null {
  if (node.type === 'leaf') {
    const views = node.data.views.filter((view) => validPanelIds.has(view))
    if (views.length === 0) return null
    node.data.views = views
    if (!node.data.activeView || !views.includes(node.data.activeView)) {
      node.data.activeView = views[0]
    }
    return node
  }

  const nextChildren = node.data
    .map((child) => stripInvalidPanelsFromTree(child, validPanelIds))
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
  const savedPanels = (saved.panels ?? {}) as Record<string, unknown>
  const savedPanelIds = Object.keys(savedPanels)
  const validPanelIds = new Set(savedPanelIds.filter((panelId) => (
    !RETIRED_PANEL_IDS.has(panelId) && isSupportedSavedPanelId(panelId)
  )))

  if (validPanelIds.size === 0) return null

  if (!layoutNeedsSanitization(saved, validPanelIds)) return saved

  const sanitized = JSON.parse(JSON.stringify(saved)) as SerializedDockview
  const root = stripInvalidPanelsFromTree(sanitized.grid.root as GridNode, validPanelIds)
  if (!root) return null

  sanitized.grid.root = root

  const referencedPanelIds = new Set(collectPanelIds(root))
  for (const panelId of Object.keys((sanitized.panels ?? {}) as Record<string, unknown>)) {
    if (!referencedPanelIds.has(panelId)) {
      delete (sanitized.panels as Record<string, unknown>)[panelId]
    }
  }

  if (Object.keys((sanitized.panels ?? {}) as Record<string, unknown>).length === 0) return null

  return sanitized
}

function layoutNeedsSanitization(saved: SerializedDockview, validPanelIds: Set<string>): boolean {
  const savedPanels = (saved.panels ?? {}) as Record<string, unknown>

  for (const panelId of Object.keys(savedPanels)) {
    if (!validPanelIds.has(panelId)) return true
  }

  return treeNeedsSanitization(saved.grid.root as GridNode, validPanelIds)
}

function treeNeedsSanitization(node: GridNode, validPanelIds: Set<string>): boolean {
  if (node.type === 'leaf') {
    if (node.data.views.length === 0) return true
    if (node.data.views.some((view) => !validPanelIds.has(view))) return true
    if (!node.data.activeView || !node.data.views.includes(node.data.activeView)) return true
    return false
  }

  if (node.data.length === 0) return true
  return node.data.some((child) => treeNeedsSanitization(child, validPanelIds))
}

function collectPanelIds(node: GridNode): string[] {
  if (node.type === 'leaf') return [...node.data.views]
  return node.data.flatMap(collectPanelIds)
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
      refs.lastLayoutRef.current = saved
      if (saved !== rawSaved) {
        void window.electronAPI.invoke('dock-layout:set', sessionId, saved).catch(() => {})
      }
      return
    }
  } catch (err) {
    console.warn('[loadOrBuildLayout] failed to restore saved layout for session', sessionId, '- falling back to default:', err)
  }
  refs.isRestoringRef.current = true
  try {
    api.clear()
    buildDefault(api)
  } finally {
    refs.isRestoringRef.current = false
  }
  refs.lastLayoutRef.current = api.toJSON()
  void window.electronAPI.invoke('dock-layout:set', sessionId, refs.lastLayoutRef.current).catch(() => {})
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
  } catch (err) {
    console.warn(`[hidePanel] failed to apply layout after hiding '${id}':`, err)
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

  restoreSidebarWidths(api, widths, refs)
  refs.lastLayoutRef.current = api.toJSON()
  closedPanelSnapshots.current.delete(id)
}

export function showPanelFromHints(api: DockviewApi, id: DockPanelId, refs?: LayoutRefs): void {
  const widths = getSidebarWidths(api)
  const hints = PANEL_RESTORE_HINTS[id]
  let position: { referencePanel: ReturnType<DockviewApi['getPanel']>; direction: Direction } | undefined
  let usedDirection: Direction | undefined
  for (const hint of hints) {
    const ref = api.getPanel(hint.ref)
    if (ref) {
      position = { referencePanel: ref, direction: hint.dir }
      usedDirection = hint.dir
      break
    }
  }
  api.addPanel({
    id,
    component: id,
    title: PANEL_TITLES[id],
    ...(position ? { position } : {}),
  })
  if (usedDirection === 'below') {
    applyPanelHeightFraction(api, id, 1 / 3, refs)
  }
  restoreSidebarWidths(api, widths, refs)
}
