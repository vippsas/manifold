import { useCallback } from 'react'
import type { CreateProjectOptions, SpawnAgentOptions, AgentSession, Project } from '../../shared/types'
import { deriveBranchName } from '../../shared/derive-branch-name'
import { pickRandomNorwegianCityName } from '../../shared/norwegian-cities'

interface Args {
  createNewProject: (options: CreateProjectOptions) => Promise<Project | null>
  addProject: (path?: string) => Promise<void>
  cloneProject: (url: string) => Promise<boolean>
  spawnAgent: (options: SpawnAgentOptions) => Promise<AgentSession | null>
  defaultRuntime: string
  appEffects: {
    setCreatingProject: (v: boolean) => void
    setCloningProject: (v: boolean) => void
    setShowOnboarding: (v: boolean) => void
  }
}

export interface UseProjectCreateHandlersResult {
  handleCreateNewProject: (options: CreateProjectOptions) => Promise<boolean>
  handleAddProjectFromOnboarding: (path?: string) => Promise<void>
  handleCloneFromOnboarding: (url: string) => Promise<boolean>
}

export function useProjectCreateHandlers(args: Args): UseProjectCreateHandlersResult {
  const { createNewProject, addProject, cloneProject, spawnAgent, defaultRuntime, appEffects } = args

  const handleCreateNewProject = useCallback(async (options: CreateProjectOptions): Promise<boolean> => {
    appEffects.setCreatingProject(true)
    try {
      const project = await createNewProject(options)
      if (!project) return false
      appEffects.setShowOnboarding(false)
      let branchName = deriveBranchName(pickRandomNorwegianCityName(), project.name)
      try {
        const suggested = await window.electronAPI.invoke('branch:suggest', project.id) as string
        if (typeof suggested === 'string' && suggested.trim()) branchName = suggested
      } catch {
        // Keep the city-based fallback if branch suggestion fails.
      }
      void spawnAgent({
        projectId: project.id,
        runtimeId: defaultRuntime,
        prompt: options.description,
        branchName,
      })
      return true
    } finally {
      appEffects.setCreatingProject(false)
    }
  }, [createNewProject, spawnAgent, defaultRuntime, appEffects])

  const handleAddProjectFromOnboarding = useCallback(async (path?: string): Promise<void> => {
    await addProject(path)
    appEffects.setShowOnboarding(false)
  }, [addProject, appEffects])

  const handleCloneFromOnboarding = useCallback(async (url: string): Promise<boolean> => {
    appEffects.setCloningProject(true)
    try {
      const ok = await cloneProject(url)
      if (ok) appEffects.setShowOnboarding(false)
      return ok
    } finally {
      appEffects.setCloningProject(false)
    }
  }, [cloneProject, appEffects])

  return { handleCreateNewProject, handleAddProjectFromOnboarding, handleCloneFromOnboarding }
}
