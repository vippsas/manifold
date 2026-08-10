import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceRepoStatus } from '../../../shared/workspace-types'
import { useIpcListener } from '../app/useIpc'

export function countWorkspaceChangedFiles(repos: WorkspaceRepoStatus[]): number {
  const paths = new Set<string>()
  for (const repo of repos) {
    for (const change of [...repo.staged, ...repo.unstaged]) {
      paths.add(`${repo.projectId}\0${change.path}`)
    }
  }
  return paths.size
}

/** Live git status for every checkout in the selected workspace. Kept above
 *  the sidebar so the activity-bar badge remains current while Source Control
 *  is closed. */
export function useWorkspaceRepoStatuses(workspaceId: string | null): {
  repos: WorkspaceRepoStatus[]
  changeCount: number
  refresh: () => void
} {
  const [repos, setRepos] = useState<WorkspaceRepoStatus[]>([])
  const requestIdRef = useRef(0)

  const refresh = useCallback((): void => {
    const requestId = ++requestIdRef.current
    if (!workspaceId) {
      setRepos([])
      return
    }
    void window.electronAPI.invoke('git:workspace-status', workspaceId)
      .then((result) => {
        // Drop responses that arrive after the workspace selection moved on.
        if (requestId === requestIdRef.current) setRepos(result as WorkspaceRepoStatus[])
      })
      .catch((err: unknown) => {
        console.error('[SourceControl] failed to load workspace git status', err)
      })
  }, [workspaceId])

  useEffect(() => { refresh() }, [refresh])
  useIpcListener('files:changed', () => { refresh() })
  useIpcListener('workspace:list-changed', () => { refresh() })
  useEffect(() => {
    const onFocus = (): void => { refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return { repos, changeCount: countWorkspaceChangedFiles(repos), refresh }
}
