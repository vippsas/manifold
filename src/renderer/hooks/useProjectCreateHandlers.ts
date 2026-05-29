import { useCallback } from 'react'
import type { CreateProjectOptions, SpawnAgentOptions, AgentSession, Project } from '../../shared/types'
import { deriveBranchName } from '../../shared/derive-branch-name'
import { pickRandomNorwegianCityName } from '../../shared/norwegian-cities'

interface Args {
  createNewProject: (options: CreateProjectOptions) => Promise<Project | null>
  addProject: (path?: string) => Promise<void>
  cloneProject: (url: string) => Promise<boolean>
  spawnAgent: (options: SpawnAgentOptions) => Promise<AgentSession | null>
  setActiveSession: (sessionId: string | null) => void
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
  const { createNewProject, addProject, cloneProject, spawnAgent, setActiveSession, defaultRuntime, appEffects } = args

  const handleCreateNewProject = useCallback(async (options: CreateProjectOptions): Promise<boolean> => {
    // Hide any currently-active session and raise the creating cover up front.
    // The cover stays up (creatingProject) until the new agent's chat is ready,
    // so the empty "new agent" overview never flashes between steps.
    setActiveSession(null)
    appEffects.setCreatingProject(true)
    try {
      const project = await createNewProject(options)
      if (!project) {
        appEffects.setCreatingProject(false)
        return false
      }
      let branchName = deriveBranchName(pickRandomNorwegianCityName(), project.name)
      try {
        const suggested = await window.electronAPI.invoke('branch:suggest', project.id) as string
        if (typeof suggested === 'string' && suggested.trim()) branchName = suggested
      } catch {
        // Keep the city-based fallback if branch suggestion fails.
      }
      const session = await spawnAgent({
        projectId: project.id,
        runtimeId: defaultRuntime,
        prompt: options.description,
        userMessage: options.description,
        branchName,
        nonInteractive: true,
      })
      if (!session) {
        appEffects.setCreatingProject(false)
        return false
      }
      // Subscribe so the chat panel receives the agent's reply to the first
      // message (which spawnPrintModeFollowUp kicks off on the main side).
      try {
        await window.electronAPI.invoke('simple:subscribe-chat', session.id)
      } catch (err) {
        console.error(`[handleCreateNewProject] simple:subscribe-chat failed for ${session.id}:`, err)
      }
      // Select the new session and drop the onboarding view. The cover is
      // cleared once this session becomes active (see App's reveal effect),
      // so the chat appears directly with no intermediate overview.
      setActiveSession(session.id)
      appEffects.setShowOnboarding(false)
      return true
    } catch (err) {
      appEffects.setCreatingProject(false)
      throw err
    }
  }, [createNewProject, spawnAgent, setActiveSession, defaultRuntime, appEffects])

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
