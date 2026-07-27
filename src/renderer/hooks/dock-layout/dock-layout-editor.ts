import type { DockviewApi } from 'dockview'

/** Tool panels that make up the one sidebar item, in the order the editor
 *  prefers to tab into them. */
const SIDEBAR_ITEM_PANEL_IDS = ['fileTree', 'modifiedFiles', 'projects'] as const

/**
 * Ensure the editor panel exists in the workspace. The editor joins the one
 * sidebar item as a tab whenever that item is open (the caller widens the
 * shared group to an editable width); with no sidebar left it splits beside the
 * agent panel. An already-present editor is left exactly where it is — opening
 * a file must not relocate a pane the user has dragged elsewhere (e.g. tabbed
 * alongside the agent). The caller makes the editor visible via focusPanel, so
 * the file is still shown.
 */
export function ensureEditorPanelInWorkspace(api: DockviewApi): boolean {
  const agentPanel = api.getPanel('agent')
  if (!agentPanel) return false

  if (api.getPanel('editor')) return false

  const sidebarPanel = SIDEBAR_ITEM_PANEL_IDS.map((id) => api.getPanel(id)).find((panel) => panel != null)
  api.addPanel({
    id: 'editor',
    component: 'editor',
    title: 'Editor',
    inactive: true,
    position: sidebarPanel
      ? { referencePanel: sidebarPanel, direction: 'within' }
      : { referencePanel: agentPanel, direction: 'right' },
  })
  return true
}
