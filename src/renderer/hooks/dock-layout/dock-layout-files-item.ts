import type { DockviewApi } from 'dockview'

/** The panels that make up the one files item, in tab order. Split editor panes
 *  (`editor:N`) are deliberately absent: a split is a second pane the user
 *  asked for, not a stray tab of the item. */
export const FILES_ITEM_PANEL_IDS = ['fileTree', 'modifiedFiles', 'editor'] as const

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
