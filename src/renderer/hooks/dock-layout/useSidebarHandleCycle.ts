import { useCallback, useEffect, useRef } from 'react'
import type { DockviewApi } from 'dockview'

// Fractions of the window width the double-click cycle steps through, in order.
// The default layout starts the sidebar at 1/6, so the first double-click moves
// it to 2/6, then 3/6, then back to the 1/6 default. Hiding a sidebar is done
// by closing the panel, so 0 is deliberately never a step here.
const CYCLE = [1 / 6, 2 / 6, 3 / 6]

// How close (px) a sash's center must sit to the sidebar's edge to count as its
// grab handle. Keeps center/editor/shell sashes from triggering it.
const EDGE_THRESHOLD_PX = 12

/** The anchor panel of the one sidebar. */
const SIDEBAR_PANEL_ID = 'sidebar'

/**
 * Given a sidebar's current width fraction, return the next fraction in the
 * cycle. Snaps to the nearest cycle step first, so a manually dragged sidebar
 * still advances sensibly. When `reversed`, walks the cycle the other way
 * (1/6 → 3/6 → 2/6 → 1/6).
 */
export function nextSidebarFraction(currentFraction: number, reversed = false): number {
  const nearest = CYCLE.reduce(
    (best, fraction, index) =>
      Math.abs(fraction - currentFraction) < Math.abs(CYCLE[best] - currentFraction) ? index : best,
    0,
  )
  const step = reversed ? CYCLE.length - 1 : 1
  return CYCLE[(nearest + step) % CYCLE.length]
}

const EDGE_CLASS = 'dv-sash--edge-left'

/**
 * Tag the sidebar's sash when it is collapsed flush to the window edge so CSS
 * can anchor its grab zone inward (the default centered zone half-clips off the
 * edge, leaving a thin target). Reads the actual width, so it self-heals after
 * a cycle or a manual drag to 0.
 */
function refreshEdgeGrab(api: DockviewApi): void {
  const root = document.querySelector<HTMLElement>('.dockview-theme-manifold')
  if (!root) return
  const sashes = Array.from(root.querySelectorAll<HTMLElement>('.dv-sash'))
  for (const sash of sashes) sash.classList.remove(EDGE_CLASS)

  const group = api.getPanel(SIDEBAR_PANEL_ID)?.group
  if (!group || group.element.offsetWidth > 1) return
  sashes.find((sash) => isSidebarSash(api, sash))?.classList.add(EDGE_CLASS)
}

/** Whether the sash borders the sidebar (i.e. is its grab handle). */
function isSidebarSash(api: DockviewApi, sash: HTMLElement): boolean {
  const sidebar = api.getPanel(SIDEBAR_PANEL_ID)?.group?.element
  if (!sidebar) return false

  const sashRect = sash.getBoundingClientRect()
  const sashCenter = sashRect.left + sashRect.width / 2
  return Math.abs(sashCenter - sidebar.getBoundingClientRect().right) <= EDGE_THRESHOLD_PX
}

type ResizableGroup = NonNullable<NonNullable<ReturnType<DockviewApi['getPanel']>>['group']>

/**
 * Size a group so that it *renders* `width` pixels wide.
 *
 * `setSize` takes the view's slot in the splitview, which includes that view's
 * share of the theme's group gap, while `api.width` reports the rendered width
 * the slot leaves behind (`view.layout(size - margin * sashes / views)`). The
 * two differ by a few pixels, so feeding a measured width straight back into
 * `setSize` shrinks the group a little every time — which is how repeatedly
 * toggling a panel walked the sidebars steadily narrower. Ask for the slot that
 * lands on the width we actually want.
 */
export function setRenderedWidth(group: ResizableGroup, width: number): void {
  group.api.setSize({ width })
  const shortfall = width - group.api.width
  if (shortfall > 0) group.api.setSize({ width: width + shortfall })
}

/**
 * Resize the sidebar to an exact pixel width. With one sidebar there is no
 * opposite one to hold, so dockview routes the whole delta onto the center
 * pane. Shared by the sash double-click cycle and programmatic collapse
 * (`collapseSidebar`).
 */
