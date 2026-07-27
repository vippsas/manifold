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

/** The default share of the dock width a sidebar column gets (matches the
 *  1:4:1 default layout and the sanitizer's restored-sidebar cap). */
const SIDEBAR_WIDTH_FRACTION = 1 / 6

/**
 * Size the group containing `panelId` to roughly `fraction` of the dock height,
 * in place. Replaces an api.fromJSON() patch that tore down and remounted every
 * panel; a group setSize resizes without remounting, leaving the agent
 * terminal (and its xterm scrollback) intact.
 */
function applyPanelHeightFraction(api: DockviewApi, panelId: string, fraction: number, refs?: LayoutRefs): void {
  if (api.height <= 0) return
  const group = api.getPanel(panelId)?.group
  if (!group) return
  try {
    if (refs) refs.isRestoringRef.current = true
    try {
      group.api.setSize({ height: Math.round(api.height * fraction) })
    } finally {
      if (refs) refs.isRestoringRef.current = false
    }
    if (refs) refs.lastLayoutRef.current = api.toJSON()
  } catch (err) {
    console.warn(`[applyPanelHeightFraction] failed for '${panelId}':`, err)
  }
}

/** Width twin of applyPanelHeightFraction: size the group containing
 *  `panelId` to roughly `fraction` of the dock width, in place. */
function applyPanelWidthFraction(api: DockviewApi, panelId: string, fraction: number, refs?: LayoutRefs): void {
  if (api.width <= 0) return
  const group = api.getPanel(panelId)?.group
  if (!group) return
  try {
    if (refs) refs.isRestoringRef.current = true
    try {
      group.api.setSize({ width: Math.round(api.width * fraction) })
    } finally {
      if (refs) refs.isRestoringRef.current = false
    }
    if (refs) refs.lastLayoutRef.current = api.toJSON()
  } catch (err) {
    console.warn(`[applyPanelWidthFraction] failed for '${panelId}':`, err)
  }
}

function isCorruptedMinimalLayout(saved: SerializedDockview): boolean {
  const panelIds = new Set(Object.keys(saved.panels))
  return panelIds.size === 2 && panelIds.has('projects') && panelIds.has('agent')
}

