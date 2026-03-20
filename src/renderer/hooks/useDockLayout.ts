import { useCallback, useEffect, useRef, useState } from 'react'
import type { DockviewApi, SerializedDockview } from 'dockview'
import {
  PANEL_IDS,
  PANEL_TITLES,
  applyMinimalLayout,
  hidePanel,
  isEditorPanelId,
  loadOrBuildLayout,
  parseEditorPanelOrder,
  showPanelFromHints,
  showPanelFromSnapshot,
  type DockPanelId,
  type LayoutRefs,
} from './dock-layout-helpers'
import { applyDefaultLayout, applyMinimalPanels, syncEditorPanelIds } from './dock-layout-builders'

export type { DockPanelId } from './dock-layout-helpers'
export { isEditorPanelId } from './dock-layout-helpers'

type SplitEditorDirection = 'right' | 'below'

export interface UseDockLayoutResult {
  apiRef: React.MutableRefObject<DockviewApi | null>
  onReady: (api: DockviewApi) => void
  togglePanel: (id: DockPanelId) => void
  closePanel: (id: string) => void
  focusPanel: (id: string) => void
  ensureEditorPanel: (preferredPanelId?: string | null) => string
  splitEditorPane: (referencePanelId: string, direction: SplitEditorDirection) => string | null
  isPanelVisible: (id: DockPanelId) => boolean
  resetLayout: () => void
  hiddenPanels: DockPanelId[]
  editorPanelIds: string[]
}

export function useDockLayout(sessionId: string | null): UseDockLayoutResult {
  const apiRef = useRef<DockviewApi | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionIdRef = useRef(sessionId)
  const editorPanelIdsRef = useRef<Set<string>>(new Set())
  const nextEditorPanelIndexRef = useRef(1)
  sessionIdRef.current = sessionId

  const [, setLayoutVersion] = useState(0)
  const bumpVersion = useCallback(() => setLayoutVersion((value) => value + 1), [])

  const lastLayoutRef = useRef<SerializedDockview | null>(null)
  const closedPanelSnapshots = useRef<Map<DockPanelId, SerializedDockview>>(new Map())
  const isRestoringRef = useRef(false)
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

  const buildDefaultLayout = useCallback((api: DockviewApi) => applyDefaultLayout(api), [])
  const buildMinimalLayout = useCallback((api: DockviewApi) => applyMinimalPanels(api), [])

  const focusPanel = useCallback((id: string): void => {
    const panel = apiRef.current?.getPanel(id)
    if (panel) panel.api.setActive()
  }, [])

  const onReady = useCallback((api: DockviewApi) => {
    apiRef.current = api

    const sid = sessionIdRef.current
    if (sid) {
      void loadOrBuildLayout(api, sid, buildDefaultLayout, refs).then(() => {
        syncPanels(api)
        bumpVersion()
      })
    } else {
      applyMinimalLayout(api, buildMinimalLayout, refs)
      syncPanels(api)
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
      lastLayoutRef.current = api.toJSON()
      syncPanels(api)
      saveLayout()
      bumpVersion()
    })
  }, [buildDefaultLayout, buildMinimalLayout, bumpVersion, saveLayout, syncPanels])

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
      bumpVersion()
      return
    }

    void loadOrBuildLayout(api, sessionId, buildDefaultLayout, refs).then(() => {
      syncPanels(api)
      bumpVersion()
    })
  }, [sessionId, buildDefaultLayout, buildMinimalLayout, bumpVersion, syncPanels])

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

    showPanelFromHints(api, 'editor')
    syncPanels(api)
    saveLayout()
    bumpVersion()
    focusPanel('editor')
    return 'editor'
  }, [bumpVersion, focusPanel, saveLayout, syncPanels])

  const splitEditorPane = useCallback((referencePanelId: string, direction: SplitEditorDirection): string | null => {
    const api = apiRef.current
    if (!api) return null

    const referencePanel = api.getPanel(referencePanelId) ?? api.getPanel(ensureEditorPanel(referencePanelId))
    if (!referencePanel) return null

    const newPanelId = `${PANEL_TITLES.editor.toLowerCase()}:${nextEditorPanelIndexRef.current}`
    nextEditorPanelIndexRef.current += 1

    const panel = api.addPanel({
      id: newPanelId,
      component: 'editor',
      title: PANEL_TITLES.editor,
      position: { referencePanel, direction },
    })

    editorPanelIdsRef.current.add(newPanelId)
    panel.api.setActive()
    lastLayoutRef.current = api.toJSON()
    saveLayout()
    bumpVersion()
    return newPanelId
  }, [bumpVersion, ensureEditorPanel, saveLayout])

  const closePanel = useCallback((id: string): void => {
    const api = apiRef.current
    if (!api) return

    if (isEditorPanelId(id)) {
      const panel = api.getPanel(id)
      if (!panel) return
      api.removePanel(panel)
      editorPanelIdsRef.current.delete(id)
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

    if (id === 'editor') {
      const visibleEditorPanels = Array.from(editorPanelIdsRef.current)
      if (visibleEditorPanels.length === 0) {
        ensureEditorPanel()
        return
      }

      for (const panelId of visibleEditorPanels) {
        const panel = api.getPanel(panelId)
        if (panel) api.removePanel(panel)
      }

      editorPanelIdsRef.current.clear()
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

    showPanelFromHints(api, id)
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
    api.clear()
    buildDefaultLayout(api)
    closedPanelSnapshots.current.clear()
    syncPanels(api)
    lastLayoutRef.current = api.toJSON()
    bumpVersion()
  }, [buildDefaultLayout, bumpVersion, syncPanels])

  const hiddenPanels = PANEL_IDS.filter((id) => !isPanelVisible(id)) as DockPanelId[]
  const editorPanelIds = Array.from(editorPanelIdsRef.current).sort((left, right) => (
    parseEditorPanelOrder(left) - parseEditorPanelOrder(right)
  ))

  return {
    apiRef, onReady, togglePanel, closePanel, focusPanel,
    ensureEditorPanel, splitEditorPane, isPanelVisible,
    resetLayout, hiddenPanels, editorPanelIds,
  }
}
