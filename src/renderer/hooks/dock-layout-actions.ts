import { useCallback } from 'react'
import type { DockviewApi } from 'dockview'
import {
  hidePanel,
  showPanelFromHints,
  showPanelFromSnapshot,
  getSidebarWidths,
  restoreSidebarWidths,
  isEditorPanelId,
  type DockPanelId,
} from './dock-layout-helpers'
import type { DockLayoutCtx } from './dock-layout-context'

export interface DockActionHandlers {
  togglePanel: (id: DockPanelId) => void
  closePanel: (id: string) => void
  isPanelVisible: (id: DockPanelId) => boolean
  resetLayout: () => void
}

/** Generic panel show/hide/toggle/reset actions extracted from useDockLayout. */
export function useDockActions(
  ctx: DockLayoutCtx,
  ensureEditorPanel: (preferredPanelId?: string | null) => string,
  buildDefaultLayout: (api: DockviewApi) => void,
): DockActionHandlers {
  const { saveLayout, syncPanels, bumpVersion, refs, closedPanelSnapshots } = ctx

  const closePanel = useCallback((id: string): void => {
    const api = ctx.apiRef.current
    if (!api) return

    if (isEditorPanelId(id)) {
      const panel = api.getPanel(id)
      if (!panel) return
      const widths = getSidebarWidths(api)
      api.removePanel(panel)
      ctx.editorPanelIdsRef.current.delete(id)
      restoreSidebarWidths(api, widths, refs)
      ctx.lastLayoutRef.current = api.toJSON()
      saveLayout()
      bumpVersion()
      return
    }

    const fixedPanelId = id as DockPanelId
    const panel = api.getPanel(fixedPanelId)
    if (!panel) return
    hidePanel(api, fixedPanelId, closedPanelSnapshots, refs)
    saveLayout()
    bumpVersion()
  }, [ctx, bumpVersion, saveLayout, refs, closedPanelSnapshots])

  const togglePanel = useCallback((id: DockPanelId): void => {
    const api = ctx.apiRef.current
    if (!api) return
    if (id === 'backgroundAgent' && !ctx.showIdeasTabRef.current) return
    if (id === 'loop' && !ctx.showLoopTabRef.current) return

    if (id === 'editor') {
      const visibleEditorPanels = Array.from(ctx.editorPanelIdsRef.current)
      if (visibleEditorPanels.length === 0) {
        ensureEditorPanel()
        return
      }

      const widths = getSidebarWidths(api)
      for (const panelId of visibleEditorPanels) {
        const panel = api.getPanel(panelId)
        if (panel) api.removePanel(panel)
      }

      ctx.editorPanelIdsRef.current.clear()
      restoreSidebarWidths(api, widths, refs)
      ctx.lastLayoutRef.current = api.toJSON()
      saveLayout()
      bumpVersion()
      return
    }

    const panel = api.getPanel(id)
    if (panel) {
      hidePanel(api, id, closedPanelSnapshots, refs)
      saveLayout()
      bumpVersion()
      return
    }

    const snapshot = closedPanelSnapshots.current.get(id)
    if (snapshot) {
      showPanelFromSnapshot(api, id, snapshot, closedPanelSnapshots, refs)
      syncPanels(api)
      saveLayout()
      bumpVersion()
      return
    }

    showPanelFromHints(api, id, refs)
    syncPanels(api)
    saveLayout()
    bumpVersion()
  }, [ctx, bumpVersion, ensureEditorPanel, saveLayout, syncPanels, refs, closedPanelSnapshots])

  const isPanelVisible = useCallback((id: DockPanelId): boolean => {
    const api = ctx.apiRef.current
    if (!api) return true
    if (id === 'editor') return ctx.editorPanelIdsRef.current.size > 0
    return api.getPanel(id) !== undefined
  }, [ctx])

  const resetLayout = useCallback(() => {
    const api = ctx.apiRef.current
    if (!api) return
    refs.isRestoringRef.current = true
    try {
      api.clear()
      buildDefaultLayout(api)
    } finally {
      refs.isRestoringRef.current = false
    }
    closedPanelSnapshots.current.clear()
    syncPanels(api)
    ctx.sidebarWidthsRef.current = getSidebarWidths(api)
    ctx.lastLayoutRef.current = api.toJSON()
    bumpVersion()
  }, [ctx, buildDefaultLayout, bumpVersion, syncPanels, refs, closedPanelSnapshots])

  return { togglePanel, closePanel, isPanelVisible, resetLayout }
}
