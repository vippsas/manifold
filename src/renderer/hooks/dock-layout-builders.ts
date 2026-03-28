import type { DockviewApi, SerializedDockview } from 'dockview'
import {
  PANEL_TITLES,
  DEFAULT_SIDEBAR_WIDTH,
  isEditorPanelId,
  parseEditorPanelOrder,
} from './dock-layout-helpers'

export function applyDefaultLayout(api: DockviewApi): void {
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

  api.addPanel({
    id: 'search',
    component: 'search',
    title: PANEL_TITLES.search,
    inactive: true,
    position: { referencePanel: 'agent', direction: 'within' },
  })

  const filesPanel = api.addPanel({
    id: 'fileTree',
    component: 'fileTree',
    title: PANEL_TITLES.fileTree,
    position: { referencePanel: 'agent', direction: 'right' },
  })

  api.addPanel({
    id: 'modifiedFiles',
    component: 'modifiedFiles',
    title: PANEL_TITLES.modifiedFiles,
    position: { referencePanel: filesPanel, direction: 'within' },
  })

  filesPanel.api.setActive()

  // setSize calls interfere with each other (dockview redistributes freed
  // space proportionally to all siblings). Instead, patch the serialized
  // grid to enforce an exact 1:4:1 ratio, then reload.
  try {
    const json = api.toJSON() as SerializedDockview & { grid: { root: { data?: { size: number }[] } } }
    const children = json.grid.root.data
    if (children && children.length === 3) {
      const total = children.reduce((s, c) => s + c.size, 0)
      children[0].size = Math.round(total / 6)     // projects
      children[2].size = Math.round(total / 6)     // files
      children[1].size = total - children[0].size - children[2].size // agent
      api.fromJSON(json as SerializedDockview)
    }
  } catch {
    // sizing is best-effort
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
    projectsPanel.group?.api.setSize({ width: DEFAULT_SIDEBAR_WIDTH })
  } catch {
    // sizing is best-effort
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
