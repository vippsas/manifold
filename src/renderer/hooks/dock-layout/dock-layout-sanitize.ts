import type { SerializedDockview } from 'dockview'
import { isSiblingPanelId, parseSiblingSessionId } from '../agent-session/agent-siblings'
import { PANEL_IDS, isEditorPanelId, type DockPanelId, type GridNode } from './dock-layout-helpers'

const RETIRED_PANEL_IDS = new Set(['memory', 'webPreview', 'search', 'loop', 'backgroundAgent'])
const SUPPORTED_OPTIONAL_PANEL_IDS = new Set<string>()
const PLUGIN_PANEL_COMPONENTS = new Set(['pluginView', 'pluginTreeView'])
const RESTORED_SIDEBAR_MAX_FRACTION = 1 / 6
const LEFT_SIDEBAR_PANEL_IDS = new Set<string>(['projects'])
const RIGHT_SIDEBAR_PANEL_IDS = new Set<string>(['fileTree', 'modifiedFiles'])
const STACKED_SIDEBAR_PANEL_IDS = new Set<string>(['projects', 'fileTree', 'modifiedFiles'])

type GridOrientation = 'HORIZONTAL' | 'VERTICAL'

function cloneLayout(saved: SerializedDockview): SerializedDockview {
  return JSON.parse(JSON.stringify(saved)) as SerializedDockview
}

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

function branchOrientationAtDepth(rootOrientation: GridOrientation, depth: number): GridOrientation {
  const isRootOrientation = depth % 2 === 0
  if (isRootOrientation) return rootOrientation
  return rootOrientation === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL'
}

function nodePanelIds(node: GridNode): string[] {
  if (node.type === 'leaf') return [...node.data.views]
  return node.data.flatMap(nodePanelIds)
}

function isSidebarSubtree(node: GridNode, requiredPanelId: string, allowedPanelIds: Set<string>): boolean {
  const panelIds = nodePanelIds(node)
  return panelIds.includes(requiredPanelId) && panelIds.every((panelId) => allowedPanelIds.has(panelId))
}

function isStackedSidebarSubtree(node: GridNode): boolean {
  const panelIds = nodePanelIds(node)
  return panelIds.includes('projects')
    && panelIds.includes('fileTree')
    && panelIds.every((panelId) => STACKED_SIDEBAR_PANEL_IDS.has(panelId))
}

function distributeFreedSize(branch: Extract<GridNode, { type: 'branch' }>, workspaceIndexes: number[], freedSize: number): void {
  const workspaceTotal = workspaceIndexes.reduce((total, index) => total + Math.max(0, branch.data[index].size), 0)
  if (workspaceTotal <= 0) {
    branch.data[workspaceIndexes[0]].size += freedSize
    return
  }

  let remaining = freedSize
  workspaceIndexes.forEach((index, order) => {
    const isLast = order === workspaceIndexes.length - 1
    const addition = isLast
      ? remaining
      : Math.round(freedSize * (Math.max(0, branch.data[index].size) / workspaceTotal))
    branch.data[index].size += addition
    remaining -= addition
  })
}

function capSidebarWidthsInBranch(branch: Extract<GridNode, { type: 'branch' }>): boolean {
  const stackedIndex = branch.data.findIndex(isStackedSidebarSubtree)
  if (stackedIndex >= 0) {
    const workspaceIndexes = branch.data
      .map((_, index) => index)
      .filter((index) => index !== stackedIndex)
    if (workspaceIndexes.length === 0) return false

    const total = branch.data.reduce((sum, child) => sum + Math.max(0, child.size), 0)
    if (total <= 0) return false

    const maxSidebarSize = Math.round(total * RESTORED_SIDEBAR_MAX_FRACTION)
    const sidebar = branch.data[stackedIndex]
    if (sidebar.size <= maxSidebarSize) return false

    const freedSize = sidebar.size - maxSidebarSize
    sidebar.size = maxSidebarSize
    distributeFreedSize(branch, workspaceIndexes, freedSize)
    return true
  }

  const leftIndex = branch.data.findIndex((child) => isSidebarSubtree(child, 'projects', LEFT_SIDEBAR_PANEL_IDS))
  const rightIndex = branch.data.findIndex((child) => isSidebarSubtree(child, 'fileTree', RIGHT_SIDEBAR_PANEL_IDS))
  if (leftIndex < 0 || rightIndex < 0 || leftIndex === rightIndex) return false

  const workspaceIndexes = branch.data
    .map((_, index) => index)
    .filter((index) => index !== leftIndex && index !== rightIndex)
  if (workspaceIndexes.length === 0) return false

  const total = branch.data.reduce((sum, child) => sum + Math.max(0, child.size), 0)
  if (total <= 0) return false

  const maxSidebarSize = Math.round(total * RESTORED_SIDEBAR_MAX_FRACTION)
  let freedSize = 0
  for (const index of [leftIndex, rightIndex]) {
    const child = branch.data[index]
    if (child.size <= maxSidebarSize) continue
    freedSize += child.size - maxSidebarSize
    child.size = maxSidebarSize
  }

  if (freedSize <= 0) return false
  distributeFreedSize(branch, workspaceIndexes, freedSize)
  return true
}

function capRestoredSidebarWidths(node: GridNode, rootOrientation: GridOrientation, depth = 0): boolean {
  if (node.type === 'leaf') return false

  const orientation = branchOrientationAtDepth(rootOrientation, depth)
  let changed = orientation === 'HORIZONTAL' ? capSidebarWidthsInBranch(node) : false
  for (const child of node.data) {
    changed = capRestoredSidebarWidths(child, rootOrientation, depth + 1) || changed
  }
  return changed
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

  const needsPanelSanitization = layoutNeedsSanitization(saved, validPanelIds)
  if (!needsPanelSanitization) {
    const normalized = cloneLayout(saved)
    const rootOrientation = ((normalized.grid.orientation as GridOrientation | undefined) ?? 'HORIZONTAL')
    return capRestoredSidebarWidths(normalized.grid.root as GridNode, rootOrientation) ? normalized : saved
  }

  const sanitized = cloneLayout(saved)
  const root = stripInvalidPanelsFromTree(sanitized.grid.root as GridNode, validPanelIds)
  if (!root) return null

  sanitized.grid.root = root
  const rootOrientation = ((sanitized.grid.orientation as GridOrientation | undefined) ?? 'HORIZONTAL')
  capRestoredSidebarWidths(sanitized.grid.root as GridNode, rootOrientation)

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
