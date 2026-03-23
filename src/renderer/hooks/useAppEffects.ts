import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchMode } from '../../shared/search-types'
import type { DockPanelId, UseDockLayoutResult } from './useDockLayout'
import type { SpawnAgentOptions } from '../../shared/types'
import type { PendingLaunchAction } from '../../shared/mode-switch-types'
import { ensureSearchPanelInWorkspace } from './dock-layout-search'

interface AppEffectsInput {
  activeSessionId: string | null
  dockLayout: UseDockLayoutResult
  webPreviewUrl: string | null
  settings: { defaultRuntime: string }
  setActiveProject: (id: string) => void
  spawnAgent: (options: SpawnAgentOptions) => Promise<unknown>
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
  const lastAutoOpenedPreviewUrlRef = useRef<string | null>(null)
  const agentRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showSearchPanel = useCallback((mode: SearchMode) => {
    const api = input.dockLayout.apiRef.current
    if (api) ensureSearchPanelInWorkspace(api, input.dockLayout.editorPanelIds)
    else if (!input.dockLayout.isPanelVisible('search')) input.dockLayout.togglePanel('search')
    setRequestedSearchMode(mode)
    setSearchFocusRequestKey((prev) => prev + 1)
    queueMicrotask(() => input.dockLayout.apiRef.current?.getPanel('search')?.api.setActive())
  }, [input.dockLayout])

  const openDeveloperLaunch = useCallback((projectId: string, branchName?: string, runtimeId?: string, noWorktree?: boolean) => {
    input.setActiveProject(projectId)
    void input.spawnAgent({
      projectId,
      runtimeId: runtimeId || input.settings.defaultRuntime,
      prompt: '',
      existingBranch: branchName,
      noWorktree: noWorktree ?? false,
    })
  }, [input.setActiveProject, input.settings.defaultRuntime, input.spawnAgent])

  const flushOpenFileRefresh = useCallback(() => {
    if (agentRefreshTimerRef.current) clearTimeout(agentRefreshTimerRef.current)
    agentRefreshTimerRef.current = null
    void input.refreshOpenFiles()
  }, [input.refreshOpenFiles])

  const scheduleOpenFileRefresh = useCallback(() => {
    if (agentRefreshTimerRef.current) clearTimeout(agentRefreshTimerRef.current)
    agentRefreshTimerRef.current = setTimeout(() => {
      agentRefreshTimerRef.current = null
      void input.refreshOpenFiles()
    }, 150)
  }, [input.refreshOpenFiles])

  useEffect(() => window.electronAPI.on('view:toggle-panel', (panelId: unknown) => {
    input.dockLayout.togglePanel(panelId as DockPanelId)
  }), [input.dockLayout.togglePanel])

  useEffect(() => window.electronAPI.on('view:show-search', () => {
    showSearchPanel('code')
  }), [showSearchPanel])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const pending = await window.electronAPI.invoke('app:consume-pending-launch') as PendingLaunchAction | null
      if (cancelled || !pending || pending.kind !== 'developer') return
      openDeveloperLaunch(pending.projectId, pending.branchName, pending.runtimeId, false)
    })()
    return () => { cancelled = true }
  }, [openDeveloperLaunch])

  useEffect(() => window.electronAPI.on('app:auto-spawn', (...args: unknown[]) => {
    const projectId = args[0] as string | undefined
    if (!projectId) return
    openDeveloperLaunch(projectId, args[1] as string | undefined, args[3] as string | undefined, args[2] as boolean | undefined)
  }), [openDeveloperLaunch])

  useEffect(() => () => {
    if (agentRefreshTimerRef.current) clearTimeout(agentRefreshTimerRef.current)
  }, [])

  useEffect(() => {
    if (agentRefreshTimerRef.current) clearTimeout(agentRefreshTimerRef.current)
    agentRefreshTimerRef.current = null
  }, [input.activeSessionId])

  useEffect(() => window.electronAPI.on('agent:activity', (event: unknown) => {
    const payload = event as { sessionId?: string }
    if (!input.activeSessionId || payload.sessionId !== input.activeSessionId) return
    scheduleOpenFileRefresh()
  }), [input.activeSessionId, scheduleOpenFileRefresh])

  useEffect(() => window.electronAPI.on('agent:status', (event: unknown) => {
    const payload = event as { sessionId?: string; status?: string }
    if (!input.activeSessionId || payload.sessionId !== input.activeSessionId) return
    if (payload.status !== 'waiting' && payload.status !== 'done') return
    flushOpenFileRefresh()
    void input.refreshDiff()
  }), [flushOpenFileRefresh, input.activeSessionId, input.refreshDiff])

  useEffect(() => {
    const api = input.dockLayout.apiRef.current
    if (!input.webPreviewUrl) {
      lastAutoOpenedPreviewUrlRef.current = null
      return
    }
    if (!api || input.webPreviewUrl === lastAutoOpenedPreviewUrlRef.current) return
    if (!api.getPanel('webPreview')) {
      const editorPanel = input.dockLayout.editorPanelIds[0]
        ? api.getPanel(input.dockLayout.editorPanelIds[0])
        : api.getPanel('editor')
      api.addPanel({
        id: 'webPreview',
        component: 'webPreview',
        title: 'Preview',
        position: editorPanel ? { referencePanel: editorPanel, direction: 'within' } : undefined,
      })
    }
    lastAutoOpenedPreviewUrlRef.current = input.webPreviewUrl
  }, [input.dockLayout.apiRef, input.dockLayout.editorPanelIds, input.webPreviewUrl])

  const handleFilesChanged = useCallback(() => {
    void input.refreshOpenFiles()
    void input.refreshDiff()
  }, [input.refreshDiff, input.refreshOpenFiles])

  return {
    searchFocusRequestKey,
    requestedSearchMode,
    showOnboarding,
    setShowOnboarding,
    creatingProject,
    setCreatingProject,
    cloningProject,
    setCloningProject,
    showSearchPanel,
    handleFilesChanged,
  }
}
