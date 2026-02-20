import { useState, useEffect, useCallback } from 'react'
import type { AgentSession, Project } from '../../shared/types'

interface UseAllProjectSessionsResult {
  sessionsByProject: Record<string, AgentSession[]>
  removeSession: (sessionId: string) => void
}

export function useAllProjectSessions(
  projects: Project[],
  activeProjectId: string | null,
  activeProjectSessions: AgentSession[]
): UseAllProjectSessionsResult {
  const [backgroundSessions, setBackgroundSessions] = useState<Record<string, AgentSession[]>>({})

  useEffect(() => {
    const fetchAll = async (): Promise<void> => {
      const result: Record<string, AgentSession[]> = {}
      for (const project of projects) {
        if (project.id === activeProjectId) continue
        try {
          result[project.id] = (await window.electronAPI.invoke(
            'agent:sessions',
            project.id
          )) as AgentSession[]
        } catch {
          result[project.id] = []
        }
      }
      setBackgroundSessions(result)
    }
    void fetchAll()
  }, [projects, activeProjectId])

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
