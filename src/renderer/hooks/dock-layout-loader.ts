import type { DockviewApi, SerializedDockview } from 'dockview'
import { sanitizeDockLayout } from './dock-layout-sanitize'
import {
  PANEL_IDS,
  PANEL_RESTORE_HINTS,
  PANEL_TITLES,
  SIDEBAR_PANEL_IDS,
  applyLayoutChangePreservingSidebarWidths,
  getSidebarWidths,
  removeLeafFromTree,
  restoreSidebarWidths,
  treeContainsPanel,
  type Direction,
  type DockPanelId,
  type GridNode,
  type LayoutRefs,
} from './dock-layout-helpers'

/**
 * Walk the grid tree and set the leaf containing `panelId` to `fraction`
 * of its parent branch total, scaling siblings to fill the remainder.
 * Returns true if the node was found and patched.
 */
function applyHeightInTree(node: GridNode, panelId: string, fraction: number): boolean {
  if (node.type !== 'branch') return false

  const idx = node.data.findIndex((c) =>
    c.type === 'leaf' && c.data.views.includes(panelId))

  if (idx >= 0) {
    const total = node.data.reduce((s, c) => s + c.size, 0)
    const panelSize = Math.round(total * fraction)
    const remaining = total - panelSize
    const otherTotal = node.data.reduce((s, c, i) => s + (i === idx ? 0 : c.size), 0)
    const scale = otherTotal > 0 ? remaining / otherTotal : 1
    for (let i = 0; i < node.data.length; i++) {
      node.data[i].size = i === idx ? panelSize : Math.round(node.data[i].size * scale)
    }
    return true
  }

  return node.data.some((child) => applyHeightInTree(child, panelId, fraction))
}

/** Patch the serialised grid so `panelId` occupies `fraction` of its parent branch. */
function applyPanelHeightFraction(api: DockviewApi, panelId: string, fraction: number, refs?: LayoutRefs): void {
  try {
    const json = api.toJSON()
    if (!applyHeightInTree(json.grid.root as GridNode, panelId, fraction)) return
    if (refs) refs.isRestoringRef.current = true
    try { api.fromJSON(json) } finally { if (refs) refs.isRestoringRef.current = false }
    if (refs) refs.lastLayoutRef.current = api.toJSON()
  } catch (err) {
    console.warn(`[applyPanelHeightFraction] failed for '${panelId}':`, err)
  }
}

function isCorruptedMinimalLayout(saved: SerializedDockview): boolean {
  const panelIds = new Set(Object.keys(saved.panels))
  return panelIds.size === 2 && panelIds.has('projects') && panelIds.has('agent')
}

export async function loadOrBuildLayout(
  api: DockviewApi,
  sessionId: string,
  buildDefault: (api: DockviewApi) => void,
  refs: LayoutRefs,
  liveSiblingSessionIds?: Set<string>,
): Promise<void> {
  try {
    const rawSaved = (await window.electronAPI.invoke('dock-layout:get', sessionId)) as SerializedDockview | null
    const saved = rawSaved ? sanitizeDockLayout(rawSaved, liveSiblingSessionIds) : null
    if (saved && saved.grid && saved.panels && !isCorruptedMinimalLayout(saved)) {
      refs.isRestoringRef.current = true
      try {
        api.fromJSON(saved)
      } finally {
        refs.isRestoringRef.current = false
      }
      refs.lastLayoutRef.current = saved
      if (saved !== rawSaved) {
        void window.electronAPI.invoke('dock-layout:set', sessionId, saved).catch(() => {})
      }
      return
    }
  } catch (err) {
    console.warn('[loadOrBuildLayout] failed to restore saved layout for session', sessionId, '- falling back to default:', err)
  }
  refs.isRestoringRef.current = true
  try {
    api.clear()
    buildDefault(api)
  } finally {
    refs.isRestoringRef.current = false
  }
  refs.lastLayoutRef.current = api.toJSON()
  void window.electronAPI.invoke('dock-layout:set', sessionId, refs.lastLayoutRef.current).catch(() => {})
}

