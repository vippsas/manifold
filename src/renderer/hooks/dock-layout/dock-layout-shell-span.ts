import type { DockviewApi } from 'dockview'
import { getGridLocation } from 'dockview-core'

type DockGroup = NonNullable<NonNullable<ReturnType<DockviewApi['getPanel']>>['group']>

const SHELL_PANEL_ID = 'shell'
const SIDEBAR_PANEL_ID = 'sidebar'

/** A column of the workspace region — anything that is neither the sidebar nor
 *  the shell, so the agent, the editor panes and plugin panes all count. */
function isWorkspaceGroup(group: DockGroup): boolean {
  return !group.panels.some((panel) => panel.id === SIDEBAR_PANEL_ID || panel.id === SHELL_PANEL_ID)
}

function startsWith(location: number[], prefix: number[]): boolean {
  return prefix.every((value, index) => location[index] === value)
}

function compareLocations(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? -1) - (right[index] ?? -1)
    if (difference !== 0) return difference
  }
  return 0
}

/** The group furthest right in the row (grid locations compare lexically). */
function lastInGridOrder(groups: DockGroup[]): DockGroup | undefined {
  return groups.reduce<DockGroup | undefined>((last, group) => (
    last && compareLocations(getGridLocation(group.element), getGridLocation(last.element)) < 0
      ? last
      : group
  ), undefined)
}

/**
 * Make the shell span the whole workspace row.
 *
 * `addPanel(..., { direction: 'below' })` splits only the *reference pane's*
 * cell, so a shell opened while an editor column already exists lands under the
 * agent alone — the same two panes end up arranged differently depending on the
 * order they happened to be opened in. Move every workspace column that stayed
 * beside the shell into the row above it, so the arrangement is the same either
 * way. The sidebar is left out: it stays the full-height left column.
 *
 * Moving a group re-parents its existing element rather than rebuilding it, so
 * the agent terminal and any other stateful pane survive untouched — the same
 * reason the rest of this module avoids `api.fromJSON()`.
 */
export function spanShellAcrossWorkspace(api: DockviewApi): void {
  const shellGroup = api.getPanel(SHELL_PANEL_ID)?.group
  if (!shellGroup) return

  // Each pass moves one stray column into the row and never creates a group, so
  // the group count bounds the work.
  for (let remaining = api.groups.length; remaining > 0; remaining -= 1) {
    const rowPath = getGridLocation(shellGroup.element).slice(0, -1)
    const inRow: DockGroup[] = []
    let stray: DockGroup | undefined
    for (const group of api.groups) {
      if (group === shellGroup || !isWorkspaceGroup(group)) continue
      if (startsWith(getGridLocation(group.element), rowPath)) inRow.push(group)
      else stray ??= group
    }
    if (!stray) return

    const anchor = lastInGridOrder(inRow)
    // With nothing above the shell it is a column rather than a bar (the state
    // dockview collapses into when the agent is closed under it) — put the
    // stray column back on top so the next pass has a row to widen.
    stray.api.moveTo(anchor
      ? { group: anchor, position: 'right', skipSetActive: true }
      : { group: shellGroup, position: 'top', skipSetActive: true })
  }
}
