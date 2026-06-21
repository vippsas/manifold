import type { SerializedDockview } from 'dockview'
import { isSiblingPanelId, parseSiblingSessionId } from '../agent-siblings'
import { PANEL_IDS, isEditorPanelId, type DockPanelId, type GridNode } from './dock-layout-helpers'

const RETIRED_PANEL_IDS = new Set(['memory', 'webPreview', 'search', 'loop', 'backgroundAgent'])
const SUPPORTED_OPTIONAL_PANEL_IDS = new Set<string>()
const PLUGIN_PANEL_COMPONENTS = new Set(['pluginView', 'pluginTreeView'])
const DEFAULT_FILE_SIDEBAR_PANEL_IDS = ['fileTree', 'modifiedFiles'] as const

function isPluginPanel(panelId: string, savedPanels: Record<string, unknown>): boolean {
  const panel = savedPanels[panelId]
  if (typeof panel !== 'object' || panel === null) return false
  const component = (panel as { contentComponent?: unknown }).contentComponent
  return typeof component === 'string' && PLUGIN_PANEL_COMPONENTS.has(component)
}

function isSupportedSavedPanelId(
  panelId: string,
  savedPanels: Record<string, unknown>,
  liveSiblingSessionIds?: Set<string>,
): boolean {
  if (PANEL_IDS.includes(panelId as DockPanelId)) return true
  if (isEditorPanelId(panelId)) return true
  if (isPluginPanel(panelId, savedPanels)) return true
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
    !RETIRED_PANEL_IDS.has(panelId) && isSupportedSavedPanelId(panelId, savedPanels, liveSiblingSessionIds)
  )))

  if (validPanelIds.size === 0) return null

  if (!layoutNeedsSanitization(saved, validPanelIds)) {
    return normalizeWideDefaultSidebars(saved)
  }

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

  return normalizeWideDefaultSidebars(sanitized)
}

function normalizeWideDefaultSidebars(saved: SerializedDockview): SerializedDockview {
  const orientation = (saved.grid as { orientation?: unknown }).orientation
  if (orientation === 'VERTICAL') return saved

  const root = saved.grid.root as GridNode
  if (root.type !== 'branch' || root.data.length !== 3) return saved

  const [left, center, right] = root.data
  if (!isProjectsLeaf(left) || !isAgentLeaf(center) || !isFileSidebarLeaf(right)) return saved

  const total = root.data.reduce((sum, child) => sum + child.size, 0)
  if (total <= 0) return saved

  const maxSidebarSize = total / 4
  const defaultSidebarSize = Math.round(total / 6)
  const nextLeftSize = left.size > maxSidebarSize ? defaultSidebarSize : left.size
  const nextRightSize = right.size > maxSidebarSize ? defaultSidebarSize : right.size
  if (nextLeftSize === left.size && nextRightSize === right.size) return saved

  const normalized = JSON.parse(JSON.stringify(saved)) as SerializedDockview
  const normalizedRoot = normalized.grid.root as GridNode
  if (normalizedRoot.type !== 'branch') return saved
  normalizedRoot.data[0].size = nextLeftSize
  normalizedRoot.data[2].size = nextRightSize
  normalizedRoot.data[1].size = total - nextLeftSize - nextRightSize
  return normalized
}

function isProjectsLeaf(node: GridNode): boolean {
  return node.type === 'leaf' && hasExactViews(node, ['projects'])
}

function isAgentLeaf(node: GridNode): boolean {
  return node.type === 'leaf' &&
    node.data.views.includes('agent') &&
    node.data.views.every((view) => view === 'agent' || isSiblingPanelId(view))
}

function isFileSidebarLeaf(node: GridNode): boolean {
  return node.type === 'leaf' && hasExactViews(node, DEFAULT_FILE_SIDEBAR_PANEL_IDS)
}

function hasExactViews(node: Extract<GridNode, { type: 'leaf' }>, expected: readonly string[]): boolean {
  if (node.data.views.length !== expected.length) return false
  return expected.every((view) => node.data.views.includes(view))
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
