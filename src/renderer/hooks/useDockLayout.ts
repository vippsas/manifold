import { useCallback, useEffect, useRef, useState } from 'react'
import type { DockviewApi, SerializedDockview } from 'dockview'
import { getGridLocation, type Orientation } from 'dockview-core'
import {
  applyLayoutChangePreservingSidebarWidths,
  PANEL_IDS,
  PANEL_TITLES,
  applyMinimalLayout,
  findAdjacentEditorPanelId,
  getGridSignature,
  getSidebarWidths,
  hidePanel,
  isEditorPanelId,
  loadOrBuildLayout,
  parseEditorPanelOrder,
  restoreSidebarWidths,
  showPanelFromHints,
  showPanelFromSnapshot,
  type EditorSplitDirection,
  type DockPanelId,
  type LayoutRefs,
} from './dock-layout-helpers'
import { siblingPanelId } from './agent-siblings'
import type { AgentSession } from '../../shared/types'
import { applyDefaultLayout, applyMinimalPanels, syncEditorPanelIds } from './dock-layout-builders'
import { ensureSearchPanelInWorkspace } from './dock-layout-search'

export type { DockPanelId, EditorSplitDirection } from './dock-layout-helpers'
export { isEditorPanelId } from './dock-layout-helpers'

export interface UseDockLayoutResult {
  apiRef: React.MutableRefObject<DockviewApi | null>
  onReady: (api: DockviewApi) => void
  togglePanel: (id: DockPanelId) => void
  closePanel: (id: string) => void
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
}