export function applySidebarWidth(api: DockviewApi, nextWidth: number): void {
  const targetGroup = api.getPanel(SIDEBAR_PANEL_ID)?.group
  if (!targetGroup) return

  // Allow the target to collapse fully — the default group minimum blocks 0.
  targetGroup.api.setConstraints({ minimumWidth: 0 })
  setRenderedWidth(targetGroup, nextWidth)

  refreshEdgeGrab(api)
}

/**
 * Collapse the sidebar to width 0, returning its pre-collapse pixel width (0
 * when already collapsed or unavailable). Callers remember the returned width
 * so the sidebar can later be re-expanded to exactly where it was.
 */
export function collapseSidebar(api: DockviewApi): number {
  const width = api.getPanel(SIDEBAR_PANEL_ID)?.group?.element.offsetWidth ?? 0
  applySidebarWidth(api, 0)
  return width
}

/** Advance the sidebar to the next width in the cycle. */
function cycleSidebar(api: DockviewApi, reversed: boolean): void {
  const total = api.width
  if (total <= 0) return

  const targetGroup = api.getPanel(SIDEBAR_PANEL_ID)?.group
  if (!targetGroup) return

  const nextWidth = Math.round(nextSidebarFraction(targetGroup.element.offsetWidth / total, reversed) * total)
  applySidebarWidth(api, nextWidth)
}

/** Whether an event landed on the collapsed sidebar's edge rail, via the class
 *  that `refreshEdgeGrab` tags onto a flush-to-edge sash. False for any other
 *  sash, or when the sidebar isn't actually collapsed (stale class). */
function isCollapsedRailClick(api: DockviewApi, event: MouseEvent): boolean {
  const sash = (event.target as HTMLElement | null)?.closest?.('.dv-sash') as HTMLElement | null
  if (!sash || !sash.closest('.dockview-theme-manifold')) return false
  if (!sash.classList.contains(EDGE_CLASS)) return false
  return (api.getPanel(SIDEBAR_PANEL_ID)?.group?.element.offsetWidth ?? 0) <= 1
}

export interface UseSidebarHandleCycleResult {
  /** Collapse the sidebar to width 0, remembering the pre-collapse width so a
   *  single click on the edge rail restores it exactly. No UI triggers this
   *  since the header collapse buttons were removed (panels are closed
   *  instead), but the edge-rail restore must keep working for a sidebar that
   *  was collapsed before the buttons went away and persists as width 0. */
  collapseSidebar: () => void
}

/**
 * Wires the two sidebar gestures:
 * - A single click on the collapsed sidebar's edge rail reopens it, restoring
 *   its remembered pre-collapse width (or the 1/6 default when none was
 *   remembered, e.g. after a manual drag to the edge).
 * - Double-clicking the sidebar's grab handle cycles its width through
 *   1/6 → 2/6 → 3/6 → 1/6 of the window (or the reverse when `reversed`); it
 *   never collapses to 0 — hiding a panel is done by closing it.
 */
export function useSidebarHandleCycle(
  apiRef: React.MutableRefObject<DockviewApi | null>,
  reversed = false,
): UseSidebarHandleCycleResult {
  const collapsedWidthRef = useRef<number | null>(null)

  const handleCollapseSidebar = useCallback((): void => {
    const api = apiRef.current
    if (!api) return
    const width = collapseSidebar(api)
    if (width > 1) collapsedWidthRef.current = width
  }, [apiRef])

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const api = apiRef.current
      if (!api) return
      if (!isCollapsedRailClick(api, event)) return
      const remembered = collapsedWidthRef.current
      const width = remembered != null && remembered > 1 ? remembered : Math.round(api.width / 6)
      applySidebarWidth(api, width)
      collapsedWidthRef.current = null
    }

    const onDoubleClick = (event: MouseEvent): void => {
      const api = apiRef.current
      if (!api) return
      const sash = (event.target as HTMLElement | null)?.closest?.('.dv-sash') as HTMLElement | null
      if (!sash || !sash.closest('.dockview-theme-manifold')) return
      if (isSidebarSash(api, sash)) cycleSidebar(api, reversed)
    }

    document.addEventListener('click', onClick)
    document.addEventListener('dblclick', onDoubleClick)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('dblclick', onDoubleClick)
    }
  }, [apiRef, reversed])

  return { collapseSidebar: handleCollapseSidebar }
}
