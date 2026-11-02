import { useEffect, useRef } from 'react'
import type { Project, AgentSession } from '../../../shared/types'

interface Args {
  sessionsByProject: Record<string, AgentSession[]>
  backgroundDiscoverySettled: boolean
  activeProjectId: string | null
  loadedProjectId: string | null
  projects: Project[]
  setActiveProject: (id: string) => void
}

export function useAutoSelectActiveProject(args: Args): void {
  const { sessionsByProject, backgroundDiscoverySettled, activeProjectId, loadedProjectId, projects, setActiveProject } = args
  const didAutoSelectRef = useRef(false)

  useEffect(() => {
    if (didAutoSelectRef.current) return
    const projectIds = Object.keys(sessionsByProject)
    if (projectIds.length < 2) return
    if ((activeProjectId ? sessionsByProject[activeProjectId] ?? [] : []).length > 0) {
      didAutoSelectRef.current = true
      return
    }
    if (activeProjectId && loadedProjectId !== activeProjectId) return
    if (!backgroundDiscoverySettled) return
    const projectWithAgents = projects.find((p) => (sessionsByProject[p.id] ?? []).length > 0)
    if (projectWithAgents) {
      didAutoSelectRef.current = true
      setActiveProject(projectWithAgents.id)
    }
  }, [sessionsByProject, backgroundDiscoverySettled, activeProjectId, loadedProjectId, projects, setActiveProject])
}
