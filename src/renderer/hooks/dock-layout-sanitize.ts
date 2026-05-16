import type { SerializedDockview } from 'dockview'
import { isSiblingPanelId, parseSiblingSessionId } from './agent-siblings'
import { PANEL_IDS, isEditorPanelId, type DockPanelId, type GridNode } from './dock-layout-helpers'

const RETIRED_PANEL_IDS = new Set(['memory'])
const SUPPORTED_OPTIONAL_PANEL_IDS = new Set(['webPreview'])

function isSupportedSavedPanelId(panelId: string, liveSiblingSessionIds?: Set<string>): boolean {
  if (PANEL_IDS.includes(panelId as DockPanelId)) return true
  if (isEditorPanelId(panelId)) return true
  if (SUPPORTED_OPTIONAL_PANEL_IDS.has(panelId)) return true
  if (isSiblingPanelId(panelId)) {
    // Sibling panels are runtime-only. Three cases:
    //   * `liveSiblingSessionIds` is a Set: keep only panels whose session
    //     is currently live; strip orphans from a prior app run.
    //   * `liveSiblingSessionIds` is undefined: caller signals it doesn't
    //     yet know which sessions are live (e.g. project still loading).
    //     Keep the panel; `useAgentSiblingDockTabs` reconciles afterwards.
    if (liveSiblingSessionIds === undefined) return true
    const sid = parseSiblingSessionId(panelId)
    return !!sid && liveSiblingSessionIds.has(sid)
  }
  return false
}

function stripInvalidPanelsFromTree(node: GridNode, validPanelIds: Set<string>): GridNode | null {
  if (node.type === 'leaf') {
    const views = node.data.views.filter((view) => validPanelIds.has(view))
    if (views.length === 0) return null
    node.data.views = views
    if (!node.data.activeView || !views.includes(node.data.activeView)) {
      node.data.activeView = views[0]
    }
    return node
  }

  const nextChildren = node.data
    .map((child) => stripInvalidPanelsFromTree(child, validPanelIds))
    .filter((child): child is GridNode => child !== null)

  if (nextChildren.length === 0) return null
  if (nextChildren.length === 1) {
    const [onlyChild] = nextChildren
    onlyChild.size = node.size
    return onlyChild
  }

  node.data = nextChildren
  return node
}

export function sanitizeDockLayout(
  saved: SerializedDockview,
  liveSiblingSessionIds?: Set<string>,
): SerializedDockview | null {
  const savedPanels = (saved.panels ?? {}) as Record<string, unknown>
  const savedPanelIds = Object.keys(savedPanels)
  const validPanelIds = new Set(savedPanelIds.filter((panelId) => (
    !RETIRED_PANEL_IDS.has(panelId) && isSupportedSavedPanelId(panelId, liveSiblingSessionIds)
  )))

  if (validPanelIds.size === 0) return null

  if (!layoutNeedsSanitization(saved, validPanelIds)) return saved

  const sanitized = JSON.parse(JSON.stringify(saved)) as SerializedDockview
  const root = stripInvalidPanelsFromTree(sanitized.grid.root as GridNode, validPanelIds)
  if (!root) return null

  sanitized.grid.root = root

  const referencedPanelIds = new Set(collectPanelIds(root))
  for (const panelId of Object.keys((sanitized.panels ?? {}) as Record<string, unknown>)) {
    if (!referencedPanelIds.has(panelId)) {
      delete (sanitized.panels as Record<string, unknown>)[panelId]
    }
  }

  if (Object.keys((sanitized.panels ?? {}) as Record<string, unknown>).length === 0) return null

  return sanitized
}

function layoutNeedsSanitization(saved: SerializedDockview, validPanelIds: Set<string>): boolean {
  const savedPanels = (saved.panels ?? {}) as Record<string, unknown>

  for (const panelId of Object.keys(savedPanels)) {
    if (!validPanelIds.has(panelId)) return true
  }

  return treeNeedsSanitization(saved.grid.root as GridNode, validPanelIds)
}

function treeNeedsSanitization(node: GridNode, validPanelIds: Set<string>): boolean {
  if (node.type === 'leaf') {
    if (node.data.views.length === 0) return true
    if (node.data.views.some((view) => !validPanelIds.has(view))) return true
    if (!node.data.activeView || !node.data.views.includes(node.data.activeView)) return true
    return false
  }

  if (node.data.length === 0) return true
  return node.data.some((child) => treeNeedsSanitization(child, validPanelIds))
}

function collectPanelIds(node: GridNode): string[] {
  if (node.type === 'leaf') return [...node.data.views]
  return node.data.flatMap(collectPanelIds)
}
