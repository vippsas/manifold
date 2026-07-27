import { useCallback, useEffect, useRef } from 'react'
import type { DockviewApi } from 'dockview'

type SidebarSide = 'left' | 'right'

/** Anchor panel id for each sidebar side. */
const SIDE_PANEL_ID: Record<SidebarSide, string> = { left: 'projects', right: 'fileTree' }

// Fractions of the window width the double-click cycle steps through, in order.
// The default layout starts a sidebar at 1/6, so the first double-click moves
// it to 2/6, then 3/6, then back to the 1/6 default. Hiding a sidebar is done
// by closing the panel, so 0 is deliberately never a step here.
const CYCLE = [1 / 6, 2 / 6, 3 / 6]

// How close (px) a sash's center must sit to a sidebar edge to count as that
// sidebar's grab handle. Keeps center/editor/shell sashes from triggering it.
const EDGE_THRESHOLD_PX = 12

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

function panelGroupElement(api: DockviewApi, panelId: string): HTMLElement | undefined {
  return api.getPanel(panelId)?.group?.element
}

const EDGE_CLASS: Record<SidebarSide, string> = {
  left: 'dv-sash--edge-left',
  right: 'dv-sash--edge-right',
}

/**
 * Tag the sash of any sidebar that's collapsed flush to the window edge so CSS
 * can anchor its grab zone inward (the default centered zone half-clips off the
 * edge, leaving a thin target). Reads actual widths, so it self-heals after a
 * cycle or a manual drag to 0.
 */
function refreshEdgeGrab(api: DockviewApi): void {
  const root = document.querySelector<HTMLElement>('.dockview-theme-manifold')
  if (!root) return
  const sashes = Array.from(root.querySelectorAll<HTMLElement>('.dv-sash'))
  for (const sash of sashes) sash.classList.remove(EDGE_CLASS.left, EDGE_CLASS.right)

  for (const side of ['left', 'right'] as SidebarSide[]) {
    const id = side === 'left' ? 'projects' : 'fileTree'
    const group = api.getPanel(id)?.group
    if (!group || group.element.offsetWidth > 1) continue
    const sash = sashes.find((s) => sidebarSideForSash(api, s) === side)
    sash?.classList.add(EDGE_CLASS[side])
  }
}

/** Which sidebar (if any) the double-clicked sash borders. */
function sidebarSideForSash(api: DockviewApi, sash: HTMLElement): SidebarSide | null {
  const sashRect = sash.getBoundingClientRect()
  const sashCenter = sashRect.left + sashRect.width / 2

  const projects = panelGroupElement(api, 'projects')
  const files = panelGroupElement(api, 'fileTree')

  let side: SidebarSide | null = null
  let bestDist = EDGE_THRESHOLD_PX
  if (projects) {
    const dist = Math.abs(sashCenter - projects.getBoundingClientRect().right)
    if (dist <= bestDist) { bestDist = dist; side = 'left' }
  }
  if (files) {
    const dist = Math.abs(sashCenter - files.getBoundingClientRect().left)
    if (dist < bestDist) { bestDist = dist; side = 'right' }
  }
  return side
}

/**
 * Resize a sidebar to an exact pixel width, holding the opposite sidebar at its
 * current width so dockview routes the whole delta onto the center pane instead
 * of splitting it across siblings. Shared by the sash double-click cycle and
 * programmatic collapse (`collapseSidebar`).
 */
export function applySidebarWidth(api: DockviewApi, side: SidebarSide, nextWidth: number): void {
  const targetGroup = api.getPanel(SIDE_PANEL_ID[side])?.group
  if (!targetGroup) return

  // Lock the opposite sidebar at its current width so dockview routes the
  // whole delta to the center pane instead of splitting it across siblings.
  const otherGroup = api.getPanel(SIDE_PANEL_ID[side === 'left' ? 'right' : 'left'])?.group
  const otherWidth = otherGroup?.element.offsetWidth
  if (otherGroup && otherWidth) {
    otherGroup.api.setConstraints({ minimumWidth: otherWidth, maximumWidth: otherWidth })
  }

  try {
    // Allow the target to collapse fully — the default group minimum blocks 0.
    targetGroup.api.setConstraints({ minimumWidth: 0 })
    targetGroup.api.setSize({ width: nextWidth })
  } finally {
    // Release the opposite sidebar so it stays freely draggable afterward. The
    // same-size setSize pokes a relayout so the sashes that the pinned setSize
    // pass marked dv-disabled re-enable (dockview re-evaluates sash enablement
    // only during a layout pass, never on setConstraints alone).
    if (otherGroup && otherWidth) {
      otherGroup.api.setConstraints({ minimumWidth: 0, maximumWidth: Number.MAX_SAFE_INTEGER })
      otherGroup.api.setSize({ width: otherGroup.api.width })
    }
  }

  refreshEdgeGrab(api)
}

