import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchMode } from '../../shared/search-types'
import type { DockPanelId, UseDockLayoutResult } from './useDockLayout'
import type { SpawnAgentOptions } from '../../shared/types'
import { ensureSearchPanelInWorkspace } from './dock-layout-search'

interface AppEffectsInput {
  activeSessionId: string | null
  dockLayout: UseDockLayoutResult
  webPreviewUrl: string | null
  settings: { defaultRuntime: string }
  setActiveProject: (id: string) => void
  spawnAgent: (options: SpawnAgentOptions) => Promise<any>
  refreshOpenFiles: () => Promise<void>
  refreshDiff: () => Promise<void>
}

export interface AppEffectsResult {
  searchFocusRequestKey: number
  requestedSearchMode: SearchMode | null
  showOnboarding: boolean
  setShowOnboarding: (show: boolean) => void
  creatingProject: boolean
  setCreatingProject: (v: boolean) => void
  cloningProject: boolean
  setCloningProject: (v: boolean) => void
  showSearchPanel: (mode: SearchMode) => void
  handleFilesChanged: () => void
}

export function useAppEffects(input: AppEffectsInput): AppEffectsResult {
  const [searchFocusRequestKey, setSearchFocusRequestKey] = useState(0)
  const [requestedSearchMode, setRequestedSearchMode] = useState<SearchMode | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [cloningProject, setCloningProject] = useState(false)
  const agentRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showSearchPanel = useCallback((mode: SearchMode) => {
    const api = input.dockLayout.apiRef.current
    if (api) {
      ensureSearchPanelInWorkspace(api, input.dockLayout.editorPanelIds)
    } else if (!input.dockLayout.isPanelVisible('search')) {
      input.dockLayout.togglePanel('search')
    }
    setRequestedSearchMode(mode)
    setSearchFocusRequestKey((prev) => prev + 1)
    queueMicrotask(() => {
      const panel = input.dockLayout.apiRef.current?.getPanel('search')
      panel?.api.setActive()
    })
  }, [input.dockLayout.apiRef, input.dockLayout.editorPanelIds, input.dockLayout.isPanelVisible, input.dockLayout.togglePanel])

  useEffect(() => {
    return window.electronAPI.on('view:toggle-panel', (panelId: unknown) => {
      input.dockLayout.togglePanel(panelId as DockPanelId)
    })
  }, [input.dockLayout.togglePanel])

  useEffect(() => {
    return window.electronAPI.on('view:show-search', () => {
      showSearchPanel('code')
    })
  }, [showSearchPanel])

  useEffect(() => {
    return window.electronAPI.on('app:auto-spawn', (...args: unknown[]) => {
      const projectId = args[0] as string | undefined
      const branchName = args[1] as string | undefined
      const noWorktree = args[2] as boolean | undefined
      if (typeof projectId !== 'string') return
      input.setActiveProject(projectId)
      void input.spawnAgent({
        projectId,
        runtimeId: input.settings.defaultRuntime,
        prompt: '',
        existingBranch: branchName,
        noWorktree: noWorktree ?? false,
      })
    })
  }, [input.setActiveProject, input.spawnAgent, input.settings.defaultRuntime])

  const flushOpenFileRefresh = useCallback(() => {
    if (agentRefreshTimerRef.current) {
      clearTimeout(agentRefreshTimerRef.current)
      agentRefreshTimerRef.current = null
    }
    void input.refreshOpenFiles()
  }, [input.refreshOpenFiles])

  const scheduleOpenFileRefresh = useCallback(() => {
    if (agentRefreshTimerRef.current) {
      clearTimeout(agentRefreshTimerRef.current)
    }

    agentRefreshTimerRef.current = setTimeout(() => {
      agentRefreshTimerRef.current = null
      void input.refreshOpenFiles()
    }, 150)
  }, [input.refreshOpenFiles])

  useEffect(() => {
    return () => {
      if (agentRefreshTimerRef.current) {
        clearTimeout(agentRefreshTimerRef.current)
        agentRefreshTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (agentRefreshTimerRef.current) {
      clearTimeout(agentRefreshTimerRef.current)
      agentRefreshTimerRef.current = null
    }
  }, [input.activeSessionId])

  useEffect(() => {
    return window.electronAPI.on('agent:activity', (event: unknown) => {
      const payload = event as { sessionId?: string }
      if (!input.activeSessionId || payload.sessionId !== input.activeSessionId) return
      scheduleOpenFileRefresh()
    })
  }, [input.activeSessionId, scheduleOpenFileRefresh])

  useEffect(() => {
    return window.electronAPI.on('agent:status', (event: unknown) => {
      const payload = event as { sessionId?: string; status?: string }
      if (!input.activeSessionId || payload.sessionId !== input.activeSessionId) return
      if (payload.status !== 'waiting' && payload.status !== 'done') return

      flushOpenFileRefresh()
      void input.refreshDiff()
    })
  }, [flushOpenFileRefresh, input.activeSessionId, input.refreshDiff])

  useEffect(() => {
    const api = input.dockLayout.apiRef.current
    if (!api) return
    if (input.webPreviewUrl) {
      if (!api.getPanel('webPreview')) {
        const editorPanel = input.dockLayout.editorPanelIds[0]
          ? api.getPanel(input.dockLayout.editorPanelIds[0])
          : api.getPanel('editor')
        api.addPanel({
          id: 'webPreview', component: 'webPreview', title: 'Preview',
          position: editorPanel ? { referencePanel: editorPanel, direction: 'within' } : undefined,
        })
      }
    }
  }, [input.webPreviewUrl, input.dockLayout.apiRef, input.dockLayout.editorPanelIds])

  const handleFilesChanged = useCallback(() => {
    void input.refreshOpenFiles()
    void input.refreshDiff()
  }, [input.refreshOpenFiles, input.refreshDiff])

  return {
    searchFocusRequestKey, requestedSearchMode, showOnboarding, setShowOnboarding,
    creatingProject, setCreatingProject, cloningProject, setCloningProject,
    showSearchPanel,
    handleFilesChanged,
  }
}