export function applyMinimalLayout(
  api: DockviewApi,
  buildMinimal: (api: DockviewApi) => void,
  refs: LayoutRefs,
): void {
  refs.isRestoringRef.current = true
  try {
    api.clear()
    buildMinimal(api)
  } finally {
    refs.isRestoringRef.current = false
  }
  refs.lastLayoutRef.current = api.toJSON()
}

export function hidePanel(
  api: DockviewApi,
  id: DockPanelId,
  closedPanelSnapshots: React.MutableRefObject<Map<DockPanelId, SerializedDockview>>,
  refs: LayoutRefs,
): void {
  const preRemovalLayout = api.toJSON()
  closedPanelSnapshots.current.set(id, preRemovalLayout)

  const json = JSON.parse(JSON.stringify(preRemovalLayout)) as SerializedDockview
  const root = json.grid.root as GridNode
  if (root.type === 'branch') {
    const freed = removeLeafFromTree(root, id)
    if (freed > 0 && root.data.length > 0) {
      const isSidebarNode = (c: GridNode) => {
        const views = c.type === 'leaf' ? c.data.views : []
        return views.some((v) => SIDEBAR_PANEL_IDS.has(v)) ||
          (c.type === 'branch' && Array.from(SIDEBAR_PANEL_IDS).some((sid) => treeContainsPanel(c, sid)))
      }
      const targets = root.data.filter((c) => !isSidebarNode(c))
      if (targets.length > 0) {
        const share = freed / targets.length
        for (const t of targets) t.size = Math.round(t.size + share)
      } else {
        const total = root.data.reduce((s, c) => s + c.size, 0)
        const scale = (total + freed) / total
        for (const c of root.data) c.size = Math.round(c.size * scale)
      }
    }
  }
  delete (json.panels as Record<string, unknown>)[id]

  refs.isRestoringRef.current = true
  try {
    api.fromJSON(json)
  } catch (err) {
    console.warn(`[hidePanel] failed to apply layout after hiding '${id}':`, err)
  } finally {
    refs.isRestoringRef.current = false
  }
  refs.lastLayoutRef.current = api.toJSON()
}

export function showPanelFromSnapshot(
  api: DockviewApi,
  id: DockPanelId,
  snapshot: SerializedDockview,
  closedPanelSnapshots: React.MutableRefObject<Map<DockPanelId, SerializedDockview>>,
  refs: LayoutRefs,
): void {
  const currentlyVisible = new Set(
    PANEL_IDS.filter((pid) => api.getPanel(pid) !== undefined)
  )
  const widths = getSidebarWidths(api)

  refs.isRestoringRef.current = true
  try {
    api.fromJSON(snapshot)
    for (const pid of PANEL_IDS) {
      if (pid !== id && !currentlyVisible.has(pid)) {
        const p = api.getPanel(pid)
        if (p) api.removePanel(p)
      }
    }
  } finally {
    refs.isRestoringRef.current = false
  }

  restoreSidebarWidths(api, widths, refs)
  refs.lastLayoutRef.current = api.toJSON()
  closedPanelSnapshots.current.delete(id)
}

export function showPanelFromHints(api: DockviewApi, id: DockPanelId, refs?: LayoutRefs): void {
  const hints = PANEL_RESTORE_HINTS[id]
  let position: { referencePanel: ReturnType<DockviewApi['getPanel']>; direction: Direction } | undefined
  let usedDirection: Direction | undefined
  for (const hint of hints) {
    const ref = api.getPanel(hint.ref)
    if (ref) {
      position = { referencePanel: ref, direction: hint.dir }
      usedDirection = hint.dir
      break
    }
  }
  applyLayoutChangePreservingSidebarWidths(api, () => {
    api.addPanel({
      id,
      component: id,
      title: PANEL_TITLES[id],
      ...(position ? { position } : {}),
    })
    if (usedDirection === 'below') {
      applyPanelHeightFraction(api, id, 1 / 3, refs)
    }
  }, refs)
}
