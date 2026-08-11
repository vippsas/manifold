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
  const [reposByWorkspace, setReposByWorkspace] = useState<Map<string, WorkspaceRepoStatus[]>>(new Map())
  const requestIdsRef = useRef<Map<string, number>>(new Map())

  const refresh = useCallback((): void => {
    if (!workspaceId) return
    const requestId = (requestIdsRef.current.get(workspaceId) ?? 0) + 1
    requestIdsRef.current.set(workspaceId, requestId)
    void window.electronAPI.invoke('git:workspace-status', workspaceId)
      .then((result) => {
        // Keep each workspace's last model alive while it is out of view, and
        // drop only an older request for that same workspace. Switching back
        // can then paint immediately while this refresh runs in the background.
        if (requestIdsRef.current.get(workspaceId) !== requestId) return
        setReposByWorkspace((current) => {
          const next = new Map(current)
          next.set(workspaceId, result as WorkspaceRepoStatus[])
          return next
        })
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

  // Index by the requested workspace during render so a selection change can
  // never briefly pair the new workspace header with the previous one's rows.
  const repos = workspaceId ? reposByWorkspace.get(workspaceId) ?? [] : []
  return { repos, changeCount: countWorkspaceChangedFiles(repos), refresh }
}
