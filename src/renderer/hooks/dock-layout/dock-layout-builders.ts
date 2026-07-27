import type { DockviewApi } from 'dockview'
import {
  PANEL_TITLES,
  isEditorPanelId,
  parseEditorPanelOrder,
} from './dock-layout-helpers'

export function applyDefaultLayout(api: DockviewApi): void {
  // Every tool panel shares ONE sidebar item, switched by its icon tabs — the
  // dock is a single sidebar column plus the agent, not a column per tool.
  const projectsPanel = api.addPanel({
    id: 'projects',
    component: 'projects',
    title: PANEL_TITLES.projects,
  })

  const filesPanel = api.addPanel({
    id: 'fileTree',
    component: 'fileTree',
    title: PANEL_TITLES.fileTree,
    position: { referencePanel: projectsPanel, direction: 'within' },
  })

  api.addPanel({
    id: 'modifiedFiles',
    component: 'modifiedFiles',
    title: PANEL_TITLES.modifiedFiles,
    position: { referencePanel: filesPanel, direction: 'within' },
  })

  api.addPanel({
    id: 'agent',
    component: 'agent',
    title: PANEL_TITLES.agent,
    position: { referencePanel: projectsPanel, direction: 'right' },
  })

  projectsPanel.api.setActive()

  // setSize calls interfere with each other (dockview redistributes freed
  // space proportionally to all siblings). Instead, patch the serialized
  // grid to enforce an exact 1:5 ratio, then reload.
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
      children[0].size = Math.round(total / 6)          // the sidebar item
      children[1].size = total - children[0].size       // agent
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
