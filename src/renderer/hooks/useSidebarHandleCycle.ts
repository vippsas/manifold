import { useEffect } from 'react'
import type { DockviewApi } from 'dockview'

type SidebarSide = 'left' | 'right'

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
 * Advance the given sidebar to the next width in the cycle, keeping the
 * opposite sidebar pinned so only the center pane absorbs the difference.
 */
function cycleSidebar(api: DockviewApi, side: SidebarSide, reversed: boolean): void {
  const total = api.width
  if (total <= 0) return

  const targetId = side === 'left' ? 'projects' : 'fileTree'
  const otherId = side === 'left' ? 'fileTree' : 'projects'

  const targetGroup = api.getPanel(targetId)?.group
  if (!targetGroup) return

  const nextWidth = Math.round(nextSidebarFraction(targetGroup.element.offsetWidth / total, reversed) * total)

  // Lock the opposite sidebar at its current width so dockview routes the
  // whole delta to the center pane instead of splitting it across siblings.
  const otherGroup = api.getPanel(otherId)?.group
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
 * Double-clicking a sidebar grab handle cycles that sidebar's width through
 * 1/6 → 2/6 → 3/6 → 0 → 1/6 of the window (or the reverse,
 * 1/6 → 0 → 3/6 → 2/6 → 1/6, when `reversed`). Each handle drives its own
 * adjacent sidebar (left = repositories, right = files).
 */
export function useSidebarHandleCycle(
  apiRef: React.MutableRefObject<DockviewApi | null>,
  reversed = false,
): void {
  useEffect(() => {
    const onDoubleClick = (event: MouseEvent): void => {
      const api = apiRef.current
      if (!api) return
      const sash = (event.target as HTMLElement | null)?.closest?.('.dv-sash') as HTMLElement | null
      if (!sash || !sash.closest('.dockview-theme-manifold')) return
      const side = sidebarSideForSash(api, sash)
      if (side) cycleSidebar(api, side, reversed)
    }
    document.addEventListener('dblclick', onDoubleClick)
    return () => document.removeEventListener('dblclick', onDoubleClick)
  }, [apiRef, reversed])
}