export function useDockLayout(
  sessionId: string | null,
  showIdeasTab: boolean,
  showLoopTab: boolean,
  showVerdictsTab: boolean,
  liveSessions: AgentSession[] = [],
): UseDockLayoutResult {
  const apiRef = useRef<DockviewApi | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionIdRef = useRef(sessionId)
  const showIdeasTabRef = useRef(showIdeasTab)
  const showLoopTabRef = useRef(showLoopTab)
  const showVerdictsTabRef = useRef(showVerdictsTab)
  const liveSessionsRef = useRef(liveSessions)
  const editorPanelIdsRef = useRef<Set<string>>(new Set())
  const nextEditorPanelIndexRef = useRef(1)
  sessionIdRef.current = sessionId
  showIdeasTabRef.current = showIdeasTab
  showLoopTabRef.current = showLoopTab
  showVerdictsTabRef.current = showVerdictsTab
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

  const lastLayoutRef = useRef<SerializedDockview | null>(null)
  const closedPanelSnapshots = useRef<Map<DockPanelId, SerializedDockview>>(new Map())
  const isRestoringRef = useRef(false)
  const sidebarWidthsRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 })
  const refs: LayoutRefs = { isRestoringRef, lastLayoutRef }

  const syncPanels = useCallback((api: DockviewApi) => {
    syncEditorPanelIds(api, editorPanelIdsRef, nextEditorPanelIndexRef)
  }, [])

  const saveLayout = useCallback(() => {
    const api = apiRef.current
    const sid = sessionIdRef.current
    if (!api || !sid) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(() => {
      const json = api.toJSON()
      void window.electronAPI.invoke('dock-layout:set', sid, json)
    }, 500)
  }, [])

  const buildDefaultLayout = useCallback((api: DockviewApi) => applyDefaultLayout(api, { showIdeasTab, showLoopTab, showVerdictsTab }), [showIdeasTab, showLoopTab, showVerdictsTab])
  const buildMinimalLayout = useCallback((api: DockviewApi) => applyMinimalPanels(api), [])

  const applyIdeasTabSetting = useCallback((api: DockviewApi, showOnEnable: boolean): boolean => {
    if (!sessionIdRef.current) return false

    const ideasPanel = api.getPanel('backgroundAgent')
    if (!showIdeasTabRef.current) {
      if (!ideasPanel) return false
      hidePanel(api, 'backgroundAgent', closedPanelSnapshots, refs)
      return true
    }

    if (!showOnEnable || ideasPanel) return false

    const snapshot = closedPanelSnapshots.current.get('backgroundAgent')
    if (snapshot) {
      showPanelFromSnapshot(api, 'backgroundAgent', snapshot, closedPanelSnapshots, refs)
    } else {
      showPanelFromHints(api, 'backgroundAgent', refs)
    }
    return true
  }, [refs])

  const applyLoopTabSetting = useCallback((api: DockviewApi, showOnEnable: boolean): boolean => {
    if (!sessionIdRef.current) return false

    const loopPanel = api.getPanel('loop')
    if (!showLoopTabRef.current) {
      if (!loopPanel) return false
      hidePanel(api, 'loop', closedPanelSnapshots, refs)
      return true
    }

    if (!showOnEnable || loopPanel) return false

    const snapshot = closedPanelSnapshots.current.get('loop')
    if (snapshot) {
      showPanelFromSnapshot(api, 'loop', snapshot, closedPanelSnapshots, refs)
    } else {
      showPanelFromHints(api, 'loop', refs)
    }
    return true
  }, [refs])

  const applyVerdictsTabSetting = useCallback((api: DockviewApi, showOnEnable: boolean): boolean => {
    if (!sessionIdRef.current) return false

    const verdictsPanel = api.getPanel('verdicts')
    if (!showVerdictsTabRef.current) {
      if (!verdictsPanel) return false
      hidePanel(api, 'verdicts', closedPanelSnapshots, refs)
      return true
    }

    if (!showOnEnable || verdictsPanel) return false

    const snapshot = closedPanelSnapshots.current.get('verdicts')
    if (snapshot) {
      showPanelFromSnapshot(api, 'verdicts', snapshot, closedPanelSnapshots, refs)
    } else {
      showPanelFromHints(api, 'verdicts', refs)
    }
    return true
  }, [refs])

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

  const openSiblingPanel = useCallback((sessionId: string, title?: string, referencePanelId?: string): void => {
    const api = apiRef.current
    if (!api) return
    const panelId = siblingPanelId(sessionId)
    let panel = api.getPanel(panelId)
    if (!panel) {
      // Prefer the previous sibling's panel as the reference so the new tab
      // lands in whatever group the user has dragged that sibling to (custom
      // split panes preserved). Fall back to the agent group otherwise.
      const refId = referencePanelId && api.getPanel(referencePanelId) ? referencePanelId : 'agent'
      if (!api.getPanel(refId)) return
      api.addPanel({
        id: panelId,
        component: 'agent',
        title: title ?? 'Agent',
        position: { referencePanel: refId, direction: 'within' },
        inactive: false,
      })
      panel = api.getPanel(panelId)
    }
    if (panel && !panel.api.isActive) panel.api.setActive()
  }, [])

  const onReady = useCallback((api: DockviewApi) => {
    apiRef.current = api

    const sid = sessionIdRef.current
    if (sid) {
      void loadOrBuildLayout(api, sid, buildDefaultLayout, refs, liveSiblingIds()).then(() => {
        const ideasChanged = applyIdeasTabSetting(api, false)
        const loopChanged = applyLoopTabSetting(api, false)
        const verdictsChanged = applyVerdictsTabSetting(api, false)
        syncPanels(api)
        sidebarWidthsRef.current = getSidebarWidths(api)
        if (ensureSearchPanelInWorkspace(api, editorPanelIdsRef.current)) {
          lastLayoutRef.current = api.toJSON()
          saveLayout()
        }
        if (ideasChanged || loopChanged || verdictsChanged) saveLayout()
        bumpVersion()
      })
    } else {
      applyMinimalLayout(api, buildMinimalLayout, refs)
      syncPanels(api)
      sidebarWidthsRef.current = getSidebarWidths(api)
      bumpVersion()
    }

    api.onDidRemovePanel((panel) => {
      if (isRestoringRef.current) return

      if (isEditorPanelId(panel.id)) {
        editorPanelIdsRef.current.delete(panel.id)
        bumpVersion()
        return
      }

      const id = panel.id as DockPanelId
      if (PANEL_IDS.includes(id) && lastLayoutRef.current) {
        closedPanelSnapshots.current.set(id, lastLayoutRef.current)
      }
    })

    api.onDidLayoutChange(() => {
      if (isRestoringRef.current) return

      const previousJson = lastLayoutRef.current
      const currentJson = api.toJSON()

      // Detect structural changes (panel moves/adds/removes) vs simple
      // divider resizes by comparing the grid's panel arrangement.
      const structureChanged = previousJson &&
        getGridSignature(previousJson) !== getGridSignature(currentJson)

      if (structureChanged && (sidebarWidthsRef.current.left > 0 || sidebarWidthsRef.current.right > 0)) {
        // Structural change — restore pinned sidebar widths so only the
        // center (agent) pane absorbs the size difference.
        restoreSidebarWidths(api, sidebarWidthsRef.current, refs)
      } else {
        // Pure resize (user dragging a divider) — update pinned widths.
        sidebarWidthsRef.current = getSidebarWidths(api)
        lastLayoutRef.current = currentJson
      }

      syncPanels(api)
      saveLayout()
      bumpVersion()
    })
  }, [applyIdeasTabSetting, applyLoopTabSetting, applyVerdictsTabSetting, buildDefaultLayout, buildMinimalLayout, bumpVersion, saveLayout, syncPanels, liveSiblingIds])

  const prevSessionRef = useRef(sessionId)
  useEffect(() => {
    if (sessionId === prevSessionRef.current) return
    prevSessionRef.current = sessionId

    const api = apiRef.current
    if (!api) return

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    if (!sessionId) {
      applyMinimalLayout(api, buildMinimalLayout, refs)
      syncPanels(api)
      sidebarWidthsRef.current = getSidebarWidths(api)
      bumpVersion()
      return
    }

    void loadOrBuildLayout(api, sessionId, buildDefaultLayout, refs, liveSiblingIds()).then(() => {
      const ideasChanged = applyIdeasTabSetting(api, false)
      const loopChanged = applyLoopTabSetting(api, false)
      const verdictsChanged = applyVerdictsTabSetting(api, false)
      syncPanels(api)
      sidebarWidthsRef.current = getSidebarWidths(api)
      if (ensureSearchPanelInWorkspace(api, editorPanelIdsRef.current)) {
        lastLayoutRef.current = api.toJSON()
        saveLayout()
      }
      if (ideasChanged || loopChanged || verdictsChanged) saveLayout()
      bumpVersion()
    })
  }, [sessionId, applyIdeasTabSetting, applyLoopTabSetting, applyVerdictsTabSetting, buildDefaultLayout, buildMinimalLayout, bumpVersion, saveLayout, syncPanels, liveSiblingIds])

  const previousShowIdeasTabRef = useRef(showIdeasTab)
  useEffect(() => {
    const previous = previousShowIdeasTabRef.current
    previousShowIdeasTabRef.current = showIdeasTab
    if (previous === showIdeasTab) return

    const api = apiRef.current
    if (!api || !sessionIdRef.current) return

    const visibilityChanged = applyIdeasTabSetting(api, showIdeasTab)
    if (!visibilityChanged) {
      bumpVersion()
      return
    }

    syncPanels(api)
    lastLayoutRef.current = api.toJSON()
    saveLayout()
    bumpVersion()
  }, [applyIdeasTabSetting, bumpVersion, saveLayout, showIdeasTab, syncPanels])

  const previousShowLoopTabRef = useRef(showLoopTab)
  useEffect(() => {
    const previous = previousShowLoopTabRef.current
    previousShowLoopTabRef.current = showLoopTab
    if (previous === showLoopTab) return

    const api = apiRef.current
    if (!api || !sessionIdRef.current) return

    const visibilityChanged = applyLoopTabSetting(api, showLoopTab)
    if (!visibilityChanged) {
      bumpVersion()
      return
    }

    syncPanels(api)
    lastLayoutRef.current = api.toJSON()
    saveLayout()
    bumpVersion()
  }, [applyLoopTabSetting, bumpVersion, saveLayout, showLoopTab, syncPanels])

  const previousShowVerdictsTabRef = useRef(showVerdictsTab)
  useEffect(() => {
    const previous = previousShowVerdictsTabRef.current
    previousShowVerdictsTabRef.current = showVerdictsTab
    if (previous === showVerdictsTab) return

    const api = apiRef.current
    if (!api || !sessionIdRef.current) return

    const visibilityChanged = applyVerdictsTabSetting(api, showVerdictsTab)
    if (!visibilityChanged) {
      bumpVersion()
      return
    }

    syncPanels(api)
    lastLayoutRef.current = api.toJSON()
    saveLayout()
    bumpVersion()
  }, [applyVerdictsTabSetting, bumpVersion, saveLayout, showVerdictsTab, syncPanels])

  const ensureEditorPanel = useCallback((preferredPanelId?: string | null): string => {
    const api = apiRef.current
    if (!api) return preferredPanelId ?? 'editor'

    const visibleEditorPanels = Array.from(editorPanelIdsRef.current).sort((left, right) => (
      parseEditorPanelOrder(left) - parseEditorPanelOrder(right)
    ))

    const existingPanelId = preferredPanelId && visibleEditorPanels.includes(preferredPanelId)
      ? preferredPanelId
      : visibleEditorPanels[0]

    if (existingPanelId) {
      focusPanel(existingPanelId)
      return existingPanelId
    }

    showPanelFromHints(api, 'editor', refs)
    syncPanels(api)
    saveLayout()
    bumpVersion()
    focusPanel('editor')
    return 'editor'
  }, [bumpVersion, focusPanel, saveLayout, syncPanels])

  const splitEditorPane = useCallback((referencePanelId: string, direction: EditorSplitDirection): string | null => {
    const api = apiRef.current
    if (!api) return null

    const referencePanel = api.getPanel(referencePanelId) ?? api.getPanel(ensureEditorPanel(referencePanelId))
    if (!referencePanel) return null

    const newPanelId = `${PANEL_TITLES.editor.toLowerCase()}:${nextEditorPanelIndexRef.current}`
    nextEditorPanelIndexRef.current += 1

    applyLayoutChangePreservingSidebarWidths(api, () => {
      api.addPanel({
        id: newPanelId,
        component: 'editor',
        title: PANEL_TITLES.editor,
        position: { referencePanel, direction },
      })
    }, refs)

    const panel = api.getPanel(newPanelId)
    if (!panel) return null
    editorPanelIdsRef.current.add(newPanelId)
    sidebarWidthsRef.current = getSidebarWidths(api)
    panel.api.setActive()
    lastLayoutRef.current = api.toJSON()
    saveLayout()
    bumpVersion()
    return newPanelId
  }, [bumpVersion, ensureEditorPanel, saveLayout])

  const findEditorPanelForSplit = useCallback((referencePanelId: string, direction: EditorSplitDirection): string | null => {
    const api = apiRef.current
    if (!api) return null

    const referencePanel = api.getPanel(referencePanelId) ?? api.getPanel(ensureEditorPanel(referencePanelId))
    if (!referencePanel) return null

    const referenceLocation = getGridLocation(referencePanel.group.element)
    const rootOrientation = api.toJSON().grid.orientation as Orientation
    const candidatePanels = Array.from(editorPanelIdsRef.current)
      .filter((panelId) => panelId !== referencePanelId)
      .map((panelId) => {
        const panel = api.getPanel(panelId)
        if (!panel) return null
        return {
          panelId,
          location: getGridLocation(panel.group.element),
        }
      })
      .filter((panel): panel is { panelId: string; location: number[] } => panel !== null)

    return findAdjacentEditorPanelId(rootOrientation, referenceLocation, candidatePanels, direction)
  }, [ensureEditorPanel])

  const closePanel = useCallback((id: string): void => {
    const api = apiRef.current
    if (!api) return

    if (isEditorPanelId(id)) {
      const panel = api.getPanel(id)
      if (!panel) return
      const widths = getSidebarWidths(api)
      api.removePanel(panel)
      editorPanelIdsRef.current.delete(id)
      restoreSidebarWidths(api, widths, refs)
      lastLayoutRef.current = api.toJSON()
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
  }, [bumpVersion, saveLayout])

  const togglePanel = useCallback((id: DockPanelId): void => {
    const api = apiRef.current
    if (!api) return
    if (id === 'backgroundAgent' && !showIdeasTabRef.current) return
    if (id === 'loop' && !showLoopTabRef.current) return

    if (id === 'editor') {
      const visibleEditorPanels = Array.from(editorPanelIdsRef.current)
      if (visibleEditorPanels.length === 0) {
        ensureEditorPanel()
        return
      }

      const widths = getSidebarWidths(api)
      for (const panelId of visibleEditorPanels) {
        const panel = api.getPanel(panelId)
        if (panel) api.removePanel(panel)
      }

      editorPanelIdsRef.current.clear()
      restoreSidebarWidths(api, widths, refs)
      lastLayoutRef.current = api.toJSON()
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
  }, [bumpVersion, ensureEditorPanel, saveLayout, syncPanels])

  const isPanelVisible = useCallback((id: DockPanelId): boolean => {
    const api = apiRef.current
    if (!api) return true
    if (id === 'editor') return editorPanelIdsRef.current.size > 0
    return api.getPanel(id) !== undefined
  }, [])

  const resetLayout = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    isRestoringRef.current = true
    try {
      api.clear()
      buildDefaultLayout(api)
    } finally {
      isRestoringRef.current = false
    }
    closedPanelSnapshots.current.clear()
    syncPanels(api)
    sidebarWidthsRef.current = getSidebarWidths(api)
    lastLayoutRef.current = api.toJSON()
    bumpVersion()
  }, [buildDefaultLayout, bumpVersion, syncPanels])

  const hiddenPanels = PANEL_IDS
    .filter((id) => showIdeasTab || id !== 'backgroundAgent')
    .filter((id) => showLoopTab || id !== 'loop')
    .filter((id) => !isPanelVisible(id)) as DockPanelId[]
  const editorPanelIds = Array.from(editorPanelIdsRef.current).sort((left, right) => (
    parseEditorPanelOrder(left) - parseEditorPanelOrder(right)
  ))

  return {
    apiRef, onReady, togglePanel, closePanel, focusPanel,
    openSiblingPanel, closeSiblingPanel,
    ensureEditorPanel, splitEditorPane, findEditorPanelForSplit, isPanelVisible,
    resetLayout, hiddenPanels, editorPanelIds, layoutVersion,
  }
}
