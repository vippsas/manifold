import { useCallback } from 'react'
import type { CreateProjectOptions, SpawnAgentOptions, AgentSession, Project } from '../../../shared/types'

const COPIED_INSTRUCTIONS_WORKSPACE_NOTE =
  'Workspace setup note: use the current working directory as the project root. ' +
  'If the copied instructions ask you to clone a repository, clone it into the current directory ' +
  '(for example, `git clone <url> .`) so the repository files are not nested inside another empty folder.\n\n'
const COPIED_INSTRUCTIONS_CLONED_NOTE =
  'Workspace setup note: the referenced repository has already been cloned into the current working directory. ' +
  'Do not clone it again; continue from the files that are already here.\n\n'

interface Args {
  createNewProject: (options: CreateProjectOptions, workspaceId?: string) => Promise<Project | null>
  addProject: (path?: string, options?: { workspaceId?: string }) => Promise<Project | null>
  cloneProject: (url: string, workspaceId?: string) => Promise<boolean>
  spawnAgent: (options: SpawnAgentOptions) => Promise<AgentSession | null>
  setActiveSession: (sessionId: string | null) => void
  /**
   * Drop any focused workspace once a repo is added. ProjectList hides the active
   * standalone project while a workspace is focused, which would otherwise strand a
   * newly added repo in the collapsed "Repositories" list with no create-agent
   * affordance (#811).
   */
  clearActiveWorkspace: () => void
  selectWorkspace?: (id: string) => void
  defaultRuntime: string
  appEffects: {
    setCreatingProject: (v: boolean) => void
    setCloningProject: (v: boolean) => void
    setShowOnboarding: (v: boolean) => void
  }
}

export interface UseProjectCreateHandlersResult {
  handleCreateNewProject: (options: CreateProjectOptions, workspaceId?: string) => Promise<boolean>
  handleAddProjectFromOnboarding: (path?: string, workspaceId?: string) => Promise<void>
  handleCloneFromOnboarding: (url: string, workspaceId?: string) => Promise<boolean>
}

export function useProjectCreateHandlers(args: Args): UseProjectCreateHandlersResult {
  const { createNewProject, addProject, cloneProject, spawnAgent, setActiveSession, clearActiveWorkspace, selectWorkspace, defaultRuntime, appEffects } = args
  const selectDestination = useCallback((workspaceId?: string): void => {
    if (workspaceId) selectWorkspace?.(workspaceId)
    else clearActiveWorkspace()
  }, [selectWorkspace, clearActiveWorkspace])

  const handleCreateNewProject = useCallback(async (options: CreateProjectOptions, workspaceId?: string): Promise<boolean> => {
    // Hide any currently-active session and raise the creating cover up front.
    // The cover stays up (creatingProject) until the new agent's chat is ready,
    // so the empty "new agent" overview never flashes between steps.
    setActiveSession(null)
    appEffects.setCreatingProject(true)
    try {
      const project = await createNewProject(options, ...(workspaceId ? [workspaceId] : []))
      if (!project) {
        appEffects.setCreatingProject(false)
        return false
      }
      selectDestination(workspaceId)
      const copiedInstructions = options.projectKind === 'folder'
      const createAsFolder = project.kind === 'folder'
      const branchName = createAsFolder ? project.name : project.baseBranch || 'main'
      const copiedInstructionsNote = createAsFolder
        ? COPIED_INSTRUCTIONS_WORKSPACE_NOTE
        : COPIED_INSTRUCTIONS_CLONED_NOTE
      const agentPrompt = copiedInstructions
        ? `${copiedInstructionsNote}${options.description}`
        : options.description
      const session = await spawnAgent({
        projectId: project.id,
        ...(workspaceId ? { workspaceId } : {}),
        runtimeId: defaultRuntime,
        prompt: agentPrompt,
        userMessage: options.description,
        branchName,
        noWorktree: true,
        ...(createAsFolder ? {} : { stayOnBranch: true }),
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
  }, [createNewProject, spawnAgent, setActiveSession, selectDestination, defaultRuntime, appEffects])

  const handleAddProjectFromOnboarding = useCallback(async (path?: string, workspaceId?: string): Promise<void> => {
    const project = workspaceId ? await addProject(path, { workspaceId }) : await addProject(path)
    if (project) {
      setActiveSession(null)
      selectDestination(workspaceId)
      appEffects.setShowOnboarding(false)
    }
  }, [addProject, setActiveSession, selectDestination, appEffects])

  const handleCloneFromOnboarding = useCallback(async (url: string, workspaceId?: string): Promise<boolean> => {
    appEffects.setCloningProject(true)
    try {
      const ok = await cloneProject(url, ...(workspaceId ? [workspaceId] : []))
      if (ok) {
        setActiveSession(null)
        selectDestination(workspaceId)
        appEffects.setShowOnboarding(false)
      }
      return ok
    } finally {
      appEffects.setCloningProject(false)
    }
  }, [cloneProject, setActiveSession, selectDestination, appEffects])

  return { handleCreateNewProject, handleAddProjectFromOnboarding, handleCloneFromOnboarding }
}
