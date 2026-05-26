import type { DockviewApi, SerializedDockview } from 'dockview'
import { getRelativeLocation, type Orientation } from 'dockview-core'

export { sanitizeDockLayout } from './dock-layout-sanitize'
export {
  loadOrBuildLayout,
  applyMinimalLayout,
  hidePanel,
  showPanelFromSnapshot,
  showPanelFromHints,
} from './dock-layout-loader'

export const PANEL_IDS = ['projects', 'agent', 'editor', 'fileTree', 'modifiedFiles', 'shell', 'search', 'backgroundAgent', 'loop', 'watch', 'verdicts'] as const
export type DockPanelId = (typeof PANEL_IDS)[number]
export const EDITOR_PANEL_ID_PREFIX = 'editor:'
export type EditorSplitDirection = 'right' | 'below'

export const PANEL_TITLES: Record<DockPanelId, string> = {
  projects: 'Repositories',
  agent: 'Agent',
  editor: 'Editor',
  fileTree: 'Files',
  modifiedFiles: 'Modified Files',
  shell: 'Shell',
  search: 'Search',
  backgroundAgent: 'Ideas',
  loop: 'Loop',
  watch: 'Watch',
  verdicts: 'Verdicts',
}

export type Direction = 'right' | 'left' | 'above' | 'below' | 'within'

// Fallback positions when no snapshot exists (matches default layout).
export const PANEL_RESTORE_HINTS: Record<DockPanelId, Array<{ ref: DockPanelId; dir: Direction }>> = {
  projects: [{ ref: 'agent', dir: 'left' }, { ref: 'editor', dir: 'left' }, { ref: 'fileTree', dir: 'left' }],
  agent: [{ ref: 'editor', dir: 'left' }, { ref: 'backgroundAgent', dir: 'within' }, { ref: 'search', dir: 'within' }, { ref: 'projects', dir: 'right' }, { ref: 'fileTree', dir: 'left' }, { ref: 'shell', dir: 'above' }],
  editor: [{ ref: 'agent', dir: 'right' }, { ref: 'search', dir: 'within' }, { ref: 'shell', dir: 'above' }],
  fileTree: [{ ref: 'modifiedFiles', dir: 'within' }, { ref: 'editor', dir: 'right' }, { ref: 'agent', dir: 'right' }],
  modifiedFiles: [{ ref: 'fileTree', dir: 'within' }, { ref: 'agent', dir: 'right' }],
  shell: [{ ref: 'agent', dir: 'below' }, { ref: 'editor', dir: 'below' }],
  search: [{ ref: 'editor', dir: 'within' }, { ref: 'agent', dir: 'within' }, { ref: 'backgroundAgent', dir: 'within' }],
  backgroundAgent: [{ ref: 'editor', dir: 'within' }, { ref: 'agent', dir: 'within' }, { ref: 'search', dir: 'within' }],
  loop: [{ ref: 'editor', dir: 'within' }, { ref: 'agent', dir: 'within' }, { ref: 'search', dir: 'within' }, { ref: 'backgroundAgent', dir: 'within' }],
  watch: [{ ref: 'editor', dir: 'within' }, { ref: 'agent', dir: 'within' }, { ref: 'search', dir: 'within' }, { ref: 'loop', dir: 'within' }],
  verdicts: [{ ref: 'editor', dir: 'within' }, { ref: 'agent', dir: 'within' }, { ref: 'search', dir: 'within' }, { ref: 'backgroundAgent', dir: 'within' }],
}

export function isEditorPanelId(panelId: string): boolean {
  return panelId === 'editor' || panelId.startsWith(EDITOR_PANEL_ID_PREFIX)
}

export function parseEditorPanelOrder(panelId: string): number {
  if (panelId === 'editor') return 0
  const suffix = Number(panelId.slice(EDITOR_PANEL_ID_PREFIX.length))
  return Number.isFinite(suffix) ? suffix : Number.MAX_SAFE_INTEGER
}

