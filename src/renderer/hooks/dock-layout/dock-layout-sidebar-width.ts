// Keeping the sidebar column at the width the user left it. Every structural
// change to the dock runs through here: dockview redistributes freed space
// proportionally across siblings, so without pinning, the sidebar drifts wider
// or thinner on every panel toggle and every window resize.
import type { DockviewApi, SerializedDockview } from 'dockview'
import { applySidebarWidth, setRenderedWidth } from './useSidebarHandleCycle'
import { SIDEBAR_PANEL_IDS, getGridSignature, type GridNode, type LayoutRefs } from './dock-layout-model'

type SidebarGroup = NonNullable<NonNullable<ReturnType<DockviewApi['getPanel']>>['group']>

/** Read a panel group's current pixel width (0 if unavailable). */
function getPanelWidth(api: DockviewApi, panelId: string): number {
  try {
    return api.getPanel(panelId)?.group?.element.offsetWidth ?? 0
  } catch (err) {
    console.warn(`[getPanelWidth] failed for panel '${panelId}':`, err)
    return 0
  }
}

/** Read the sidebar group's current pixel width (0 if unavailable). */
export function getSidebarWidth(api: DockviewApi): number {
  return getPanelWidth(api, 'sidebar')
}

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
      // The same theme-gap shave withPinnedSidebars compensates for: the pin
      // constrains the view's *slot*, which carries that group's share of the
      // gap, so the pinned pass renders the sidebar a few pixels narrower than
      // the width it was pinned to — pixels it never gets back. Left
      // uncorrected, every window resize walked the sidebar steadily thinner.
      if (group.api.width !== width) setRenderedWidth(group, width)
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
