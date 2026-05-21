import type { DockviewApi } from 'dockview'

export function ensureEditorPanelInWorkspace(api: DockviewApi): boolean {
  const agentPanel = api.getPanel('agent')
  if (!agentPanel) return false

  const editorPanel = api.getPanel('editor')
  if (!editorPanel) {
    api.addPanel({
      id: 'editor',
      component: 'editor',
      title: 'Editor',
      inactive: true,
      position: { referencePanel: agentPanel, direction: 'right' },
    })
    return true
  }

  if (editorPanel.group !== agentPanel.group) {
    return false
  }

  editorPanel.api.moveTo({
    group: agentPanel.group,
    position: 'right',
    skipSetActive: true,
  })
  return true
}
