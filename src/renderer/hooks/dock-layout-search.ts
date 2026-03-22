import type { DockviewApi, IDockviewPanel } from 'dockview'

export function ensureSearchPanelInWorkspace(
  api: DockviewApi,
  editorPanelIds: Iterable<string>,
): boolean {
  const referencePanel = getWorkspaceSearchReferencePanel(api, editorPanelIds)
  if (!referencePanel) return false

  const searchPanel = api.getPanel('search')
  if (!searchPanel) {
    api.addPanel({
      id: 'search',
      component: 'search',
      title: 'Search',
      inactive: true,
      position: { referencePanel, direction: 'within' },
    })
    return true
  }

  if (searchPanel.group === referencePanel.group) {
    return false
  }

  searchPanel.api.moveTo({
    group: referencePanel.group,
    position: 'center',
    skipSetActive: true,
  })
  return true
}

function getWorkspaceSearchReferencePanel(
  api: DockviewApi,
  editorPanelIds: Iterable<string>,
): IDockviewPanel | undefined {
  const agentPanel = api.getPanel('agent')
  if (agentPanel) return agentPanel

  for (const panelId of editorPanelIds) {
    const panel = api.getPanel(panelId)
    if (panel) return panel
  }

  return api.getPanel('editor')
}
