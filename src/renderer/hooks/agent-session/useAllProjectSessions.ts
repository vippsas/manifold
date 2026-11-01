import { useState, useEffect, useCallback, useRef } from 'react'
import type { AgentSession, AgentStatus, Project } from '../../../shared/types'
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
      await Promise.all(
        projectIds
          .filter((id) => id !== activeId)
          .map(async (id) => {
            const sessions = await fetchProjectSessions(id)
            if (cancelled || sessions === null) return
            // Apply this reply before waiting for slower repos, so subsequent
            // lifecycle events cannot be lost or overwritten by a delayed batch.
            setBackgroundSessions((prev) => {
              // Discovery started before a tab switch must not replace the newer
              // snapshot saved while that repo was active.
              if (snapshotVersions.current.get(id) !== versions.get(id)) return prev
              return { ...prev, [id]: sessions }
            })
          })
      )
      if (cancelled) return
      setBackgroundSessions((prev) => Object.fromEntries(projectIds.map((id) => [id, prev[id] ?? []])))
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

  const updateBackgroundSession = useCallback((sessionId: string, status: AgentStatus, clearPid = false): void => {
    const activeId = activeProjectRef.current
    const versions = new Map(snapshotVersions.current)
    setBackgroundSessions((prev) => {
      let next = prev
      for (const [projectId, sessions] of Object.entries(prev)) {
        // Active rows belong to useAgentSession. A queued event must also
        // leave a newer active/departure snapshot alone.
        if (projectId === activeId || projectId === activeProjectRef.current
          || snapshotVersions.current.get(projectId) !== versions.get(projectId)) continue
        const index = sessions.findIndex((session) => session.id === sessionId)
        if (index === -1) continue
        const session = sessions[index]
        if (session.status === status && (!clearPid || session.pid === null)) continue
        const updated = [...sessions]
        updated[index] = { ...session, status, ...(clearPid ? { pid: null } : {}) }
        if (next === prev) next = { ...prev }
        next[projectId] = updated
      }
      return next
    })
  }, [])

  useIpcListener<{ sessionId: string; status: AgentStatus }>(
    'agent:status',
    useCallback(({ sessionId, status }) => {
      updateBackgroundSession(sessionId, status)
    }, [updateBackgroundSession])
  )

  useIpcListener<{ sessionId: string }>(
    'agent:exit',
    useCallback(({ sessionId }) => {
      updateBackgroundSession(sessionId, 'done', true)
    }, [updateBackgroundSession])
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
