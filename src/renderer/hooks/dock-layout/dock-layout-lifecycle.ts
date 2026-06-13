import type { DockviewApi } from 'dockview'
import {
  PANEL_IDS,
  getGridSignature,
  getSidebarWidths,
  restoreSidebarWidths,
  isEditorPanelId,
  type DockPanelId,
} from './dock-layout-helpers'
import type { DockLayoutCtx } from './dock-layout-context'

/**
 * Register the dockview panel-removal and layout-change listeners that keep
 * useDockLayout's bookkeeping (editor panel ids, closed-panel snapshots,
 * pinned sidebar widths) in sync. Extracted verbatim from onReady.
 */
export function registerLayoutListeners(api: DockviewApi, ctx: DockLayoutCtx): void {
  api.onDidRemovePanel((panel) => {
    if (ctx.refs.isRestoringRef.current) return

    if (isEditorPanelId(panel.id)) {
      ctx.editorPanelIdsRef.current.delete(panel.id)
      ctx.bumpVersion()
      return
    }

    const id = panel.id as DockPanelId
    if (PANEL_IDS.includes(id) && ctx.lastLayoutRef.current) {
      ctx.closedPanelSnapshots.current.set(id, ctx.lastLayoutRef.current)
    }
  })

  api.onDidLayoutChange(() => {
    if (ctx.refs.isRestoringRef.current) return

    // While a group is maximized (double-click focus mode), every other group —
    // including both sidebars — is hidden, so their offsetWidth reads 0. Skip
    // the sidebar-width bookkeeping and layout save until maximize is exited, so
    // the captured widths and persisted layout stay at their pre-maximize values
    // and restore exactly on exit.
    if (api.hasMaximizedGroup()) return

    const previousJson = ctx.lastLayoutRef.current
    const currentJson = api.toJSON()

    // Detect structural changes (panel moves/adds/removes) vs simple
    // divider resizes by comparing the grid's panel arrangement.
    const structureChanged = previousJson &&
      getGridSignature(previousJson) !== getGridSignature(currentJson)

    if (structureChanged && (ctx.sidebarWidthsRef.current.left > 0 || ctx.sidebarWidthsRef.current.right > 0)) {
      // Structural change — restore pinned sidebar widths so only the
      // center (agent) pane absorbs the size difference.
      restoreSidebarWidths(api, ctx.sidebarWidthsRef.current, ctx.refs)
    } else {
      // Pure resize (user dragging a divider) — update pinned widths.
      ctx.sidebarWidthsRef.current = getSidebarWidths(api)
      ctx.lastLayoutRef.current = currentJson
    }

    ctx.syncPanels(api)
    ctx.saveLayout()
    ctx.bumpVersion()
  })
}
