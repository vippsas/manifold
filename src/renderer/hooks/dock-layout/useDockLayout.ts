import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DockviewApi, SerializedDockview } from 'dockview'
import {
  applyLayoutChangePreservingSidebarWidths,
  findTopLeftWorkspaceReferencePanel,
  isEditorPanelId,
  loadOrBuildLayout,
  parseEditorPanelOrder,
  type EditorSplitDirection,
  type DockPanelId,
  type LayoutRefs,
} from './dock-layout-helpers'
import { siblingPanelId } from '../agent-session/agent-siblings'
import { clearAgentTabDismissed, markAgentTabDismissed } from '../agent-session/dismissed-agent-tabs'
import type { AgentSession } from '../../../shared/types'
import { applyDefaultLayout, syncEditorPanelIds } from './dock-layout-builders'
import type { DockLayoutCtx } from './dock-layout-context'
import { reconcileLayoutAfterLoad } from './dock-layout-tabs'
import { useEditorPanels } from './dock-layout-panels'
import { useDockActions } from './dock-layout-actions'
import { registerLayoutListeners } from './dock-layout-lifecycle'

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
   *  other panes and the sidebar), or restore everything if already maximized. */
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

/**
 * The window's dock layout. There is exactly one, shared by every agent: the
 * arrangement is a property of the window, like Cursor's, so selecting another
 * agent only changes what the panes show. Layouts used to be saved per session
 * and reloaded on every switch, which re-ran `api.fromJSON` and left panels
 * appearing, sizes jumping, and the sidebar remounting mid-click.
 *
 * `_activeSessionId` is therefore not a key, and no longer selects a layout
 * either: the editor and shell open on demand, so a window with no agent yet
 * starts from the same `sidebar | agent` default as one with many. It is kept
 * in the signature because callers pass the selected agent positionally.
 */
export function useDockLayout(
  _activeSessionId: string | null,
  liveSessions: AgentSession[] = [],
): UseDockLayoutResult {
  const apiRef = useRef<DockviewApi | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const liveSessionsRef = useRef(liveSessions)
  const editorPanelIdsRef = useRef<Set<string>>(new Set())
  const nextEditorPanelIndexRef = useRef(1)
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
  const sidebarWidthRef = useRef(0)
  const dockWidthRef = useRef(0)
  const dockResizeObserverRef = useRef<ResizeObserver | null>(null)
  const refs: LayoutRefs = { isRestoringRef, lastLayoutRef }

  const syncPanels = useCallback((api: DockviewApi) => {
    syncEditorPanelIds(api, editorPanelIdsRef, nextEditorPanelIndexRef)
  }, [])

  const saveLayout = useCallback(() => {
    const api = apiRef.current
    if (!api) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(() => {
      const json = api.toJSON()
      saveTimerRef.current = null
      void window.electronAPI.invoke('dock-layout:set', json)
    }, 500)
  }, [])

  const buildDefaultLayout = useCallback((api: DockviewApi) => applyDefaultLayout(api), [])

  const ctx = useMemo<DockLayoutCtx>(() => ({
    apiRef,
    editorPanelIdsRef,
    nextEditorPanelIndexRef,
    closedPanelSnapshots,
    sidebarWidthRef,
    dockWidthRef,
    dockResizeObserverRef,
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
    // Mark before removing so the auto-tab effect (useAgentSiblingDockTabs),
    // which re-runs on any dock change, doesn't immediately recreate the tab.
    markAgentTabDismissed(sessionId)
    const panel = api.getPanel(siblingPanelId(sessionId))
    if (panel) api.removePanel(panel)
  }, [])

  const openSiblingPanel = useCallback((sessionId: string, title?: string, _referencePanelId?: string): void => {
    const api = apiRef.current
    if (!api) return
    // Reopening clears any earlier hide, so the auto-tab effect keeps it around.
    clearAgentTabDismissed(sessionId)
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
    // split that region 50/50, leaving the sidebar at its pinned width.
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

  // Runs once per window: the layout is loaded here and never reloaded, so no
  // agent switch can rearrange it.
  const onReady = useCallback((api: DockviewApi) => {
    apiRef.current = api

    void loadOrBuildLayout(api, buildDefaultLayout, refs, liveSiblingIds()).then(() => {
      reconcileLayoutAfterLoad(api, ctx)
    })

    registerLayoutListeners(api, ctx)
  }, [buildDefaultLayout, liveSiblingIds, ctx]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear any pending debounced save on unmount so it can't fire api.toJSON()
  // on a disposed dockview (onboarding<->main transitions, StrictMode remount).
  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  const editorPanelIds = Array.from(editorPanelIdsRef.current).sort((left, right) => (
    parseEditorPanelOrder(left) - parseEditorPanelOrder(right)
  ))

  return {
    apiRef, isRestoringRef, onReady, togglePanel, closePanel, toggleMaximizePanel, focusPanel,
    openSiblingPanel, closeSiblingPanel,
    ensureEditorPanel, splitEditorPane, findEditorPanelForSplit, isPanelVisible,
    resetLayout, editorPanelIds, layoutVersion, layoutReloadVersion,
    openPluginView, openPluginTreeView,
  }
}