export function findAdjacentEditorPanelId(
  rootOrientation: Orientation,
  referenceLocation: number[],
  candidatePanels: Array<{ panelId: string; location: number[] }>,
  direction: EditorSplitDirection,
): string | null {
  const targetLocation = getRelativeLocation(
    rootOrientation,
    referenceLocation,
    direction === 'below' ? 'bottom' : 'right',
  )

  const match = candidatePanels.find((panel) => areGridLocationsEqual(panel.location, targetLocation))
  return match?.panelId ?? null
}

export interface LayoutRefs {
  isRestoringRef: React.MutableRefObject<boolean>
  lastLayoutRef: React.MutableRefObject<SerializedDockview | null>
}

// ── Sidebar width helpers ─────────────────────────────────────────────

/** Anchor panels that define the sidebars (protected from resize redistribution).
 *  modifiedFiles is intentionally excluded — it can be dragged to the center. */
export const SIDEBAR_PANEL_IDS = new Set<string>(['projects', 'fileTree'])

/** Read a panel group's current pixel width (0 if unavailable). */
function getPanelWidth(api: DockviewApi, panelId: string): number {
  try {
    return api.getPanel(panelId)?.group?.element.offsetWidth ?? 0
  } catch (err) {
    console.warn(`[getPanelWidth] failed for panel '${panelId}':`, err)
    return 0
  }
}

function areGridLocationsEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

/** Read the left sidebar group's current pixel width (0 if unavailable). */
export function getSidebarWidth(api: DockviewApi): number {
  return getPanelWidth(api, 'projects')
}

const NON_WORKSPACE_PANEL_IDS = new Set<string>(['projects', 'fileTree', 'modifiedFiles'])

export function findTopLeftWorkspaceReferencePanel(api: DockviewApi): string | null {
  const seenGroups = new Set<unknown>()
  const candidates: Array<{ panelId: string; top: number; left: number }> = []

  for (const panel of api.panels) {
    if (NON_WORKSPACE_PANEL_IDS.has(panel.id)) continue

    const group = panel.group
    if (!group || seenGroups.has(group)) continue
    seenGroups.add(group)

    const rect = group.element?.getBoundingClientRect?.()
    if (!rect) continue

    const referencePanel = group.panels.find(
      (groupPanel) => !NON_WORKSPACE_PANEL_IDS.has(groupPanel.id),
    )
    if (!referencePanel) continue

    candidates.push({
      panelId: referencePanel.id,
      top: rect.top,
      left: rect.left,
    })
  }

  if (candidates.length === 0) {
    return api.getPanel('agent')?.id ?? null
  }

  candidates.sort((left, right) => (
    left.top - right.top
    || left.left - right.left
    || left.panelId.localeCompare(right.panelId)
  ))
  return candidates[0]?.panelId ?? null
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

export function applyLayoutChangePreservingSidebarWidths(
  api: DockviewApi,
  applyChange: () => void,
  refs?: LayoutRefs,
): void {
  // Snapshot the grid structure before applying the change. If applyChange()
  // turns out to be a no-op (structurally), skip restoreSidebarWidths — it
  // calls api.fromJSON() which forces dockview to tear down and remount
  // every panel, unmounting xterm in the agent pane and flashing a fresh
  // replay. Only pay that cost when the structure actually changed.
  const beforeSignature = getGridSignature(api.toJSON())
  const widths = getSidebarWidths(api)
  applyChange()
  const afterSignature = getGridSignature(api.toJSON())
  if (beforeSignature === afterSignature) return
  restoreSidebarWidths(api, widths, refs)
}

/** Restore the left sidebar to a specific pixel width. */
export function restoreSidebarWidth(api: DockviewApi, width: number): void {
  restoreSidebarWidths(api, { left: width, right: 0 })
}

// ── Serialized layout tree helpers ──────────────────────────────────────
// dockview doesn't export the node types so we define them locally.

export type GridNode =
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

export function treeContainsPanel(node: GridNode, panelId: string): boolean {
  if (node.type === 'leaf') return node.data.views.includes(panelId)
  return node.data.some((child) => treeContainsPanel(child, panelId))
}

export function removeLeafFromTree(parent: GridNode & { type: 'branch' }, panelId: string): number {
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
