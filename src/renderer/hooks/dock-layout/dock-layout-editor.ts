import type { DockviewApi } from 'dockview'

/**
 * Ensure the editor panel exists in the workspace. The editor is a document
 * pane, so it splits beside the agent. An already-present editor is left
 * exactly where it is — opening a file must not relocate a pane the user has
 * dragged elsewhere (e.g. tabbed alongside the agent). The caller makes the
 * editor visible via focusPanel, so the file is still shown.
 */
export function ensureEditorPanelInWorkspace(api: DockviewApi): boolean {
  const agentPanel = api.getPanel('agent')
  if (!agentPanel) return false

  if (api.getPanel('editor')) return false

  api.addPanel({
    id: 'editor',
    component: 'editor',
    title: 'Editor',
    inactive: true,
    position: { referencePanel: agentPanel, direction: 'right' },
  })
  return true
}
