import { useState, useEffect, useCallback, useRef } from 'react'
import type { AgentSession, Project } from '../../../shared/types'
import { useIpcListener } from '../app/useIpc'

interface UseAllProjectSessionsResult {
  sessionsByProject: Record<string, AgentSession[]>
  removeSession: (sessionId: string) => void
}

interface AgentSessionsChangedEvent {
  projectId: string
}

async function fetchProjectSessions(projectId: string): Promise<AgentSession[] | null> {
  try {
    return (await window.electronAPI.invoke('agent:sessions', projectId)) as AgentSession[]
  } catch {
    return null
  }
}

export function useAllProjectSessions(
  projects: Project[],
  activeProjectId: string | null,
  activeProjectSessions: AgentSession[],
  loadedProjectId: string | null
): UseAllProjectSessionsResult {
  const [backgroundSessions, setBackgroundSessions] = useState<Record<string, AgentSession[]>>({})
  const activeProjectRef = useRef(activeProjectId)
  activeProjectRef.current = activeProjectId
  const previousActiveProjectRef = useRef(activeProjectId)
  const snapshotVersions = useRef(new Map<string, number>())
  const dirtyProjects = useRef(new Set<string>())
  // Metadata-only registry updates must not trigger worktree discovery.
  const projectIdsKey = JSON.stringify(projects.map(({ id }) => id).sort())

  // Keep a snapshot before this repo becomes a background repo. Its next IPC
  // refresh may finish after the incoming repo loads; its tabs must survive.
  // A late spawn reply can append a foreign session after a repo switch.
  // Nonempty rows identify their repo before a post-spawn resync finishes.
  useEffect(() => {
    if (!activeProjectId
      || (activeProjectSessions.length === 0 && loadedProjectId !== activeProjectId)
      || activeProjectSessions.some((s) => s.projectId !== activeProjectId)) return
    snapshotVersions.current.set(activeProjectId, (snapshotVersions.current.get(activeProjectId) ?? 0) + 1)
    setBackgroundSessions((prev) => {
      const cached = prev[activeProjectId]
      if (cached && cached.length === activeProjectSessions.length
        && cached.every((s, i) => s === activeProjectSessions[i])) return prev
      return { ...prev, [activeProjectId]: activeProjectSessions }
    })
  }, [activeProjectId, activeProjectSessions, loadedProjectId])

  useEffect(() => {
    let cancelled = false
    const projectIds = JSON.parse(projectIdsKey) as string[]
    const activeId = activeProjectRef.current
    const versions = new Map(snapshotVersions.current)

    const fetchAll = async (): Promise<void> => {
      const entries = await Promise.all(
        projectIds
          .filter((id) => id !== activeId)
          .map(async (id) => [id, await fetchProjectSessions(id)] as const)
      )
      if (cancelled) return
      setBackgroundSessions((prev) => {
        const next = Object.fromEntries(projectIds.map((id) => [id, prev[id] ?? []]))
        for (const [id, sessions] of entries) {
          // Discovery started before a tab switch must not replace the newer
          // snapshot saved while that repo was active.
          if (sessions !== null && snapshotVersions.current.get(id) === versions.get(id)) next[id] = sessions
        }
        return next
      })
    }

    void fetchAll()
    return () => {
      cancelled = true
    }
  }, [projectIdsKey])

  const refreshBackgroundProject = useCallback(async (projectId: string): Promise<void> => {
    const version = snapshotVersions.current.get(projectId)
    const sessions = await fetchProjectSessions(projectId)
    if (sessions === null || snapshotVersions.current.get(projectId) !== version) return
    // Reentry can invalidate a pending reply; keep it dirty until one applies.
    dirtyProjects.current.delete(projectId)
    setBackgroundSessions((prev) => ({ ...prev, [projectId]: sessions }))
  }, [])

  useEffect(() => {
    const previous = previousActiveProjectRef.current
    previousActiveProjectRef.current = activeProjectId
    // A switch discards the active hook's pending discovery. Recover initial
    // loads and event-driven resyncs with one discovery of the departing repo.
    if (previous && previous !== activeProjectId
      && (dirtyProjects.current.has(previous) || !snapshotVersions.current.has(previous))
      && projects.some((project) => project.id === previous)) {
      void refreshBackgroundProject(previous)
    }
  }, [activeProjectId, projects, refreshBackgroundProject])

  useIpcListener<AgentSessionsChangedEvent>(
    'agent:sessions-changed',
    useCallback(
      (event: AgentSessionsChangedEvent) => {
        if (!projects.some((project) => project.id === event.projectId)) return
        if (event.projectId === activeProjectId) {
          dirtyProjects.current.add(event.projectId)
          return
        }
        void refreshBackgroundProject(event.projectId)
      },
      [activeProjectId, projects, refreshBackgroundProject]
    )
  )

  const removeSession = useCallback((sessionId: string): void => {
    setBackgroundSessions((prev) => {
      const next: Record<string, AgentSession[]> = {}
      for (const [projectId, sessions] of Object.entries(prev)) {
        next[projectId] = sessions.filter((s) => s.id !== sessionId)
      }
      return next
    })
  }, [])

  const sessionsByProject: Record<string, AgentSession[]> = { ...backgroundSessions }
  if (activeProjectId && (activeProjectSessions.length > 0 || loadedProjectId === activeProjectId)
    && activeProjectSessions.every((s) => s.projectId === activeProjectId)) {
    sessionsByProject[activeProjectId] = activeProjectSessions
  }

  return { sessionsByProject, removeSession }
}
