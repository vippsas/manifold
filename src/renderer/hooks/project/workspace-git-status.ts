import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceRepoStatus } from '../../../shared/workspace-types'
import { useIpcListener } from '../app/useIpc'
import { affectedWorkspaceProjects, type WorkspaceFilesChanged, type WorkspaceGitContext } from './workspace-git-events'

// Keep the badge's 3s tick; unchanged idle results back off to at most 5 ticks.
const POLL_INTERVAL_MS = 3000
const MAX_IDLE_TICKS = 5

export function countWorkspaceChangedFiles(repos: WorkspaceRepoStatus[]): number {
  const paths = new Set<string>()
  for (const repo of repos) {
    for (const change of [...repo.staged, ...repo.unstaged, ...repo.untracked]) {
      paths.add(`${repo.projectId}\0${change.path}`)
    }
  }
  return paths.size
}

/** Live git status for every checkout in the selected workspace. Kept above
 *  the sidebar so the activity-bar badge remains current while Source Control
 *  is closed. */
export function useWorkspaceRepoStatuses(workspaceId: string | null, context?: WorkspaceGitContext): {
  repos: WorkspaceRepoStatus[]
  changeCount: number
  refresh: () => void
} {
  const [reposByWorkspace, setReposByWorkspace] = useState<Map<string, WorkspaceRepoStatus[]>>(new Map())
  const requestIdsRef = useRef<Map<string, number>>(new Map())
  const inFlightRef = useRef<Set<string>>(new Set())

  const pendingRef = useRef(new Map<string, Set<string> | null>())
  const modelsRef = useRef(new Map<string, WorkspaceRepoStatus[]>())
  const selectedRef = useRef(workspaceId)
  selectedRef.current = workspaceId
  const mountedRef = useRef(false)
  const pollRef = useRef({ interval: 1, remaining: 1, activity: 0 })

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refreshRepos = useCallback((projectIds?: string[], resetPolling = true): void => {
    if (!workspaceId) return
    const id = workspaceId
    if (resetPolling) {
      pollRef.current = { interval: 1, remaining: 1, activity: pollRef.current.activity + 1 }
    }
    const selection = projectIds ? new Set(projectIds) : null
    const pending = pendingRef.current.get(workspaceId)
    pendingRef.current.set(workspaceId, pending === null || selection === null
      ? null : new Set([...(pending ?? []), ...selection]))
    const activity = pollRef.current.activity

    function drain(): void {
      if (!mountedRef.current || selectedRef.current !== id || document.hidden
        || inFlightRef.current.has(id) || !pendingRef.current.has(id)) return
      const selected = pendingRef.current.get(id)
      if (selected === undefined) return
      pendingRef.current.delete(id)
      const requestId = (requestIdsRef.current.get(id) ?? 0) + 1
      requestIdsRef.current.set(id, requestId)
      inFlightRef.current.add(id)
      const args = selected === null ? [] : [[...selected]]
      void window.electronAPI.invoke('git:workspace-status', workspaceId, ...args)
        .then((result) => {
          if (!mountedRef.current || requestIdsRef.current.get(id) !== requestId) return
          const rows = result as WorkspaceRepoStatus[]
          const previous = modelsRef.current.get(id) ?? []
          const repos = selected === null ? rows : [...new Map([...previous, ...rows].map((row) => [row.projectId, row])).values()]
          if (!resetPolling && selectedRef.current === workspaceId && pollRef.current.activity === activity) {
            pollRef.current.interval = JSON.stringify(previous) === JSON.stringify(repos)
              ? Math.min(MAX_IDLE_TICKS, pollRef.current.interval * 2) : 1
            pollRef.current.remaining = pollRef.current.interval
          }
          modelsRef.current.set(id, repos)
          setReposByWorkspace((current) => new Map(current).set(id, repos))
        })
        .catch((err: unknown) => {
          console.error('[SourceControl] failed to load workspace git status', err)
        })
        .finally(() => {
          inFlightRef.current.delete(id)
          drain()
        })
    }
    drain()
  }, [workspaceId])
  const refresh = useCallback((): void => { refreshRepos() }, [refreshRepos])

  useEffect(() => { refresh() }, [refresh])
  useIpcListener<WorkspaceFilesChanged>('files:changed', (event) => {
    const affected = affectedWorkspaceProjects(event, context)
    if (affected?.length === 0) return
    refreshRepos(affected)
  })
  useIpcListener('workspace:list-changed', () => { refresh() })
  useEffect(() => {
    const onFocus = (): void => { refresh() }
    const onVisibility = (): void => { if (!document.hidden) refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  // Dormant sessions aren't polled by FileWatcher. This bounded reconciliation
  // also catches editor/external edits and branch/upstream changes with no event,
  // keeping the badge current even with Source Control closed. Every trigger
  // shares the visibility and single-flight guards above.
  useEffect(() => {
    if (!workspaceId) return
    const timer = setInterval(() => {
      if (document.hidden || inFlightRef.current.has(workspaceId)) return
      if (--pollRef.current.remaining > 0) return
      pollRef.current.remaining = pollRef.current.interval
      refreshRepos(undefined, false)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [workspaceId, refreshRepos])

  // Index by the requested workspace during render so a selection change can
  // never briefly pair the new workspace header with the previous one's rows.
  const repos = workspaceId ? reposByWorkspace.get(workspaceId) ?? [] : []
  return { repos, changeCount: countWorkspaceChangedFiles(repos), refresh }
}
