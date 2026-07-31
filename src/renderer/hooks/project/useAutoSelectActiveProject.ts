import { useEffect, useRef } from 'react'
import type { Project, AgentSession } from '../../../shared/types'

interface Args {
  sessionsByProject: Record<string, AgentSession[]>
  activeProjectId: string | null
  projects: Project[]
  setActiveProject: (id: string) => void
}

export function useAutoSelectActiveProject(args: Args): void {
  const { sessionsByProject, activeProjectId, projects, setActiveProject } = args
  const didAutoSelectRef = useRef(false)

  useEffect(() => {
    if (didAutoSelectRef.current) return
    const projectIds = Object.keys(sessionsByProject)
    if (projectIds.length < 2) return
    if ((activeProjectId ? sessionsByProject[activeProjectId] ?? [] : []).length > 0) {
      didAutoSelectRef.current = true
      return
    }
    const projectWithAgents = projects.find((p) => (sessionsByProject[p.id] ?? []).length > 0)
    if (projectWithAgents) {
      didAutoSelectRef.current = true
      setActiveProject(projectWithAgents.id)
    }
  }, [sessionsByProject, activeProjectId, projects, setActiveProject])
}
