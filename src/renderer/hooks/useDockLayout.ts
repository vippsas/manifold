import { useCallback, useRef, useEffect } from 'react'
import type { DockviewApi, SerializedDockview } from 'dockview'

const PANEL_IDS = ['agent', 'editor', 'fileTree', 'modifiedFiles', 'shell'] as const
export type DockPanelId = (typeof PANEL_IDS)[number]

const PANEL_TITLES: Record<DockPanelId, string> = {
  agent: 'Agent',
  editor: 'Editor',
  fileTree: 'Files',
  modifiedFiles: 'Modified Files',
  shell: 'Shell',
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
    // Left: Agent (takes up ~75%)
    const agentPanel = api.addPanel({
      id: 'agent',
      component: 'agent',
      title: PANEL_TITLES.agent,
    })

    // Right top: Editor, FileTree, ModifiedFiles as tabs
    api.addPanel({
      id: 'editor',
      component: 'editor',
      title: PANEL_TITLES.editor,
      position: { referencePanel: agentPanel, direction: 'right' },
    })

    api.addPanel({
      id: 'fileTree',
      component: 'fileTree',
      title: PANEL_TITLES.fileTree,
      position: { referencePanel: 'editor', direction: 'within' },
    })

    api.addPanel({
      id: 'modifiedFiles',
      component: 'modifiedFiles',
      title: PANEL_TITLES.modifiedFiles,
      position: { referencePanel: 'editor', direction: 'within' },
    })

    // Bottom: Shell
    api.addPanel({
      id: 'shell',
      component: 'shell',
      title: PANEL_TITLES.shell,
      position: { referencePanel: agentPanel, direction: 'below' },
    })

    // Set relative sizes: agent ~75% left, right area ~25%
    try {
      api.getPanel('editor')?.group?.api.setSize({ width: 350 })
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
              return
            }
          } catch {
            // ignore load errors, fall through to default
          }
          buildDefaultLayout(api)
        })()
      } else {
        buildDefaultLayout(api)
      }

      api.onDidLayoutChange(() => saveLayout())
    },
    [buildDefaultLayout, saveLayout]
  )

  // When sessionId changes, try to load the layout for the new session
  const prevSessionRef = useRef(sessionId)
  useEffect(() => {
    if (sessionId === prevSessionRef.current) return
    prevSessionRef.current = sessionId
    const api = apiRef.current
    if (!api || !sessionId) return

    void (async () => {
      try {
        const saved = (await window.electronAPI.invoke('dock-layout:get', sessionId)) as SerializedDockview | null
        if (saved && saved.grid && saved.panels) {
          api.fromJSON(saved)
          return
        }
      } catch {
        // ignore
      }
      // Clear and rebuild default if no saved layout
      api.clear()
      buildDefaultLayout(api)
    })()
  }, [sessionId, buildDefaultLayout])

  const togglePanel = useCallback((id: DockPanelId) => {
    const api = apiRef.current
    if (!api) return
    const panel = api.getPanel(id)
    if (panel) {
      // Panel exists — remove it
      api.removePanel(panel)
    } else {
      // Panel doesn't exist — add it back
      api.addPanel({
        id,
        component: id,
        title: PANEL_TITLES[id],
      })
    }
  }, [])

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
