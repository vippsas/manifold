import type { DockviewApi } from 'dockview'
import { getSidebarWidths } from './dock-layout-helpers'
import { ensureSearchPanelInWorkspace } from './dock-layout-search'
import type { DockLayoutCtx } from './dock-layout-context'

/**
 * After a layout load/build, ensure the search panel is present and bump the
 * version counters. Optional modules (Ideas/Loop/Verdicts/Watch) are no longer
 * gated here — they persist in the saved layout and are opened on demand from
 * the tab-strip launcher.
 */
export function reconcileLayoutAfterLoad(api: DockviewApi, ctx: DockLayoutCtx): void {
  ctx.syncPanels(api)
  ctx.sidebarWidthsRef.current = getSidebarWidths(api)
  if (ensureSearchPanelInWorkspace(api, ctx.editorPanelIdsRef.current)) {
    ctx.lastLayoutRef.current = api.toJSON()
    ctx.saveLayout()
  }
  ctx.bumpVersion()
  ctx.bumpReloadVersion()
}
