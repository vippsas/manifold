import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DockviewApi, SerializedDockview } from 'dockview'
import {
  PANEL_IDS,
  applyLayoutChangePreservingSidebarWidths,
  applyMinimalLayout,
  findTopLeftWorkspaceReferencePanel,
  getSidebarWidths,
  isEditorPanelId,
  loadOrBuildLayout,
  parseEditorPanelOrder,
  type EditorSplitDirection,
  type DockPanelId,
  type LayoutRefs,
} from './dock-layout-helpers'
import { siblingPanelId } from '../agent-siblings'
import type { AgentSession } from '../../../shared/types'
import { applyDefaultLayout, applyMinimalPanels, syncEditorPanelIds } from './dock-layout-builders'
import type { DockLayoutCtx } from './dock-layout-context'
import { reconcileLayoutAfterLoad } from './dock-layout-tabs'
import { useEditorPanels } from './dock-layout-panels'
import { useDockActions } from './dock-layout-actions'
import { registerLayoutListeners } from './dock-layout-lifecycle'
import { LAUNCHER_MODULE_IDS } from '../../modules/launcher-modules'

export type { DockPanelId, EditorSplitDirection } from './dock-layout-helpers'
export { isEditorPanelId } from './dock-layout-helpers'

/** The id of an open editor panel (base 'editor' preferred), or null when no
 *  file is open. Used to place plugin panes in the editor's group. */
function findOpenEditorPanelId(api: DockviewApi): string | null {
  if (api.getPanel('editor')) return 'editor'
  for (const panel of api.panels) {
    if (isEditorPanelId(panel.id)) return panel.id
  }
  return null
}

export interface UseDockLayoutResult {
  apiRef: React.MutableRefObject<DockviewApi | null>
  /** True while a saved layout is being restored (api.fromJSON). Lets consumers
   *  ignore restore-driven panel activations (e.g. useAgentSiblingDockTabs). */
  isRestoringRef: React.MutableRefObject<boolean>
  onReady: (api: DockviewApi) => void
  togglePanel: (id: DockPanelId) => void
  closePanel: (id: string) => void
  /** Toggle focus mode for a pane's group: maximize to fill the dock (hiding all
   *  other panes and both sidebars), or restore everything if already maximized. */
  toggleMaximizePanel: (id: string) => void
  focusPanel: (id: string) => void
  openSiblingPanel: (sessionId: string, title?: string, referencePanelId?: string) => void
  /** Close a sibling tab without killing the underlying agent session. */
  closeSiblingPanel: (sessionId: string) => void
  ensureEditorPanel: (preferredPanelId?: string | null) => string
  splitEditorPane: (referencePanelId: string, direction: EditorSplitDirection) => string | null
  findEditorPanelForSplit: (referencePanelId: string, direction: EditorSplitDirection) => string | null
  isPanelVisible: (id: DockPanelId) => boolean
  resetLayout: () => void
  hiddenPanels: DockPanelId[]
  editorPanelIds: string[]
  layoutVersion: number
  /** Bumps only when the dock layout is fully reloaded (e.g. a session
   * switch). Use this — not layoutVersion — to schedule one-shot work that
   * should fire after a reload, not on every panel activation. */
  layoutReloadVersion: number
  /** Open a plugin-contributed view as a dock panel (or focus it if already open). */
  openPluginView: (viewId: string, title: string) => void
  /** Open a plugin-contributed tree view as a native dock panel (or focus it if already open). */
  openPluginTreeView: (viewId: string, title: string) => void
}

