import type { DockviewApi } from 'dockview'

/**
 * Ensure the editor panel exists in the workspace. Files and the editor are
 * intertwined, so when the files panel is open the editor tabs into its group
 * (the caller widens the shared group to an editable width); otherwise it
 * splits beside the agent panel. An already-present editor is left exactly
 * where it is — opening a file must not relocate a pane the user has dragged
 * elsewhere (e.g. tabbed alongside the agent). The caller makes the editor
 * visible via focusPanel, so the file is still shown.
 */
export function ensureEditorPanelInWorkspace(api: DockviewApi): boolean {
  const agentPanel = api.getPanel('agent')
  if (!agentPanel) return false

  if (api.getPanel('editor')) return false

  const fileTreePanel = api.getPanel('fileTree')
  api.addPanel({
    id: 'editor',
    component: 'editor',
    title: 'Editor',
    inactive: true,
    position: fileTreePanel
      ? { referencePanel: fileTreePanel, direction: 'within' }
      : { referencePanel: agentPanel, direction: 'right' },
  })
  return true
}
