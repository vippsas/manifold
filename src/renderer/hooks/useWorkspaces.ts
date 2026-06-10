import { useCallback, useEffect, useState } from 'react'
import type { Workspace, WorkspaceCreateOptions, WorkspaceSpawnAgentOptions } from '../../shared/workspace-types'
import type { AgentSession } from '../../shared/types'

export interface UseWorkspacesResult {
  workspaces: Workspace[]
  createWorkspace: (opts: WorkspaceCreateOptions) => Promise<Workspace>
  removeWorkspace: (id: string) => Promise<void>
  addProject: (id: string, projectId: string) => Promise<void>
  removeProject: (id: string, projectId: string) => Promise<void>
  spawnAgent: (id: string, opts: WorkspaceSpawnAgentOptions) => Promise<AgentSession>
}

export function useWorkspaces(): UseWorkspacesResult {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])

  const refresh = useCallback(async () => {
    try {
      const list = await window.electronAPI.invoke('workspace:list')
      setWorkspaces(list as Workspace[])
    } catch (err) {
      console.error('[useWorkspaces] failed to refresh workspace list', err)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const off = window.electronAPI.on('workspace:list-changed', () => { void refresh() })
    return off
  }, [refresh])

  const createWorkspace = useCallback(async (opts: WorkspaceCreateOptions) => {
    const w = (await window.electronAPI.invoke('workspace:create', opts)) as Workspace
    await refresh()
    return w
  }, [refresh])

  const removeWorkspace = useCallback(async (id: string) => {
    await window.electronAPI.invoke('workspace:remove', id)
    await refresh()
  }, [refresh])

  const addProject = useCallback(async (id: string, projectId: string) => {
    await window.electronAPI.invoke('workspace:add-project', id, projectId)
    await refresh()
  }, [refresh])

  const removeProject = useCallback(async (id: string, projectId: string) => {
    await window.electronAPI.invoke('workspace:remove-project', id, projectId)
    await refresh()
  }, [refresh])

  const spawnAgent = useCallback(async (id: string, opts: WorkspaceSpawnAgentOptions) => {
    return (await window.electronAPI.invoke('workspace:spawn-agent', id, opts)) as AgentSession
  }, [])

  return { workspaces, createWorkspace, removeWorkspace, addProject, removeProject, spawnAgent }
}
