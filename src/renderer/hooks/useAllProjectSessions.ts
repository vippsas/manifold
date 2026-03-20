import { useState, useEffect, useCallback } from 'react'
import type { AgentSession, Project } from '../../shared/types'
import { useIpcListener } from './useIpc'

interface UseAllProjectSessionsResult {
  sessionsByProject: Record<string, AgentSession[]>
  removeSession: (sessionId: string) => void
}

interface AgentSessionsChangedEvent {
  projectId: string
}

async function fetchProjectSessions(projectId: string): Promise<AgentSession[]> {
  try {
    return (await window.electronAPI.invoke('agent:sessions', projectId)) as AgentSession[]
  } catch {
    return []
  }
}

export function useAllProjectSessions(
  projects: Project[],
  activeProjectId: string | null,
  activeProjectSessions: AgentSession[]
): UseAllProjectSessionsResult {
  const [backgroundSessions, setBackgroundSessions] = useState<Record<string, AgentSession[]>>({})

  useEffect(() => {
    let cancelled = false

    const fetchAll = async (): Promise<void> => {
      const entries = await Promise.all(
        projects
          .filter((project) => project.id !== activeProjectId)
          .map(async (project) => [project.id, await fetchProjectSessions(project.id)] as const)
      )
      if (cancelled) return
      setBackgroundSessions(Object.fromEntries(entries))
    }

    void fetchAll()
    return () => {
      cancelled = true
    }
  }, [projects, activeProjectId])

  const refreshBackgroundProject = useCallback(async (projectId: string): Promise<void> => {
    const sessions = await fetchProjectSessions(projectId)
    setBackgroundSessions((prev) => ({ ...prev, [projectId]: sessions }))
  }, [])

  useIpcListener<AgentSessionsChangedEvent>(
    'agent:sessions-changed',
    useCallback(
      (event: AgentSessionsChangedEvent) => {
        if (event.projectId === activeProjectId) return
        if (!projects.some((project) => project.id === event.projectId)) return
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
  if (activeProjectId) {
    sessionsByProject[activeProjectId] = activeProjectSessions
  }

  return { sessionsByProject, removeSession }
}
