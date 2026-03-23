import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchMode } from '../../shared/search-types'
import type { DockPanelId, UseDockLayoutResult } from './useDockLayout'
import type { SpawnAgentOptions } from '../../shared/types'
import type { PendingLaunchAction } from '../../shared/mode-switch-types'
import { ensureSearchPanelInWorkspace } from './dock-layout-search'

interface AppEffectsInput {
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
  const lastAutoOpenedPreviewUrlRef = useRef<string | null>(null)

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

  const openDeveloperLaunch = useCallback((projectId: string, branchName?: string, runtimeId?: string) => {
    input.setActiveProject(projectId)
    void input.spawnAgent({
      projectId,
      runtimeId: runtimeId || input.settings.defaultRuntime,
      prompt: '',
      existingBranch: branchName,
      noWorktree: false,
    })
  }, [input.setActiveProject, input.spawnAgent, input.settings.defaultRuntime])

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
    let cancelled = false
    void (async () => {
      const pending = await window.electronAPI.invoke('app:consume-pending-launch') as PendingLaunchAction | null
      if (cancelled || !pending || pending.kind !== 'developer') return
      openDeveloperLaunch(pending.projectId, pending.branchName, pending.runtimeId)
    })()
    return () => { cancelled = true }
  }, [openDeveloperLaunch])

  useEffect(() => {
    return window.electronAPI.on('app:auto-spawn', (...args: unknown[]) => {
      const projectId = args[0] as string | undefined
      const branchName = args[1] as string | undefined
      const runtimeId = args[3] as string | undefined
      if (typeof projectId !== 'string') return
      openDeveloperLaunch(projectId, branchName, runtimeId)
    })
  }, [openDeveloperLaunch])

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
        id: 'webPreview', component: 'webPreview', title: 'Preview',
        position: editorPanel ? { referencePanel: editorPanel, direction: 'within' } : undefined,
      })
    }
    lastAutoOpenedPreviewUrlRef.current = input.webPreviewUrl
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
