import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchMode } from '../../shared/search-types'
import type { UseDockLayoutResult } from './dock-layout/useDockLayout'
import type { SpawnAgentOptions } from '../../shared/types'
import type { PendingLaunchAction } from '../../shared/mode-switch-types'

interface AppEffectsInput {
  activeSessionId: string | null
  dockLayout: UseDockLayoutResult
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
  focusSearch: (mode: SearchMode) => void
  handleFilesChanged: () => void
}

export function useAppEffects(input: AppEffectsInput): AppEffectsResult {
  const [searchFocusRequestKey, setSearchFocusRequestKey] = useState(0)
  const [requestedSearchMode, setRequestedSearchMode] = useState<SearchMode | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [cloningProject, setCloningProject] = useState(false)
  const agentRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus the title-bar search omnibox. The bumped request key + requested
  // mode are forwarded to TitleBarSearch, which focuses its input and switches
  // scope. (There is no longer a separate Search dock panel.)
  const focusSearch = useCallback((mode: SearchMode) => {
    setRequestedSearchMode(mode)
    setSearchFocusRequestKey((prev) => prev + 1)
  }, [])

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

  // A plugin asked the app to surface an agent session's panel (manifold.agents
  // AgentSession.reveal — e.g. the watch plugin's "Open agent" button).
  useEffect(() => window.electronAPI.on('plugins:reveal-session', (...args: unknown[]) => {
    const [sessionId, title] = args as [unknown, unknown]
    if (typeof sessionId !== 'string' || sessionId.length === 0) return
    input.dockLayout.openSiblingPanel(sessionId, typeof title === 'string' ? title : undefined)
  }), [input.dockLayout.openSiblingPanel])

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
    focusSearch,
    handleFilesChanged,
  }
}
