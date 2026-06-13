import { useCallback, useEffect, useRef } from 'react'
import type { DockviewApi } from 'dockview'

type SidebarSide = 'left' | 'right'

/** Anchor panel id for each sidebar side. */
const SIDE_PANEL_ID: Record<SidebarSide, string> = { left: 'projects', right: 'fileTree' }

// Fractions of the window width the double-click cycle steps through, in order.
// The default layout starts a sidebar at 1/6, so the first double-click moves
// it to 2/6, then 3/6, then collapses it, then back to the 1/6 default.
const CYCLE = [1 / 6, 2 / 6, 3 / 6, 0]

// How close (px) a sash's center must sit to a sidebar edge to count as that
// sidebar's grab handle. Keeps center/editor/shell sashes from triggering it.
const EDGE_THRESHOLD_PX = 12

/**
 * Given a sidebar's current width fraction, return the next fraction in the
 * cycle. Snaps to the nearest cycle step first, so a manually dragged sidebar
 * still advances sensibly. When `reversed`, walks the cycle the other way, so
 * the first double-click collapses (1/6 → 0 → 3/6 → 2/6 → 1/6).
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
 * of splitting it across siblings. Shared by the sash double-click cycle and the
 * header collapse button.
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

  // Allow the target to collapse fully — the default group minimum blocks 0.
  targetGroup.api.setConstraints({ minimumWidth: 0 })
  targetGroup.api.setSize({ width: nextWidth })

  // Release the opposite sidebar so it stays freely draggable afterward.
  if (otherGroup && otherWidth) {
    otherGroup.api.setConstraints({ minimumWidth: 0, maximumWidth: Number.MAX_SAFE_INTEGER })
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
 * opposite sidebar pinned so only the center pane absorbs the difference. When
 * `restoreWidth` is given (re-expanding a button-collapsed sidebar from the edge
 * handle), jump straight to that remembered width instead of cycling.
 */
function cycleSidebar(api: DockviewApi, side: SidebarSide, reversed: boolean, restoreWidth?: number): void {
  const total = api.width
  if (total <= 0) return

  const targetGroup = api.getPanel(SIDE_PANEL_ID[side])?.group
  if (!targetGroup) return

  const nextWidth = restoreWidth != null
    ? restoreWidth
    : Math.round(nextSidebarFraction(targetGroup.element.offsetWidth / total, reversed) * total)

  applySidebarWidth(api, side, nextWidth)
}

export interface UseSidebarHandleCycleResult {
  /** Collapse a sidebar to width 0 from its header button, remembering the
   *  pre-collapse width so the edge handle can later restore it exactly. */
  collapseSidebar: (side: SidebarSide) => void
}

/**
 * Double-clicking a sidebar grab handle cycles that sidebar's width through
 * 1/6 → 2/6 → 3/6 → 0 → 1/6 of the window (or the reverse,
 * 1/6 → 0 → 3/6 → 2/6 → 1/6, when `reversed`). Each handle drives its own
 * adjacent sidebar (left = repositories, right = files). Also returns a
 * `collapseSidebar` callback the header buttons use to collapse a sidebar to 0;
 * a sidebar collapsed that way re-expands to its remembered width on the next
 * edge double-click.
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
    const onDoubleClick = (event: MouseEvent): void => {
      const api = apiRef.current
      if (!api) return
      const sash = (event.target as HTMLElement | null)?.closest?.('.dv-sash') as HTMLElement | null
      if (!sash || !sash.closest('.dockview-theme-manifold')) return
      const side = sidebarSideForSash(api, sash)
      if (!side) return
      // A button-collapsed sidebar (width 0) re-expands to its remembered
      // pre-collapse width; otherwise advance the normal cycle.
      const collapsedWidth = api.getPanel(SIDE_PANEL_ID[side])?.group?.element.offsetWidth ?? 0
      const remembered = collapsedWidth <= 1 ? collapsedWidthRef.current[side] : null
      cycleSidebar(api, side, reversed, remembered ?? undefined)
      if (remembered != null) collapsedWidthRef.current[side] = null
    }
    document.addEventListener('dblclick', onDoubleClick)
    return () => document.removeEventListener('dblclick', onDoubleClick)
  }, [apiRef, reversed])

  return { collapseSidebar: handleCollapseSidebar }
}
