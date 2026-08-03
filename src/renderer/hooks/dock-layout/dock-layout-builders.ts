import type { DockviewApi } from 'dockview'
import {
  PANEL_TITLES,
  isEditorPanelId,
  parseEditorPanelOrder,
} from './dock-layout-helpers'

/**
 * The default layout: the one sidebar column beside the agent. The editor and
 * the shell are opened on demand, so this is also the layout a window with no
 * agent yet starts from — there is no separate empty state to grow out of.
 */
export function applyDefaultLayout(api: DockviewApi): void {
  const sidebarPanel = api.addPanel({
    id: 'sidebar',
    component: 'sidebar',
    title: PANEL_TITLES.sidebar,
  })

  api.addPanel({
    id: 'agent',
    component: 'agent',
    title: PANEL_TITLES.agent,
    position: { referencePanel: sidebarPanel, direction: 'right' },
  })

  sidebarPanel.api.setActive()

  // A plain setSize on the sidebar group is not enough: dockview redistributes
  // freed space proportionally across siblings, and on an unmeasured dock
  // (api.width 0 — the loader builds after an async IPC await) there is nothing
  // to take a fraction of. Patch the serialized grid to an exact 1:5 ratio and
  // reload instead.
  try {
    type SerializedNode = { type: string; size: number; data?: SerializedNode[] }
    const json = api.toJSON()
    const grid = json.grid as unknown as { orientation: 'HORIZONTAL' | 'VERTICAL'; root: SerializedNode }
    // The grid orientation is sticky: api.clear() keeps whatever fromJSON last
    // set, so after showing a layout with a bottom pane (VERTICAL root) the
    // columns nest inside a single wrapper branch and the ratio patch below
    // would miss them, leaving equal halves (#803). Promote the wrapper to the
    // root — flipping the serialized orientation to match — so the patch sees
    // the columns and fromJSON rebuilds on a HORIZONTAL root.
    let root = grid.root
    while (root.data?.length === 1 && root.data[0].type === 'branch') {
      root = root.data[0]
      grid.orientation = grid.orientation === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL'
    }
    grid.root = root
    const children = root.data
    if (children && children.length === 2) {
      const total = children.reduce((s, c) => s + c.size, 0)
      const sidebar = Math.round(total / 6)
      children[0].size = sidebar
      children[1].size = total - sidebar
      api.fromJSON(json)
    }
  } catch (err) {
    console.warn('[applyDefaultLayout] grid ratio patching failed:', err)
  }
}

export function syncEditorPanelIds(
  api: DockviewApi,
  editorPanelIdsRef: React.MutableRefObject<Set<string>>,
  nextEditorPanelIndexRef: React.MutableRefObject<number>,
): void {
  const panelIds = Object.keys(api.toJSON().panels ?? {}).filter(isEditorPanelId)
  editorPanelIdsRef.current = new Set(panelIds)

  let maxOrder = 0
  for (const panelId of panelIds) {
    maxOrder = Math.max(maxOrder, parseEditorPanelOrder(panelId))
  }
  nextEditorPanelIndexRef.current = Math.max(maxOrder + 1, 1)
}
