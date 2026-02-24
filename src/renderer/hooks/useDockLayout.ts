import { useCallback, useRef, useEffect, useState } from 'react'
import type { DockviewApi, SerializedDockview } from 'dockview'

const PANEL_IDS = ['projects', 'agent', 'editor', 'fileTree', 'modifiedFiles', 'shell'] as const
export type DockPanelId = (typeof PANEL_IDS)[number]

const PANEL_TITLES: Record<DockPanelId, string> = {
  projects: 'Projects',
  agent: 'Agent',
  editor: 'Editor',
  fileTree: 'Files',
  modifiedFiles: 'Modified Files',
  shell: 'Shell',
}

type Direction = 'right' | 'left' | 'above' | 'below' | 'within'

// Fallback positions when no snapshot exists (matches default layout).
const PANEL_RESTORE_HINTS: Record<DockPanelId, Array<{ ref: DockPanelId; dir: Direction }>> = {
  projects: [{ ref: 'fileTree', dir: 'above' }, { ref: 'agent', dir: 'left' }],
  agent: [{ ref: 'projects', dir: 'right' }, { ref: 'editor', dir: 'left' }, { ref: 'shell', dir: 'above' }],
  editor: [{ ref: 'agent', dir: 'right' }, { ref: 'shell', dir: 'above' }],
  fileTree: [{ ref: 'modifiedFiles', dir: 'within' }, { ref: 'projects', dir: 'below' }],
  modifiedFiles: [{ ref: 'fileTree', dir: 'within' }, { ref: 'projects', dir: 'below' }],
  shell: [{ ref: 'agent', dir: 'below' }, { ref: 'editor', dir: 'below' }],
}

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

  // Incremented on layout changes to trigger re-render for hiddenPanels
  const [, setLayoutVersion] = useState(0)
  const bumpVersion = useCallback(() => setLayoutVersion((v) => v + 1), [])

  // Layout snapshot taken before each panel removal, keyed by panel ID
  const lastLayoutRef = useRef<SerializedDockview | null>(null)
  const closedPanelSnapshots = useRef<Map<DockPanelId, SerializedDockview>>(new Map())
  const isRestoringRef = useRef(false)

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
    // 1. Left column: Projects
    const projectsPanel = api.addPanel({
      id: 'projects',
      component: 'projects',
      title: PANEL_TITLES.projects,
    })

    // 2. Right area: Agent (right of Projects)
    api.addPanel({
      id: 'agent',
      component: 'agent',
      title: PANEL_TITLES.agent,
      position: { referencePanel: projectsPanel, direction: 'right' },
    })

    // 3. Split left column: Files below Projects
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

    // Make Files the active tab in its group
    filesPanel.api.setActive()

    // Set relative sizes
    try {
      projectsPanel.group?.api.setSize({ width: 300 })
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
      projectsPanel.group?.api.setSize({ width: 300 })
    } catch {
      // sizing is best-effort
    }
  }, [])

  const onReady = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api

      const sid = sessionIdRef.current
      if (sid) {
        void (async () => {
          try {
            const saved = (await window.electronAPI.invoke('dock-layout:get', sid)) as SerializedDockview | null
            if (saved && saved.grid && saved.panels) {
              api.fromJSON(saved)
              lastLayoutRef.current = saved
              return
            }
          } catch {
            // ignore load errors, fall through to default
          }
          buildDefaultLayout(api)
          lastLayoutRef.current = api.toJSON()
        })()
      } else {
        buildMinimalLayout(api)
        lastLayoutRef.current = api.toJSON()
      }

      // When a panel is removed, save the pre-removal layout for that panel
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

  // When sessionId changes, try to load the layout for the new session
  const prevSessionRef = useRef(sessionId)
  useEffect(() => {
    if (sessionId === prevSessionRef.current) return
    prevSessionRef.current = sessionId
    const api = apiRef.current
    if (!api) return

    if (!sessionId) {
      api.clear()
      buildMinimalLayout(api)
      lastLayoutRef.current = api.toJSON()
      return
    }

    void (async () => {
      try {
        const saved = (await window.electronAPI.invoke('dock-layout:get', sessionId)) as SerializedDockview | null
        if (saved && saved.grid && saved.panels) {
          api.fromJSON(saved)
          lastLayoutRef.current = saved
          return
        }
      } catch {
        // ignore
      }
      // Clear and rebuild default if no saved layout
      api.clear()
      buildDefaultLayout(api)
      lastLayoutRef.current = api.toJSON()
    })()
  }, [sessionId, buildDefaultLayout, buildMinimalLayout])

  const togglePanel = useCallback((id: DockPanelId) => {
    const api = apiRef.current
    if (!api) return
    const panel = api.getPanel(id)
    if (panel) {
      api.removePanel(panel)
    } else {
      // Try to restore from snapshot (exact previous position)
      const snapshot = closedPanelSnapshots.current.get(id)
      if (snapshot) {
        const currentlyVisible = new Set(
          PANEL_IDS.filter((pid) => api.getPanel(pid) !== undefined)
        )

        isRestoringRef.current = true
        try {
          api.fromJSON(snapshot)
          // Remove panels that weren't visible before reopening
          for (const pid of PANEL_IDS) {
            if (pid !== id && !currentlyVisible.has(pid)) {
              const p = api.getPanel(pid)
              if (p) api.removePanel(p)
            }
          }
        } finally {
          isRestoringRef.current = false
        }

        lastLayoutRef.current = api.toJSON()
        saveLayout()
        bumpVersion()
        closedPanelSnapshots.current.delete(id)
        return
      }

      // Fallback: use static position hints
      const hints = PANEL_RESTORE_HINTS[id]
      let position: { referencePanel: ReturnType<DockviewApi['getPanel']>; direction: Direction } | undefined
      for (const hint of hints) {
        const ref = api.getPanel(hint.ref)
        if (ref) {
          position = { referencePanel: ref, direction: hint.dir }
          break
        }
      }
      api.addPanel({
        id,
        component: id,
        title: PANEL_TITLES[id],
        ...(position ? { position } : {}),
      })
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

  // Compute hidden panels
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
