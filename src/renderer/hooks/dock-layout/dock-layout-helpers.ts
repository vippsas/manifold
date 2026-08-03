import type { DockviewApi, SerializedDockview } from 'dockview'
import { getRelativeLocation, type Orientation } from 'dockview-core'
import { applySidebarWidth, setRenderedWidth } from './useSidebarHandleCycle'

export { sanitizeDockLayout } from './dock-layout-sanitize'
export {
  loadOrBuildLayout,
  applyBuiltLayout,
  hidePanel,
  showPanelFromSnapshot,
  showPanelFromHints,
} from './dock-layout-loader'

export const PANEL_IDS = ['sidebar', 'agent', 'editor', 'shell'] as const
export type DockPanelId = (typeof PANEL_IDS)[number]
export const EDITOR_PANEL_ID_PREFIX = 'editor:'
export type EditorSplitDirection = 'right' | 'below'

export const PANEL_TITLES: Record<DockPanelId, string> = {
  sidebar: 'Sidebar',
  agent: 'Agent',
  editor: 'Editor',
  shell: 'Shell',
}

export type Direction = 'right' | 'left' | 'above' | 'below' | 'within'

// Fallback positions when no snapshot exists (matches the default layout).
// The sidebar is the one left column and always reopens as a column of its own;
// the editor is a document pane that opens beside the agent on demand.
export const PANEL_RESTORE_HINTS: Record<DockPanelId, Array<{ ref: DockPanelId; dir: Direction }>> = {
  sidebar: [{ ref: 'agent', dir: 'left' }, { ref: 'editor', dir: 'left' }],
  agent: [{ ref: 'sidebar', dir: 'right' }, { ref: 'editor', dir: 'left' }, { ref: 'shell', dir: 'above' }],
  editor: [{ ref: 'agent', dir: 'right' }, { ref: 'shell', dir: 'above' }],
  shell: [{ ref: 'agent', dir: 'below' }, { ref: 'editor', dir: 'below' }],
}

export function isEditorPanelId(panelId: string): boolean {
  return panelId === 'editor' || panelId.startsWith(EDITOR_PANEL_ID_PREFIX)
}

/**
 * Whether a reopening panel may land as a tab beside `otherId`. The sidebar is
 * a container for its own view switcher, never a tab strip shared with a
 * workspace pane — without this a panel closed back when it happened to share
 * the sidebar's group would rejoin it from its snapshot.
 */
