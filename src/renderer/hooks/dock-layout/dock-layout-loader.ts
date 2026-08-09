import type { DockviewApi, SerializedDockview } from 'dockview'
import { sanitizeDockLayout } from './dock-layout-sanitize'
import {
  PANEL_RESTORE_HINTS,
  PANEL_TITLES,
  SIDEBAR_PANEL_IDS,
  applyLayoutChangePreservingSidebarWidths,
  restoreCollapsedSidebarWidths,
  withPinnedSidebars,
  type Direction,
  type DockPanelId,
  type GridNode,
  type LayoutRefs,
} from './dock-layout-helpers'
import { spanShellAcrossWorkspace } from './dock-layout-shell-span'

/** The default share of the dock width the sidebar column gets (matches the
 *  1:5 default layout and the share the sanitizer normalizes a restored
 *  sidebar back to). */
const SIDEBAR_WIDTH_FRACTION = 1 / 6

type DockGroup = NonNullable<NonNullable<ReturnType<DockviewApi['getPanel']>>['group']>

/** Whether the group holds only the sidebar. A group the user has dragged a
 *  workspace pane into is a center pane and must keep its width. */
function isPureSidebarGroup(api: DockviewApi, group: DockGroup): boolean {
  return api.panels
    .filter((panel) => panel.group === group)
    .every((panel) => SIDEBAR_PANEL_IDS.has(panel.id))
}

/**
 * Size the group containing `panelId` along one axis, in place. Replaces an
 * api.fromJSON() patch that tore down and remounted every panel; a group
 * setSize resizes without remounting, leaving the agent terminal (and its xterm
 * scrollback) intact.
 */
function applyPanelSize(api: DockviewApi, panelId: string, axis: ReopenAxis, px: number, refs?: LayoutRefs): void {
  if (px <= 0) return
  const group = api.getPanel(panelId)?.group
  if (!group) return
  try {
    if (refs) refs.isRestoringRef.current = true
    try {
      group.api.setSize(axis === 'width' ? { width: px } : { height: px })
    } finally {
      if (refs) refs.isRestoringRef.current = false
    }
    if (refs) refs.lastLayoutRef.current = api.toJSON()
  } catch (err) {
    console.warn(`[applyPanelSize] failed for '${panelId}':`, err)
  }
}

function applyPanelHeightFraction(api: DockviewApi, panelId: string, fraction: number, refs?: LayoutRefs): void {
  if (api.height <= 0) return
  applyPanelSize(api, panelId, 'height', Math.round(api.height * fraction), refs)
}

function applyPanelWidthFraction(api: DockviewApi, panelId: string, fraction: number, refs?: LayoutRefs): void {
  if (api.width <= 0) return
  applyPanelSize(api, panelId, 'width', Math.round(api.width * fraction), refs)
}

/**
 * Restore the window's one saved layout, or build a fallback when there is
 * none. Called once per window, not per agent: the layout is a property of the
 * window, so switching agents must not run this again.
 */
export async function loadOrBuildLayout(
  api: DockviewApi,
  buildFallback: (api: DockviewApi) => void,
  refs: LayoutRefs,
  liveSiblingSessionIds?: Set<string>,
): Promise<void> {
  try {
    const rawSaved = (await window.electronAPI.invoke('dock-layout:get')) as SerializedDockview | null
    const saved = rawSaved ? sanitizeDockLayout(rawSaved, liveSiblingSessionIds) : null
    if (saved && saved.grid && saved.panels) {
      refs.isRestoringRef.current = true
      try {
        api.fromJSON(saved)
        // fromJSON recreates each group at dockview's default 100px minimum,
        // clamping a collapsed (width-0) sidebar back open. Re-apply the saved
        // sub-minimum width so a collapsed sidebar stays collapsed across agent
        // switches and app restarts.
        restoreCollapsedSidebarWidths(api, saved)
      } finally {
        refs.isRestoringRef.current = false
      }
      refs.lastLayoutRef.current = saved
      if (saved !== rawSaved) {
        void window.electronAPI.invoke('dock-layout:set', saved).catch(() => {})
      }
      return
    }
  } catch (err) {
    console.warn('[loadOrBuildLayout] failed to restore the saved layout - falling back to a built one:', err)
  }
  refs.isRestoringRef.current = true
  try {
    api.clear()
    buildFallback(api)
  } finally {
    refs.isRestoringRef.current = false
  }
  refs.lastLayoutRef.current = api.toJSON()
  void window.electronAPI.invoke('dock-layout:set', refs.lastLayoutRef.current).catch(() => {})
}

/** Replace the dock with a freshly built layout. */
export function applyBuiltLayout(
  api: DockviewApi,
  build: (api: DockviewApi) => void,
  refs: LayoutRefs,
): void {
  refs.isRestoringRef.current = true
  try {
    api.clear()
    build(api)
  } finally {
    refs.isRestoringRef.current = false
  }
  refs.lastLayoutRef.current = api.toJSON()
}

export function hidePanel(
  api: DockviewApi,
  id: DockPanelId,
  closedPanelSnapshots: React.MutableRefObject<Map<DockPanelId, SerializedDockview>>,
  refs: LayoutRefs,
): void {
  // Remember the full layout so the panel can be reopened where it was.
  closedPanelSnapshots.current.set(id, api.toJSON())

  const panel = api.getPanel(id)
  if (!panel) return

  // Remove the panel in place. api.removePanel only unmounts THIS panel and
  // hands its space to its branch siblings; every other panel — including the
  // agent terminal — stays mounted. Pinning the sidebar keeps the freed space
  // on the center pane rather than letting the sidebar widen.
  withPinnedSidebars(api, () => api.removePanel(panel), id)
  refs.lastLayoutRef.current = api.toJSON()
}

