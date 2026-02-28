import { useCallback, useRef, useEffect, useState } from 'react'
import type { DockviewApi, SerializedDockview } from 'dockview'
import {
  PANEL_IDS,
  PANEL_TITLES,
  DEFAULT_SIDEBAR_WIDTH,
  loadOrBuildLayout,
  applyMinimalLayout,
  hidePanel,
  showPanelFromSnapshot,
  showPanelFromHints,
  type DockPanelId,
  type LayoutRefs,
} from './dock-layout-helpers'

export type { DockPanelId } from './dock-layout-helpers'

export interface UseDockLayoutResult {
  apiRef: React.MutableRefObject<DockviewApi | null>
  onReady: (api: DockviewApi) => void
  togglePanel: (id: DockPanelId) => void
  isPanelVisible: (id: DockPanelId) => boolean
  resetLayout: () => void
  hiddenPanels: DockPanelId[]
}

export function useDockLayout(sessionId: string | null): UseDockLayoutResult {
  const apiRef = useRef<DockviewApi | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  const [, setLayoutVersion] = useState(0)
  const bumpVersion = useCallback(() => setLayoutVersion((v) => v + 1), [])

  const lastLayoutRef = useRef<SerializedDockview | null>(null)
  const closedPanelSnapshots = useRef<Map<DockPanelId, SerializedDockview>>(new Map())
  const isRestoringRef = useRef(false)
  const refs: LayoutRefs = { isRestoringRef, lastLayoutRef }

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

  const buildDefaultLayout = useCallback((api: DockviewApi) => {
    const projectsPanel = api.addPanel({
      id: 'projects',
      component: 'projects',
      title: PANEL_TITLES.projects,
    })

    api.addPanel({
      id: 'agent',
      component: 'agent',
      title: PANEL_TITLES.agent,
      position: { referencePanel: projectsPanel, direction: 'right' },
    })

    const filesPanel = api.addPanel({
      id: 'fileTree',
      component: 'fileTree',
      title: PANEL_TITLES.fileTree,
      position: { referencePanel: projectsPanel, direction: 'below' },
    })

    api.addPanel({
      id: 'modifiedFiles',
      component: 'modifiedFiles',
      title: PANEL_TITLES.modifiedFiles,
      position: { referencePanel: filesPanel, direction: 'within' },
    })

    filesPanel.api.setActive()

    try {
      projectsPanel.group?.api.setSize({ width: DEFAULT_SIDEBAR_WIDTH })
    } catch {
      // sizing is best-effort
    }
  }, [])

  const buildMinimalLayout = useCallback((api: DockviewApi) => {
    const projectsPanel = api.addPanel({
      id: 'projects',
      component: 'projects',
      title: PANEL_TITLES.projects,
    })

    api.addPanel({
      id: 'agent',
      component: 'agent',
      title: PANEL_TITLES.agent,
      position: { referencePanel: projectsPanel, direction: 'right' },
    })

    try {
      projectsPanel.group?.api.setSize({ width: DEFAULT_SIDEBAR_WIDTH })
    } catch {
      // sizing is best-effort
    }
  }, [])

  const onReady = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api

      const sid = sessionIdRef.current
      if (sid) {
        void loadOrBuildLayout(api, sid, buildDefaultLayout, refs)
      } else {
        applyMinimalLayout(api, buildMinimalLayout, refs)
      }

      api.onDidRemovePanel((panel) => {
        if (isRestoringRef.current) return
        const id = panel.id as DockPanelId
        if (PANEL_IDS.includes(id) && lastLayoutRef.current) {
          closedPanelSnapshots.current.set(id, lastLayoutRef.current)
        }
      })

      api.onDidLayoutChange(() => {
        if (isRestoringRef.current) return
        lastLayoutRef.current = api.toJSON()
        saveLayout()
        bumpVersion()
      })
    },
    [buildDefaultLayout, buildMinimalLayout, saveLayout, bumpVersion]
  )

  // When sessionId changes, load the layout for the new session
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
      return
    }

    void loadOrBuildLayout(api, sessionId, buildDefaultLayout, refs)
  }, [sessionId, buildDefaultLayout, buildMinimalLayout])

  const togglePanel = useCallback((id: DockPanelId) => {
    const api = apiRef.current
    if (!api) return
    const panel = api.getPanel(id)
    if (panel) {
      hidePanel(api, id, closedPanelSnapshots, refs)
      saveLayout()
      bumpVersion()
    } else {
      const snapshot = closedPanelSnapshots.current.get(id)
      if (snapshot) {
        showPanelFromSnapshot(api, id, snapshot, closedPanelSnapshots, refs)
        saveLayout()
        bumpVersion()
        return
      }
      showPanelFromHints(api, id)
    }
  }, [saveLayout, bumpVersion])

  const isPanelVisible = useCallback((id: DockPanelId): boolean => {
    const api = apiRef.current
    if (!api) return true
    return api.getPanel(id) !== undefined
  }, [])

  const resetLayout = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    api.clear()
    buildDefaultLayout(api)
    closedPanelSnapshots.current.clear()
    lastLayoutRef.current = api.toJSON()
  }, [buildDefaultLayout])

  const hiddenPanels = PANEL_IDS.filter((id) => {
    const api = apiRef.current
    if (!api) return false
    return api.getPanel(id) === undefined
  }) as DockPanelId[]

  return {
    apiRef,
    onReady,
    togglePanel,
    isPanelVisible,
    resetLayout,
    hiddenPanels,
  }
}
