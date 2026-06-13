import type { DockviewApi } from 'dockview'
import { getSidebarWidths } from './dock-layout-helpers'
import type { DockLayoutCtx } from './dock-layout-context'

/**
 * After a layout load/build, sync panel bookkeeping and bump the version
 * counters. Optional modules (Loop/Verdicts/Watch) are no longer gated
 * here — they persist in the saved layout and are opened on demand from the
 * tab-strip launcher.
 */
export function reconcileLayoutAfterLoad(api: DockviewApi, ctx: DockLayoutCtx): void {
  ctx.syncPanels(api)
  ctx.sidebarWidthsRef.current = getSidebarWidths(api)
  ctx.bumpVersion()
  ctx.bumpReloadVersion()
}
