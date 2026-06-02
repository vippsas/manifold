import { useEffect, useRef } from 'react'
import type { Project, AgentSession } from '../../shared/types'
import { filterStandaloneProjectSessions } from '../session-selection'

interface Args {
  sessionsByProject: Record<string, AgentSession[]>
  activeProjectId: string | null
  projects: Project[]
  setActiveProject: (id: string) => void
  suppressedProjectIds: ReadonlySet<string>
}

export function useAutoSelectActiveProject(args: Args): void {
  const {
    sessionsByProject, activeProjectId, projects, setActiveProject,
    suppressedProjectIds,
  } = args
  const didAutoSelectRef = useRef(false)

  useEffect(() => {
    if (didAutoSelectRef.current) return
    const projectIds = Object.keys(sessionsByProject)
    if (projectIds.length < 2) return
    const currentSessions = activeProjectId && !suppressedProjectIds.has(activeProjectId)
      ? filterStandaloneProjectSessions(sessionsByProject[activeProjectId] ?? [])
      : []
    if (currentSessions.length > 0) {
      didAutoSelectRef.current = true
      return
    }
    const projectWithAgents = projects.find((p) => (
      !suppressedProjectIds.has(p.id)
      && filterStandaloneProjectSessions(sessionsByProject[p.id] ?? []).length > 0
    ))
    if (projectWithAgents) {
      didAutoSelectRef.current = true
      setActiveProject(projectWithAgents.id)
    }
  }, [sessionsByProject, activeProjectId, projects, setActiveProject, suppressedProjectIds])
}
