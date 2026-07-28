import type { DockviewApi } from 'dockview'
import {
  PANEL_TITLES,
  isEditorPanelId,
  parseEditorPanelOrder,
} from './dock-layout-helpers'

export function applyDefaultLayout(api: DockviewApi): void {
  // Two sidebars around the agent: Repositories on the left, and on the right
  // the ONE files item whose icon tabs switch between Files, Modified Files and
  // the editor. Repositories stays a separate card — it is not a tab of that
  // item.
  const projectsPanel = api.addPanel({
    id: 'projects',
    component: 'projects',
    title: PANEL_TITLES.projects,
  })

  const agentPanel = api.addPanel({
    id: 'agent',
    component: 'agent',
    title: PANEL_TITLES.agent,
    position: { referencePanel: projectsPanel, direction: 'right' },
  })

  const filesPanel = api.addPanel({
    id: 'fileTree',
    component: 'fileTree',
    title: PANEL_TITLES.fileTree,
    position: { referencePanel: agentPanel, direction: 'right' },
  })

  api.addPanel({
    id: 'modifiedFiles',
    component: 'modifiedFiles',
    title: PANEL_TITLES.modifiedFiles,
    position: { referencePanel: filesPanel, direction: 'within' },
  })

  // The code viewer is a standing tab of the item, not one that materializes on
  // the first file open: an item whose tabs change under you is harder to aim
  // at than one that always offers the same three. With nothing open it shows
  // its own empty state.
  api.addPanel({
    id: 'editor',
    component: 'editor',
    title: PANEL_TITLES.editor,
    position: { referencePanel: filesPanel, direction: 'within' },
  })

  filesPanel.api.setActive()
  projectsPanel.api.setActive()

  // setSize calls interfere with each other (dockview redistributes freed
  // space proportionally to all siblings). Instead, patch the serialized
  // grid to enforce an exact 1:4:1 ratio, then reload.
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
    if (children && children.length === 3) {
      const total = children.reduce((s, c) => s + c.size, 0)
      const sidebar = Math.round(total / 6)
      children[0].size = sidebar                        // repositories
      children[2].size = sidebar                        // the files item
      children[1].size = total - sidebar * 2            // agent
      api.fromJSON(json)
    }
  } catch (err) {
    console.warn('[applyDefaultLayout] grid ratio patching failed:', err)
  }
}

export function applyMinimalPanels(api: DockviewApi): void {
  const projectsPanel = api.addPanel({
    id: 'projects',
    component: 'projects',
    title: PANEL_TITLES.projects,
  })

  api.addPanel({
    id: 'agent',
    component: 'agent',
    title: PANEL_TITLES.agent,
    position: { referencePanel: projectsPanel, direction: 'right' },
  })

  try {
    const sidebarWidth = Math.round(api.width / 6)
    projectsPanel.group?.api.setSize({ width: sidebarWidth })
  } catch (err) {
    console.warn('[applyMinimalPanels] sidebar sizing failed:', err)
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
