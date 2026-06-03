import { randomUUID } from 'node:crypto'
import type { AgentSession, Project, SpawnAgentOptions } from '../../shared/types'
import type { Workspace, WorkspaceCreateOptions, WorkspaceSpawnAgentOptions } from '../../shared/workspace-types'
import type { WorkspaceStore } from './workspace-store'
import {
  buildWorkspaceWorkingSet,
  findAvailableWorkspaceBranch,
  type WorkspaceProject,
  type WorktreeSetManager,
} from './workspace-worktrees'

export interface WorkspaceManagerDeps {
  store: WorkspaceStore
  worktreeManager: WorktreeSetManager
  projectRegistry: { getProject: (id: string) => Project | undefined }
  sessionManager: {
    createSession: (opts: SpawnAgentOptions) => Promise<AgentSession>
    getSession: (id: string) => AgentSession | undefined
    killSession: (id: string) => Promise<void>
  }
  emitListChanged: () => void
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'workspace'
}

export class WorkspaceManager {
  constructor(private readonly deps: WorkspaceManagerDeps) {}

  list(): Workspace[] { return this.deps.store.list() }
  get(id: string): Workspace | undefined { return this.deps.store.get(id) }

  create(options: WorkspaceCreateOptions): Workspace {
    if (options.projectIds.length === 0) throw new Error('A workspace must contain at least one project')
    const workspace: Workspace = {
      id: randomUUID(),
      name: options.name,
      projectIds: [...options.projectIds],
      createdAt: new Date().toISOString(),
      runtimeId: options.runtimeId,
    }
    this.deps.store.add(workspace)
    this.deps.emitListChanged()
    return workspace
  }

  remove(id: string): boolean {
    const removed = this.deps.store.remove(id)
    if (removed) this.deps.emitListChanged()
    return removed
  }

  addProject(id: string, projectId: string): void {
    this.deps.store.addProject(id, projectId)
    this.deps.emitListChanged()
  }

  removeProject(id: string, projectId: string): void {
    const workspace = this.deps.store.get(id)
    // Never empty a workspace — one with no repos can't spawn an agent. The UI also
    // hides the last repo's remove button, but guard here for any direct caller.
    if (workspace && workspace.projectIds.length <= 1) return
    this.deps.store.removeProject(id, projectId)
    this.deps.emitListChanged()
  }

  async spawnAgent(workspaceId: string, options: WorkspaceSpawnAgentOptions): Promise<AgentSession> {
    const workspace = this.deps.store.get(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    if (workspace.projectIds.length === 0) throw new Error('Workspace has no projects')

    const projects: WorkspaceProject[] = workspace.projectIds.map((pid) => {
      const project = this.deps.projectRegistry.getProject(pid)
      if (!project) throw new Error(`Project not found: ${pid}`)
      return { id: project.id, path: project.path, name: project.name, baseBranch: project.baseBranch, kind: project.kind }
    })

    // Home the agent in the chosen repo: move it to the front (its cwd/primary), keeping
    // the others in their relative order. Unknown/absent homeProjectId keeps the default (first repo).
    if (options.homeProjectId && projects.some((p) => p.id === options.homeProjectId)) {
      const home = projects.find((p) => p.id === options.homeProjectId)!
      const rest = projects.filter((p) => p.id !== options.homeProjectId)
      projects.splice(0, projects.length, home, ...rest)
    }

    const baseBranch = options.branchName ?? `manifold/${slugify(workspace.name)}`
    const branchName = await findAvailableWorkspaceBranch(this.deps.worktreeManager, projects, baseBranch)
    const { primary, additionalDirs, worktreePaths } = await buildWorkspaceWorkingSet(this.deps.worktreeManager, projects, branchName)

    return this.deps.sessionManager.createSession({
      projectId: projects[0].id,
      runtimeId: options.runtimeId,
      prompt: options.prompt ?? '',
      branchName,
      existingWorktreePath: primary,
      additionalDirs,
      workspaceId,
      workspaceWorktreePaths: worktreePaths,
      nonInteractive: options.nonInteractive,
    })
  }
}
