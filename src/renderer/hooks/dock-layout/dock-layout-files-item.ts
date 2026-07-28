import type { DockviewApi } from 'dockview'
import { PANEL_TITLES } from './dock-layout-helpers'

/** The panels that make up the one files item, in tab order. Split editor panes
 *  (`editor:N`) are deliberately absent: a split is a second pane the user
 *  asked for, not a stray tab of the item. */
export const FILES_ITEM_PANEL_IDS = ['fileTree', 'modifiedFiles', 'editor'] as const

/**
 * Give an open files item its code-viewer tab back. The editor used to appear
 * only once a file was opened, so the item's tabs changed under the user and
 * there was no way to reach the viewer's empty state; it is now a standing tab
 * that shows "No file selected" until a file is chosen. Layouts saved before
 * that get the tab on load. Does nothing when the item is closed — this adds a
 * tab to the item, it does not reopen the item.
 */
export function ensureEditorTab(api: DockviewApi): boolean {
  if (api.getPanel('editor')) return false
  const host = api.getPanel('fileTree') ?? api.getPanel('modifiedFiles')
  if (!host) return false

  api.addPanel({
    id: 'editor',
    component: 'editor',
    title: PANEL_TITLES.editor,
    position: { referencePanel: host, direction: 'within' },
    inactive: true,
  })
  return true
}

/**
 * Pull every open files-item panel into one group. The three views are a single
 * item, but each is its own dockview panel, so any layout saved while they sat
 * in separate groups restores them as separate cards — and a saved layout is
 * the one placement no reopen rule can police. Running this after a layout
 * loads heals the snapshot instead of letting the split persist.
 *
 * The first open panel's group hosts the rest, so the item keeps the slot its
 * leading view already occupied. Returns whether anything moved.
 */
export function coalesceFilesItem(api: DockviewApi): boolean {
  const panels = FILES_ITEM_PANEL_IDS
    .map((id) => api.getPanel(id))
    .filter((panel): panel is NonNullable<typeof panel> => panel != null)
  if (panels.length < 2) return false

  const host = panels[0].group
  let moved = false
  for (const panel of panels.slice(1)) {
    if (panel.group === host) continue
    // skipSetActive: coalescing is repair work, not a user action — it must not
    // steal the active tab from whatever the restored layout had focused.
    panel.api.moveTo({ group: host, skipSetActive: true })
    moved = true
  }
  return moved
}
