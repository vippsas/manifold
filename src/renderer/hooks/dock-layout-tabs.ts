import { useEffect, type MutableRefObject } from 'react'
import type { DockviewApi, SerializedDockview } from 'dockview'
import {
  hidePanel,
  showPanelFromHints,
  showPanelFromSnapshot,
  getSidebarWidths,
  type DockPanelId,
  type LayoutRefs,
} from './dock-layout-helpers'
import { ensureSearchPanelInWorkspace } from './dock-layout-search'
import type { DockLayoutCtx } from './dock-layout-context'

/**
 * Show or hide one of the toggleable workspace tabs (ideas/loop/verdicts/watch),
 * returning true when the panel's visibility actually changed. Restores from a
 * snapshot when one exists, otherwise places the panel from layout hints.
 */
export function applyTabSetting(
  api: DockviewApi,
  panelId: DockPanelId,
  enabled: boolean,
  showOnEnable: boolean,
  closedPanelSnapshots: MutableRefObject<Map<DockPanelId, SerializedDockview>>,
  refs: LayoutRefs,
): boolean {
  const panel = api.getPanel(panelId)
  if (!enabled) {
    if (!panel) return false
    hidePanel(api, panelId, closedPanelSnapshots, refs)
    return true
  }

  if (!showOnEnable || panel) return false

  const snapshot = closedPanelSnapshots.current.get(panelId)
  if (snapshot) {
    showPanelFromSnapshot(api, panelId, snapshot, closedPanelSnapshots, refs)
  } else {
    showPanelFromHints(api, panelId, refs)
  }
  return true
}

/**
 * After a layout load/build, reconcile the toggleable tabs against the current
 * settings, ensure the search panel is present, and bump the version counters.
 */
export function reconcileLayoutAfterLoad(api: DockviewApi, ctx: DockLayoutCtx): void {
  const ideasChanged = applyTabSetting(api, 'backgroundAgent', ctx.showIdeasTabRef.current, false, ctx.closedPanelSnapshots, ctx.refs)
  const loopChanged = applyTabSetting(api, 'loop', ctx.showLoopTabRef.current, false, ctx.closedPanelSnapshots, ctx.refs)
  const verdictsChanged = applyTabSetting(api, 'verdicts', ctx.showVerdictsTabRef.current, false, ctx.closedPanelSnapshots, ctx.refs)
  const watchChanged = applyTabSetting(api, 'watch', ctx.showWatchTabRef.current, false, ctx.closedPanelSnapshots, ctx.refs)
  ctx.syncPanels(api)
  ctx.sidebarWidthsRef.current = getSidebarWidths(api)
  if (ensureSearchPanelInWorkspace(api, ctx.editorPanelIdsRef.current)) {
    ctx.lastLayoutRef.current = api.toJSON()
    ctx.saveLayout()
  }
  if (ideasChanged || loopChanged || verdictsChanged || watchChanged) ctx.saveLayout()
  ctx.bumpVersion()
  ctx.bumpReloadVersion()
}

/**
 * Effect that reacts to a single tab-visibility setting flipping. Mirrors the
 * previous inline effects in useDockLayout, one instance per toggleable tab.
 */
export function useTabVisibilityEffect(
  enabled: boolean,
  panelId: DockPanelId,
  prevRef: MutableRefObject<boolean>,
  ctx: DockLayoutCtx,
): void {
  useEffect(() => {
    const previous = prevRef.current
    prevRef.current = enabled
    if (previous === enabled) return

    const api = ctx.apiRef.current
    if (!api || !ctx.sessionIdRef.current) return

    const visibilityChanged = applyTabSetting(api, panelId, enabled, enabled, ctx.closedPanelSnapshots, ctx.refs)
    if (!visibilityChanged) {
      ctx.bumpVersion()
      return
    }

    ctx.syncPanels(api)
    ctx.lastLayoutRef.current = api.toJSON()
    ctx.saveLayout()
    ctx.bumpVersion()
  }, [enabled, panelId, prevRef, ctx])
}
