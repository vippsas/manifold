// The dock-layout entry point: re-exports the subsystem's public surface so
// callers have one import, and holds the grid-geometry helpers that don't
// belong to any one of the modules below.
//
//   dock-layout-model.ts        panel ids, titles, homes, serialized grid types
//   dock-layout-sidebar-width.ts  pinning/measuring/restoring the sidebar column
//   dock-layout-loader.ts       building, restoring, showing and hiding panes
//   dock-layout-sanitize.ts     healing a saved layout before it is restored
import type { DockviewApi } from 'dockview'
import { getRelativeLocation, type Orientation } from 'dockview-core'
import type { EditorSplitDirection } from './dock-layout-model'

export * from './dock-layout-model'
export {
  getSidebarWidth,
  restoreSidebarWidth,
  withPinnedSidebars,
  applyLayoutChangePreservingSidebarWidths,
  restoreCollapsedSidebarWidths,
} from './dock-layout-sidebar-width'
export { sanitizeDockLayout } from './dock-layout-sanitize'
export {
  loadOrBuildLayout,
  applyBuiltLayout,
  hidePanel,
  showPanelFromSnapshot,
  showPanelFromHints,
} from './dock-layout-loader'

function areGridLocationsEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
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