type ReopenAxis = 'width' | 'height'
type ReopenOrientation = 'HORIZONTAL' | 'VERTICAL'

const orthogonalOri = (o: ReopenOrientation): ReopenOrientation => (o === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL')

/** The axis a pane opened in `direction` is sized along. */
function axisOfDirection(direction: Direction | undefined): ReopenAxis | undefined {
  if (direction === 'left' || direction === 'right') return 'width'
  if (direction === 'above' || direction === 'below') return 'height'
  return undefined
}

/** Indices from the grid root down to the leaf containing `panelId` ([] = root leaf). */
function findLeafPath(node: GridNode, panelId: string): number[] | null {
  if (node.type === 'leaf') return node.data.views.includes(panelId) ? [] : null
  for (let i = 0; i < node.data.length; i++) {
    const sub = findLeafPath(node.data[i], panelId)
    if (sub) return [i, ...sub]
  }
  return null
}

/**
 * The pixel size a pane had when it was closed, and the axis it was measured
 * along. Only the size is remembered, never the position: a snapshot describes
 * a layout that may no longer exist, and replaying its geometry put reopened
 * panes wherever the tree happened to have drifted — under the wrong pane, or
 * as a column beside the agent. Panes now always reopen at their one home
 * (PANEL_RESTORE_HINTS) and the remembered size is re-applied there.
 *
 * Branch orientation alternates from grid.orientation each level down, so the
 * axis is only meaningful if the pane reopens along the same one — the caller
 * checks that before applying it.
 */
export function readRememberedSize(
  snapshot: SerializedDockview,
  panelId: string,
): { axis: ReopenAxis; px: number } | undefined {
  const root = snapshot.grid.root as GridNode
  const path = findLeafPath(root, panelId)
  // A root leaf filled the whole dock, so its size says nothing about the pane.
  if (!path || path.length === 0) return undefined

  let node: GridNode = root
  for (const index of path) {
    if (node.type !== 'branch') return undefined
    node = node.data[index]
  }
  if (node.size <= 0) return undefined

  const rootOri = (snapshot.grid.orientation as ReopenOrientation) ?? 'HORIZONTAL'
  const parentOri = (path.length - 1) % 2 === 0 ? rootOri : orthogonalOri(rootOri)
  return { axis: parentOri === 'HORIZONTAL' ? 'width' : 'height', px: node.size }
}

export function showPanelFromSnapshot(
  api: DockviewApi,
  id: DockPanelId,
  snapshot: SerializedDockview,
  closedPanelSnapshots: React.MutableRefObject<Map<DockPanelId, SerializedDockview>>,
  refs: LayoutRefs,
): void {
  const direction = showPanelFromHints(api, id, refs)
  const remembered = readRememberedSize(snapshot, id)
  // Skip a size measured across the other axis — the pane was a column then and
  // is a bar now (or vice versa), so its old width is not a usable height.
  if (remembered && remembered.axis === axisOfDirection(direction)) {
    applyPanelSize(api, id, remembered.axis, remembered.px, refs)
  }
  closedPanelSnapshots.current.delete(id)
}

/** Open `id` at its home and return the direction that placed it. */
export function showPanelFromHints(api: DockviewApi, id: DockPanelId, refs?: LayoutRefs): Direction | undefined {
  let position: { referencePanel: ReturnType<DockviewApi['getPanel']>; direction: Direction } | { direction: Direction } | undefined
  let usedDirection: Direction | undefined
  for (const hint of PANEL_RESTORE_HINTS[id]) {
    if (hint.ref === null) {
      position = { direction: hint.dir }
      usedDirection = hint.dir
      break
    }
    const ref = api.getPanel(hint.ref)
    if (ref) {
      position = { referencePanel: ref, direction: hint.dir }
      usedDirection = hint.dir
      break
    }
  }
  applyLayoutChangePreservingSidebarWidths(api, () => {
    api.addPanel({
      id,
      component: id,
      title: PANEL_TITLES[id],
      ...(position ? { position } : {}),
    })
    if (usedDirection === 'below') {
      if (id === 'shell') spanShellAcrossWorkspace(api)
      applyPanelHeightFraction(api, id, 1 / 3, refs)
    } else if (usedDirection !== 'within' && SIDEBAR_PANEL_IDS.has(id)) {
      // addPanel splits the reference group 50/50; the sidebar reopened via
      // hints should take its default share, not half the dock. A 'within'
      // reopen joined an existing group as a tab and adopts its size.
      applyPanelWidthFraction(api, id, SIDEBAR_WIDTH_FRACTION, refs)
    }
  }, refs)
  if (usedDirection !== 'below' && usedDirection !== 'within' && !SIDEBAR_PANEL_IDS.has(id)) {
    // A center pane reopened via hints splits its reference group 50/50. When
    // that reference is the sidebar and it had grown to dominate the dock (the
    // last survivor of an emptied dock), both end up around half the width —
    // shrink it back to its default share so the reopened pane gets the space.
    // Done outside the pinning scope, which holds the sidebar at its
    // pre-change width.
    for (const sidebarId of SIDEBAR_PANEL_IDS) {
      const group = api.getPanel(sidebarId)?.group
      if (
        group && api.width > 0 && group.api.width > api.width / 3
        && isPureSidebarGroup(api, group)
      ) {
        applyPanelWidthFraction(api, sidebarId, SIDEBAR_WIDTH_FRACTION, refs)
      }
    }
  }
  return usedDirection
}
