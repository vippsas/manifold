import { useCallback } from 'react'
import type { DockviewApi } from 'dockview'
import {
  hidePanel,
  showPanelFromHints,
  showPanelFromSnapshot,
  getSidebarWidth,
  withPinnedSidebars,
  isEditorPanelId,
  toggleMaximizedGroup,
  type DockPanelId,
} from './dock-layout-helpers'
import type { DockLayoutCtx } from './dock-layout-context'

export interface DockActionHandlers {
  togglePanel: (id: DockPanelId) => void
  closePanel: (id: string) => void
  toggleMaximizePanel: (id: string) => void
  isPanelVisible: (id: string) => boolean
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
      // Pin the sidebar while the editor pane is removed so its freed space
      // lands on the center pane, not on the sidebar (which dockview would
      // otherwise widen proportionally).
      withPinnedSidebars(api, () => api.removePanel(panel))
      ctx.editorPanelIdsRef.current.delete(id)
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
    if (id === 'editor') {
      const visibleEditorPanels = Array.from(ctx.editorPanelIdsRef.current)
      if (visibleEditorPanels.length === 0) {
        ensureEditorPanel()
        return
      }

      // Pin the sidebar while the editor panes are removed so their freed
      // space lands on the center pane, not on the sidebar (which dockview
      // would otherwise widen proportionally).
      withPinnedSidebars(api, () => {
        for (const panelId of visibleEditorPanels) {
          const panel = api.getPanel(panelId)
          if (panel) api.removePanel(panel)
        }
      })

      ctx.editorPanelIdsRef.current.clear()
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

  // Double-click a tab to toggle focus mode: maximize that pane's group to fill
  // the dock (hiding all other panes and the sidebar), or restore everything
  // if a group is already maximized. The onDidLayoutChange listener skips its
  // sidebar bookkeeping while maximized (hidden sidebars report width 0), so no
  // save/bump is needed here — exiting fires the listener, which persists the
  // restored layout.
  const toggleMaximizePanel = useCallback((id: string): void => {
    const api = ctx.apiRef.current
    if (!api) return
    toggleMaximizedGroup(api, id)
  }, [ctx])

  const isPanelVisible = useCallback((id: string): boolean => {
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
    ctx.sidebarWidthRef.current = getSidebarWidth(api)
    ctx.lastLayoutRef.current = api.toJSON()
    bumpVersion()
  }, [ctx, buildDefaultLayout, bumpVersion, syncPanels, refs, closedPanelSnapshots])

  return { togglePanel, closePanel, toggleMaximizePanel, isPanelVisible, resetLayout }
}
