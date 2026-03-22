import { useCallback, useEffect, useState } from 'react'
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
  fileSearchRequestKey: number
  searchFocusRequestKey: number
  showOnboarding: boolean
  setShowOnboarding: (show: boolean) => void
  creatingProject: boolean
  setCreatingProject: (v: boolean) => void
  cloningProject: boolean
  setCloningProject: (v: boolean) => void
  handleFilesChanged: () => void
}

export function useAppEffects(input: AppEffectsInput): AppEffectsResult {
  const [fileSearchRequestKey] = useState(0)
  const [searchFocusRequestKey, setSearchFocusRequestKey] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [cloningProject, setCloningProject] = useState(false)

  useEffect(() => {
    return window.electronAPI.on('view:toggle-panel', (panelId: unknown) => {
      input.dockLayout.togglePanel(panelId as DockPanelId)
    })
  }, [input.dockLayout.togglePanel])

  useEffect(() => {
    return window.electronAPI.on('view:show-search', () => {
      if (!input.dockLayout.isPanelVisible('search')) {
        input.dockLayout.togglePanel('search')
      }
      setSearchFocusRequestKey((prev) => prev + 1)
      queueMicrotask(() => {
        input.dockLayout.apiRef.current?.getPanel('search')?.api.setActive()
      })
    })
  }, [input.dockLayout.apiRef, input.dockLayout.isPanelVisible, input.dockLayout.togglePanel])

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
    fileSearchRequestKey, searchFocusRequestKey, showOnboarding, setShowOnboarding,
    creatingProject, setCreatingProject, cloningProject, setCloningProject,
    handleFilesChanged,
  }
}