/**
 * Collapse a sidebar to width 0, returning its pre-collapse pixel width (0 when
 * already collapsed or unavailable). Callers remember the returned width so the
 * sidebar can later be re-expanded to exactly where it was.
 */
export function collapseSidebar(api: DockviewApi, side: SidebarSide): number {
  const width = api.getPanel(SIDE_PANEL_ID[side])?.group?.element.offsetWidth ?? 0
  applySidebarWidth(api, side, 0)
  return width
}

/**
 * Advance the given sidebar to the next width in the cycle, keeping the
 * opposite sidebar pinned so only the center pane absorbs the difference.
 */
function cycleSidebar(api: DockviewApi, side: SidebarSide, reversed: boolean): void {
  const total = api.width
  if (total <= 0) return

  const targetGroup = api.getPanel(SIDE_PANEL_ID[side])?.group
  if (!targetGroup) return

  const nextWidth = Math.round(nextSidebarFraction(targetGroup.element.offsetWidth / total, reversed) * total)
  applySidebarWidth(api, side, nextWidth)
}

/** Which collapsed sidebar (if any) an event landed on, via the edge-rail class
 *  that `refreshEdgeGrab` tags onto a flush-to-edge sash. Returns null for any
 *  other sash, or when the sidebar isn't actually collapsed (stale class). */
function collapsedRailSide(api: DockviewApi, event: MouseEvent): SidebarSide | null {
  const sash = (event.target as HTMLElement | null)?.closest?.('.dv-sash') as HTMLElement | null
  if (!sash || !sash.closest('.dockview-theme-manifold')) return null
  const side: SidebarSide | null = sash.classList.contains('dv-sash--edge-left')
    ? 'left'
    : sash.classList.contains('dv-sash--edge-right')
      ? 'right'
      : null
  if (!side) return null
  const width = api.getPanel(SIDE_PANEL_ID[side])?.group?.element.offsetWidth ?? 0
  return width <= 1 ? side : null
}

export interface UseSidebarHandleCycleResult {
  /** Collapse a sidebar to width 0, remembering the pre-collapse width so a
   *  single click on the edge rail restores it exactly. No UI triggers this
   *  since the header collapse buttons were removed (panels are closed
   *  instead), but the edge-rail restore must keep working for sidebars that
   *  were collapsed before the buttons went away and persist as width 0. */
  collapseSidebar: (side: SidebarSide) => void
}

/**
 * Wires the two sidebar gestures:
 * - A single click on a collapsed sidebar's edge rail reopens it, restoring its
 *   remembered pre-collapse width (or the 1/6 default when none was remembered,
 *   e.g. after a manual drag to the edge).
 * - Double-clicking a sidebar grab handle cycles its width through
 *   1/6 → 2/6 → 3/6 → 1/6 of the window (or the reverse when `reversed`); it
 *   never collapses to 0 — hiding a panel is done by closing it.
 */
export function useSidebarHandleCycle(
  apiRef: React.MutableRefObject<DockviewApi | null>,
  reversed = false,
): UseSidebarHandleCycleResult {
  const collapsedWidthRef = useRef<Record<SidebarSide, number | null>>({ left: null, right: null })

  const handleCollapseSidebar = useCallback((side: SidebarSide): void => {
    const api = apiRef.current
    if (!api) return
    const width = collapseSidebar(api, side)
    if (width > 1) collapsedWidthRef.current[side] = width
  }, [apiRef])

  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      const api = apiRef.current
      if (!api) return
      const side = collapsedRailSide(api, event)
      if (!side) return
      const remembered = collapsedWidthRef.current[side]
      const width = remembered != null && remembered > 1 ? remembered : Math.round(api.width / 6)
      applySidebarWidth(api, side, width)
      collapsedWidthRef.current[side] = null
    }

    const onDoubleClick = (event: MouseEvent): void => {
      const api = apiRef.current
      if (!api) return
      const sash = (event.target as HTMLElement | null)?.closest?.('.dv-sash') as HTMLElement | null
      if (!sash || !sash.closest('.dockview-theme-manifold')) return
      const side = sidebarSideForSash(api, sash)
      if (side) cycleSidebar(api, side, reversed)
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