export function useDockLayout(
  sessionId: string | null,
  liveSessions: AgentSession[] = [],
): UseDockLayoutResult {
  const apiRef = useRef<DockviewApi | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionIdRef = useRef(sessionId)
  const liveSessionsRef = useRef(liveSessions)
  const editorPanelIdsRef = useRef<Set<string>>(new Set())
  const nextEditorPanelIndexRef = useRef(1)
  sessionIdRef.current = sessionId
  liveSessionsRef.current = liveSessions

  // Returns `undefined` (defer filtering) when the sessions list hasn't been
  // populated yet, so an empty initial snapshot doesn't strip live sibling
  // tabs from a saved layout. Once sessions are present, return a real Set
  // so genuinely dead siblings are filtered out as orphans.
  // `useAgentSiblingDockTabs` reconciles sibling panels against the current
  // session list after this hook runs, so any orphans that slip through the
  // deferred path get removed before they can render.
  const liveSiblingIds = useCallback((): Set<string> | undefined => {
    if (liveSessionsRef.current.length === 0) return undefined
    return new Set(liveSessionsRef.current.map((s) => s.id))
  }, [])

  const [layoutVersion, setLayoutVersion] = useState(0)
  const bumpVersion = useCallback(() => setLayoutVersion((value) => value + 1), [])
  // Bumps only when loadOrBuildLayout finishes (i.e. layout was replaced by
  // a session switch). Distinct from layoutVersion, which also
  // bumps on every panel activation or drag — that's too noisy for callers
  // that want to re-apply initial focus after a reload.
  const [layoutReloadVersion, setLayoutReloadVersion] = useState(0)
  const bumpReloadVersion = useCallback(() => setLayoutReloadVersion((value) => value + 1), [])

  const lastLayoutRef = useRef<SerializedDockview | null>(null)
  const closedPanelSnapshots = useRef<Map<DockPanelId, SerializedDockview>>(new Map())
  const isRestoringRef = useRef(false)
  const sidebarWidthsRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 })
  const refs: LayoutRefs = { isRestoringRef, lastLayoutRef }

  const syncPanels = useCallback((api: DockviewApi) => {
    syncEditorPanelIds(api, editorPanelIdsRef, nextEditorPanelIndexRef)
  }, [])

  const persistLayout = useCallback((sid: string, layout: SerializedDockview) => {
    void window.electronAPI.invoke('dock-layout:set', sid, layout)
  }, [])

  const saveLayout = useCallback(() => {
    const api = apiRef.current
    const sid = sessionIdRef.current
    if (!api || !sid) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(() => {
      const json = api.toJSON()
      saveTimerRef.current = null
      persistLayout(sid, json)
    }, 500)
  }, [persistLayout])

  const flushPendingLayoutSave = useCallback((sid: string | null): void => {
    if (!saveTimerRef.current) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null

    const api = apiRef.current
    if (!api || !sid) return
    persistLayout(sid, api.toJSON())
  }, [persistLayout])

  const buildDefaultLayout = useCallback((api: DockviewApi) => applyDefaultLayout(api), [])
  const buildMinimalLayout = useCallback((api: DockviewApi) => applyMinimalPanels(api), [])

  const ctx = useMemo<DockLayoutCtx>(() => ({
    apiRef,
    sessionIdRef,
    editorPanelIdsRef,
    nextEditorPanelIndexRef,
    closedPanelSnapshots,
    sidebarWidthsRef,
    lastLayoutRef,
    refs,
    saveLayout,
    syncPanels,
    bumpVersion,
    bumpReloadVersion,
  // refs is rebuilt each render but wraps the same stable ref objects, so it
  // is intentionally omitted from the dependency list.
  }), [saveLayout, syncPanels, bumpVersion, bumpReloadVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  const focusPanel = useCallback((id: string): void => {
    const panel = apiRef.current?.getPanel(id)
    if (panel && !panel.api.isActive) panel.api.setActive()
  }, [])

  const closeSiblingPanel = useCallback((sessionId: string): void => {
    const api = apiRef.current
    if (!api) return
    const panel = api.getPanel(siblingPanelId(sessionId))
    if (panel) api.removePanel(panel)
  }, [])

  const openSiblingPanel = useCallback((sessionId: string, title?: string, _referencePanelId?: string): void => {
    const api = apiRef.current
    if (!api) return
    const panelId = siblingPanelId(sessionId)
    let panel = api.getPanel(panelId)
    if (!panel) {
      const refId = findTopLeftWorkspaceReferencePanel(api) ?? 'agent'
      const referencePanel = api.getPanel(refId)
      if (!referencePanel) return
      // Insert right after the reference panel so a freshly-created sibling
      // lands next to its anchor (e.g. 'agent') instead of at the end of the
      // tab strip. Avoids a visible flicker to the last tab when the panel
      // didn't exist yet at click time.
      const referenceIndex = referencePanel.group.panels.indexOf(referencePanel)
      const insertIndex = referenceIndex >= 0 ? referenceIndex + 1 : undefined
      api.addPanel({
        id: panelId,
        component: 'agent',
        title: title ?? 'Agent',
        position: { referencePanel, direction: 'within', index: insertIndex },
        inactive: false,
      })
      panel = api.getPanel(panelId)
    }
    if (panel && !panel.api.isActive) panel.api.setActive()
  }, [])

  const openPluginView = useCallback((viewId: string, title: string): void => {
    const api = apiRef.current
    if (!api) return
    const existing = api.getPanel(viewId)
    if (existing) { existing.api.setActive(); return }
    // Plugin webview panes open in the editor area — the same spot the editor
    // pane occupies. When a file is open, tab into the editor's group. When no
    // editor is open, take the editor's place to the right of the agent and
    // split that region 50/50, leaving the sidebars at their pinned widths
    // (so they stay 1/6 each and agent/pane get 2/6 each).
    const editorPanelId = findOpenEditorPanelId(api)
    if (editorPanelId) {
      api.addPanel({ id: viewId, component: 'pluginView', title, position: { referencePanel: editorPanelId, direction: 'within' } })
    } else {
      const referencePanelId = api.getPanel('agent') ? 'agent' : (findTopLeftWorkspaceReferencePanel(api) ?? 'agent')
      applyLayoutChangePreservingSidebarWidths(api, () => {
        api.addPanel({ id: viewId, component: 'pluginView', title, position: { referencePanel: referencePanelId, direction: 'right' } })
        const refGroup = api.getPanel(referencePanelId)?.group
        const paneGroup = api.getPanel(viewId)?.group
        if (refGroup && paneGroup && refGroup !== paneGroup) {
          const total = refGroup.element.offsetWidth + paneGroup.element.offsetWidth
          if (total > 0) paneGroup.api.setSize({ width: Math.round(total / 2) })
        }
      }, refs)
    }
    saveLayout()
    bumpVersion()
  }, [bumpVersion, saveLayout]) // eslint-disable-line react-hooks/exhaustive-deps

  const openPluginTreeView = useCallback((viewId: string, title: string): void => {
    const api = apiRef.current
    if (!api) return
    const existing = api.getPanel(viewId)
    if (existing) { existing.api.setActive(); return }
    const referencePanelId = findTopLeftWorkspaceReferencePanel(api) ?? 'agent'
    api.addPanel({ id: viewId, component: 'pluginTreeView', title, position: { referencePanel: referencePanelId, direction: 'within' } })
    saveLayout()
    bumpVersion()
  }, [bumpVersion, saveLayout]) // eslint-disable-line react-hooks/exhaustive-deps

  const { ensureEditorPanel, splitEditorPane, findEditorPanelForSplit } = useEditorPanels(ctx, focusPanel)
  const { togglePanel, closePanel, toggleMaximizePanel, isPanelVisible, resetLayout } = useDockActions(ctx, ensureEditorPanel, buildDefaultLayout)

  const onReady = useCallback((api: DockviewApi) => {
    apiRef.current = api

    const sid = sessionIdRef.current
    if (sid) {
      void loadOrBuildLayout(api, sid, buildDefaultLayout, refs, liveSiblingIds()).then(() => {
        reconcileLayoutAfterLoad(api, ctx)
      })
    } else {
      applyMinimalLayout(api, buildMinimalLayout, refs)
      syncPanels(api)
      sidebarWidthsRef.current = getSidebarWidths(api)
      bumpVersion()
    }

    registerLayoutListeners(api, ctx)
  }, [buildDefaultLayout, buildMinimalLayout, bumpVersion, syncPanels, liveSiblingIds, ctx]) // eslint-disable-line react-hooks/exhaustive-deps

  const prevSessionRef = useRef(sessionId)
  useEffect(() => {
    const previousSessionId = prevSessionRef.current
    if (sessionId === previousSessionId) return
    prevSessionRef.current = sessionId

    const api = apiRef.current
    if (!api) return

    flushPendingLayoutSave(previousSessionId)

    if (!sessionId) {
      applyMinimalLayout(api, buildMinimalLayout, refs)
      syncPanels(api)
      sidebarWidthsRef.current = getSidebarWidths(api)
      bumpVersion()
      return
    }

    void loadOrBuildLayout(api, sessionId, buildDefaultLayout, refs, liveSiblingIds()).then(() => {
      reconcileLayoutAfterLoad(api, ctx)
    })
  }, [sessionId, buildDefaultLayout, buildMinimalLayout, bumpVersion, syncPanels, liveSiblingIds, ctx, flushPendingLayoutSave]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear any pending debounced save on unmount so it can't fire api.toJSON()
  // on a disposed dockview (onboarding<->main transitions, StrictMode remount).
  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  const hiddenPanels = PANEL_IDS
    .filter((id) => !LAUNCHER_MODULE_IDS.has(id))
    .filter((id) => !isPanelVisible(id)) as DockPanelId[]
  const editorPanelIds = Array.from(editorPanelIdsRef.current).sort((left, right) => (
    parseEditorPanelOrder(left) - parseEditorPanelOrder(right)
  ))

  return {
    apiRef, isRestoringRef, onReady, togglePanel, closePanel, toggleMaximizePanel, focusPanel,
    openSiblingPanel, closeSiblingPanel,
    ensureEditorPanel, splitEditorPane, findEditorPanelForSplit, isPanelVisible,
    resetLayout, hiddenPanels, editorPanelIds, layoutVersion, layoutReloadVersion,
    openPluginView, openPluginTreeView,
  }
}