export function mayShareTabGroup(panelId: string, otherId: string): boolean {
  return panelId !== 'sidebar' && otherId !== 'sidebar'
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

/** The anchor panel of the one sidebar (protected from resize redistribution). */
export const SIDEBAR_PANEL_IDS = new Set<string>(['sidebar'])

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

/** Read the sidebar group's current pixel width (0 if unavailable). */
export function getSidebarWidth(api: DockviewApi): number {
  return getPanelWidth(api, 'sidebar')
}

const NON_WORKSPACE_PANEL_IDS = new Set<string>(['sidebar'])

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

type SidebarGroup = NonNullable<NonNullable<ReturnType<DockviewApi['getPanel']>>['group']>

function sidebarGroup(api: DockviewApi, panelId: string): SidebarGroup | undefined {
  return api.getPanel(panelId)?.group ?? undefined
}

/**
 * Pin a group to an exact width and return a fn that releases it back to free
 * resize. While pinned, dockview routes any size delta onto the unpinned
 * (center) panes. Crucially this resizes in place — unlike api.fromJSON(), it
 * does NOT tear down and remount panels, so the agent terminal is untouched.
 */
function pinGroupWidth(group: SidebarGroup, width: number): () => void {
  group.api.setConstraints({ minimumWidth: width, maximumWidth: width })
  return () => {
    group.api.setConstraints({ minimumWidth: 0, maximumWidth: Number.MAX_SAFE_INTEGER })
    // dockview re-evaluates sash enablement only during a layout pass
    // (updateSashEnablement): the pass triggered by the pinned mutation marked
    // the sashes next to this min==max group dv-disabled, and setConstraints
    // alone never re-runs the check — leaving the divider stuck with a
    // non-resize cursor until an unrelated relayout. A same-size setSize pokes
    // a relayout against the released constraints; unlike a forced
    // api.layout() it resizes by content delta (zero here), so it cannot
    // re-apply stale proportions and undo the pinned resize. It has to ask for
    // the same size in *rendered* terms (setRenderedWidth), or the poke itself
    // shaves this group's share of the theme gap off on every release.
    setRenderedWidth(group, group.api.width)
  }
}

/**
 * Restore the sidebar width in place by pinning its group to the captured pixel
 * width, then releasing it. Replaces an earlier approach that patched the
 * serialized grid and called api.fromJSON(), which tore down and remounted
 * every panel (disposing the agent's xterm and flashing a fresh scrollback
 * replay). Pinning forces the difference onto the center pane; releasing leaves
 * the sidebar freely draggable afterward.
 */
export function restoreSidebarWidth(api: DockviewApi, width: number, refs?: LayoutRefs): void {
  if (width <= 0) return
  if (api.width <= 0) return

  const group = sidebarGroup(api, 'sidebar')
  if (!group) return
  // Already at the target width — skip to avoid needless relayout and the
  // re-entrant onDidLayoutChange loop it would otherwise trigger.
  if (Math.abs(group.element.offsetWidth - width) <= 1) return

  if (refs) refs.isRestoringRef.current = true
  try {
    const release = pinGroupWidth(group, width)
    try {
      // setConstraints is lazy — dockview honours it only during a layout pass,
      // and unlike withPinnedSidebars there is no addPanel/removePanel here to
      // trigger one. Force a same-size pass while pinned: it clamps the sidebar
      // to its pinned width and routes the delta onto the unpinned center pane.
      api.layout(api.width, api.height, true)
    } finally {
      release()
    }
  } catch (err) {
    console.warn('[restoreSidebarWidth] failed to restore the sidebar width:', err)
  } finally {
    if (refs) refs.isRestoringRef.current = false
  }
  if (refs) refs.lastLayoutRef.current = api.toJSON()
}

/**
 * Run a structural layout mutation (imperative addPanel/removePanel) with the
 * sidebar pinned to its current width, so only the center pane absorbs the
 * change. Imperative add/remove + in-place pinning never remounts sibling
 * panels — unlike the api.fromJSON() round-trip this replaces, which remounted
 * everything and flashed the agent terminal.
 */
export function withPinnedSidebars(api: DockviewApi, applyChange: () => void, excludePanelId?: string): void {
  const releases: Array<() => void> = []
  const held: Array<{ group: SidebarGroup; width: number }> = []
  if (api.width > 0) {
    const targets: Array<{ group: SidebarGroup; width: number }> = []
    for (const panelId of SIDEBAR_PANEL_IDS) {
      if (panelId === excludePanelId) continue
      const group = sidebarGroup(api, panelId)
      const width = group?.element.offsetWidth ?? 0
      if (!group || width <= 0) continue
      targets.push({ group, width })
    }
    // Pinning every existing group would leave no free pane to absorb the
    // mutation: reopening panels one by one into an emptied dock where only a
    // sidebar survives would pin it at the full dock width, clamping each
    // newly added group to width 0 — panels that exist but render invisible.
    // Pin only while at least one unpinned group remains.
    const pinned = new Set<unknown>(targets.map(({ group }) => group))
    if (api.groups.some((group) => !pinned.has(group))) {
      for (const target of targets) {
        releases.push(pinGroupWidth(target.group, target.width))
        held.push(target)
      }
    }
  }
  try {
    applyChange()
  } finally {
    for (const release of releases) release()
    // The pin is a constraint on the view's *slot*, which carries that group's
    // share of the theme gap, so the layout pass the mutation triggers renders a
    // pinned sidebar a few pixels narrower than the width it was pinned to —
    // pixels it never got back, so every panel toggle left the sidebar a little
    // thinner than it found it. Hold it to the width that was promised.
    for (const { group, width } of held) {
      if (!api.groups.includes(group)) continue
      if (group.api.width !== width) setRenderedWidth(group, width)
    }
  }
}

/**
 * Toggle "focus mode" for a panel's group: maximize it to fill the dock area —
 * hiding every other group, the sidebar included — or exit if a group is
 * already maximized. Uses dockview's native maximize, which toggles group
 * *visibility* in place rather than tearing panels down: the agent terminal and
 * any other stateful pane survive the round-trip and restore to their prior
 * widths, unlike an api.fromJSON() round-trip (which remounts everything and
 * flashes the terminal).
 */
export function toggleMaximizedGroup(api: DockviewApi, panelId: string): void {
  if (api.hasMaximizedGroup()) {
    api.exitMaximizedGroup()
    return
  }
  const panel = api.getPanel(panelId)
  if (!panel) return
  api.maximizeGroup(panel)
}

export function applyLayoutChangePreservingSidebarWidths(
  api: DockviewApi,
  applyChange: () => void,
  refs?: LayoutRefs,
): void {
  // Pin the sidebar to its current pixel width *for the duration of* the
  // structural mutation, so dockview routes the freed/needed space onto the
  // center pane instead of redistributing it proportionally. The pin must be
  // held while addPanel/removePanel runs: dockview only honours group
  // constraints during the layout pass those calls trigger, so pinning *after*
  // the mutation (as this used to) is a no-op that lets the sidebar drift —
  // the cause of it resizing whenever the editor opened.
  const beforeSignature = getGridSignature(api.toJSON())
  withPinnedSidebars(api, applyChange)
  if (refs && getGridSignature(api.toJSON()) !== beforeSignature) {
    refs.lastLayoutRef.current = api.toJSON()
  }
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

// ── Collapsed-sidebar restore ───────────────────────────────────────────

// dockview's MINIMUM_DOCKVIEW_GROUP_PANEL_WIDTH. A collapsed sidebar is held at
// width 0 only by a runtime minimumWidth:0 group constraint; api.toJSON() drops
// minimumWidth when it's <= 0, so api.fromJSON() recreates the group at this
// default minimum and clamps the saved sub-minimum width back open.
const DOCKVIEW_DEFAULT_GROUP_MIN_WIDTH = 100

/** Serialized pixel width of the sidebar leaf containing `panelId` (undefined if
 *  absent). Sidebar groups live in a horizontal branch, so the leaf `size` is
 *  its width. */
function serializedSidebarWidth(layout: SerializedDockview, panelId: string): number | undefined {
  let size: number | undefined
  const visit = (node: GridNode): void => {
    if (size !== undefined) return
    if (node.type === 'leaf') {
      if (node.data.views.includes(panelId)) size = node.size
      return
    }
    for (const child of node.data) visit(child)
  }
  visit(layout.grid.root as GridNode)
  return size
}

/**
 * Re-apply the sidebar width that dockview clamps open on restore. A sidebar
 * collapsed to 0 (or dragged below dockview's default group minimum) is held
 * only by a runtime minimumWidth:0 constraint, which api.toJSON() drops — so
 * api.fromJSON() recreates the group at the 100px default minimum and the
 * collapse is lost. Reading the faithful width from the saved layout and
 * re-applying it (which re-sets minimumWidth:0) restores the collapse. Must run
 * right after fromJSON, before the layout is captured as the current state.
 */
export function restoreCollapsedSidebarWidths(api: DockviewApi, saved: SerializedDockview): void {
  const width = serializedSidebarWidth(saved, 'sidebar')
  if (width === undefined || width >= DOCKVIEW_DEFAULT_GROUP_MIN_WIDTH) return
  applySidebarWidth(api, Math.max(0, Math.round(width)))
}