export async function loadOrBuildLayout(
  api: DockviewApi,
  sessionId: string,
  buildDefault: (api: DockviewApi) => void,
  refs: LayoutRefs,
  liveSiblingSessionIds?: Set<string>,
): Promise<void> {
  try {
    const rawSaved = (await window.electronAPI.invoke('dock-layout:get', sessionId)) as SerializedDockview | null
    const saved = rawSaved ? sanitizeDockLayout(rawSaved, liveSiblingSessionIds) : null
    if (saved && saved.grid && saved.panels && !isCorruptedMinimalLayout(saved)) {
      refs.isRestoringRef.current = true
      try {
        api.fromJSON(saved)
        // fromJSON recreates each group at dockview's default 100px minimum,
        // clamping any collapsed (width-0) sidebar back open. Re-apply the
        // saved sub-minimum widths so a collapsed sidebar stays collapsed
        // across agent switches and app restarts.
        restoreCollapsedSidebarWidths(api, saved)
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
  // agent terminal — stays mounted. Pinning the sidebars keeps the freed space
  // on the center pane rather than letting the sidebars widen.
  withPinnedSidebars(api, () => api.removePanel(panel), id)
  refs.lastLayoutRef.current = api.toJSON()
}

type ReopenAxis = 'width' | 'height'
export interface ReopenPlacement {
  referencePanelId: string
  direction: Direction
  size?: { axis: ReopenAxis; px: number }
}

const orthogonalOri = (o: ReopenOrientation): ReopenOrientation => (o === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL')
type ReopenOrientation = 'HORIZONTAL' | 'VERTICAL'

/** Indices from the grid root down to the leaf containing `panelId` ([] = root leaf). */
function findLeafPath(node: GridNode, panelId: string): number[] | null {
  if (node.type === 'leaf') return node.data.views.includes(panelId) ? [] : null
  for (let i = 0; i < node.data.length; i++) {
    const sub = findLeafPath(node.data[i], panelId)
    if (sub) return [i, ...sub]
  }
  return null
}

/** First surviving panel in a subtree; `fromEnd` walks children in reverse so
 *  the chosen panel is the one bordering the reopened pane. */
function aliveInSubtree(node: GridNode, isAlive: (id: string) => boolean, fromEnd: boolean): string | undefined {
  if (node.type === 'leaf') return node.data.views.find(isAlive)
  const order = fromEnd ? [...node.data].reverse() : node.data
  for (const child of order) {
    const found = aliveInSubtree(child, isAlive, fromEnd)
    if (found) return found
  }
  return undefined
}

/**
 * Work out exactly where a closed pane should reopen, from the layout snapshot
 * taken when it was hidden — its original tab group if a co-tenant survives,
 * otherwise the side of its surviving neighbour (preferring the pane that sat
 * before it, so it lands back in its old slot) plus its captured size. Returns
 * undefined when nothing adjacent survives, so the caller falls back to hints.
 * Branch orientation alternates from grid.orientation each level down.
 */
export function computeReopenPlacement(
  snapshot: SerializedDockview,
  panelId: string,
  isAlive: (panelId: string) => boolean,
): ReopenPlacement | undefined {
  const root = snapshot.grid.root as GridNode
  const path = findLeafPath(root, panelId)
  if (!path || path.length === 0) return undefined

  const parentPath = path.slice(0, -1)
  const pIndex = path[path.length - 1]
  let parent: GridNode = root
  for (const idx of parentPath) {
    if (parent.type !== 'branch') return undefined
    parent = parent.data[idx]
  }
  if (parent.type !== 'branch') return undefined

  const leafNode = parent.data[pIndex]
  if (leafNode?.type === 'leaf') {
    const mate = leafNode.data.views.filter((v) => v !== panelId).find(isAlive)
    if (mate) return { referencePanelId: mate, direction: 'within' }
  }

  const rootOri = (snapshot.grid.orientation as ReopenOrientation) ?? 'HORIZONTAL'
  const parentOri = parentPath.length % 2 === 0 ? rootOri : orthogonalOri(rootOri)
  const axis: ReopenAxis = parentOri === 'HORIZONTAL' ? 'width' : 'height'
  const px = leafNode?.size ?? 0

  for (const [sibIndex, before] of [[pIndex - 1, true], [pIndex + 1, false]] as const) {
    const sibling = parent.data[sibIndex]
    if (!sibling) continue
    const ref = aliveInSubtree(sibling, isAlive, before)
    if (!ref) continue
    const direction: Direction = parentOri === 'HORIZONTAL'
      ? (before ? 'right' : 'left')
      : (before ? 'below' : 'above')
    return { referencePanelId: ref, direction, ...(px > 0 ? { size: { axis, px } } : {}) }
  }
  return undefined
}

export function showPanelFromSnapshot(
  api: DockviewApi,
  id: DockPanelId,
  snapshot: SerializedDockview,
  closedPanelSnapshots: React.MutableRefObject<Map<DockPanelId, SerializedDockview>>,
  refs: LayoutRefs,
): void {
  const placement = computeReopenPlacement(snapshot, id, (pid) => api.getPanel(pid) !== undefined)
  if (placement) {
    // Reopen at its exact prior position, in place — no api.fromJSON(), no remount.
    withPinnedSidebars(api, () => {
      api.addPanel({
        id,
        component: id,
        title: PANEL_TITLES[id],
        position: { referencePanel: placement.referencePanelId, direction: placement.direction },
      })
      if (placement.size) {
        const group = api.getPanel(id)?.group
        group?.api.setSize(placement.size.axis === 'width'
          ? { width: placement.size.px }
          : { height: placement.size.px })
      }
    }, id)
    refs.lastLayoutRef.current = api.toJSON()
  } else {
    // Nothing adjacent survived — reopen at its default spot.
    showPanelFromHints(api, id, refs)
  }
  closedPanelSnapshots.current.delete(id)
}

export function showPanelFromHints(api: DockviewApi, id: DockPanelId, refs?: LayoutRefs): void {
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
  applyLayoutChangePreservingSidebarWidths(api, () => {
    api.addPanel({
      id,
      component: id,
      title: PANEL_TITLES[id],
      ...(position ? { position } : {}),
    })
    if (usedDirection === 'below') {
      applyPanelHeightFraction(api, id, 1 / 3, refs)
    } else if (SIDEBAR_PANEL_IDS.has(id)) {
      // addPanel splits the reference group 50/50; a sidebar reopened via
      // hints should take its default share, not half the dock.
      applyPanelWidthFraction(api, id, SIDEBAR_WIDTH_FRACTION, refs)
    }
  }, refs)
  if (usedDirection !== 'below' && !SIDEBAR_PANEL_IDS.has(id)) {
    // A center pane reopened via hints splits its reference group 50/50. When
    // that reference is a sidebar that had grown to dominate the dock (the
    // last survivor of an emptied dock), both end up around half the width —
    // shrink such sidebars back to their default share so the reopened pane
    // gets the space. Done outside the pinning scope, which holds sidebars
    // at their pre-change width.
    for (const sidebarId of SIDEBAR_PANEL_IDS) {
      const group = api.getPanel(sidebarId)?.group
      if (group && api.width > 0 && group.api.width > api.width / 3) {
        applyPanelWidthFraction(api, sidebarId, SIDEBAR_WIDTH_FRACTION, refs)
      }
    }
  }
}
