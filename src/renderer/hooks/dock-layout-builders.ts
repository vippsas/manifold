import type { DockviewApi } from 'dockview'
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

  try {
    const sidebarWidth = Math.round(api.width / 6)
    // Set the right panel first so it doesn't absorb leftover space,
    // then set the left panel to the same width.
    filesPanel.group?.api.setSize({ width: sidebarWidth })
    projectsPanel.group?.api.setSize({ width: sidebarWidth })
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
