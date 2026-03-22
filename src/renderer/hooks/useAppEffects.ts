import { useCallback, useEffect, useState } from 'react'
import type { SearchMode } from '../../shared/search-types'
import type { DockPanelId, UseDockLayoutResult } from './useDockLayout'
import type { SpawnAgentOptions } from '../../shared/types'

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

  const showSearchPanel = useCallback((mode: SearchMode) => {
    if (!input.dockLayout.isPanelVisible('search')) {
      input.dockLayout.togglePanel('search')
    }
    setRequestedSearchMode(mode)
    setSearchFocusRequestKey((prev) => prev + 1)
    queueMicrotask(() => {
      input.dockLayout.apiRef.current?.getPanel('search')?.api.setActive()
    })
  }, [input.dockLayout.apiRef, input.dockLayout.isPanelVisible, input.dockLayout.togglePanel])

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
