import { randomUUID } from 'node:crypto'
import type { AgentSession, Project, SpawnAgentOptions } from '../../shared/types'
import type { Workspace, WorkspaceCreateOptions, WorkspaceSpawnAgentOptions } from '../../shared/workspace-types'
import type { WorkspaceStore } from './workspace-store'
import {
  buildWorkspaceWorkingSet,
  findAvailableWorkspaceBranch,
  removeWorkspaceWorktrees,
  type WorkspaceProject,
  type WorktreeSetManager,
} from './workspace-worktrees'

export interface WorkspaceManagerDeps {
  store: WorkspaceStore
  worktreeManager: WorktreeSetManager
  projectRegistry: { getProject: (id: string) => Project | undefined; listProjects: () => Project[] }
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

  /** Cuts the workspace's checkout of every repo before the record exists, so a
   *  workspace is never a name without a place to work. A repo already carries a
   *  home workspace on its clone, so this branch is always a fresh one. */
  async create(options: WorkspaceCreateOptions): Promise<Workspace> {
    if (options.projectIds.length === 0) throw new Error('A workspace must contain at least one project')
    const projects = this.resolveProjects(options.projectIds)
    const branchName = await findAvailableWorkspaceBranch(
      this.deps.worktreeManager, projects, `manifold/${slugify(options.name)}`,
    )
    const { worktreePaths } = await buildWorkspaceWorkingSet(this.deps.worktreeManager, projects, branchName)
    const workspace: Workspace = {
      id: randomUUID(),
      name: options.name,
      projectIds: [...options.projectIds],
      createdAt: new Date().toISOString(),
      runtimeId: options.runtimeId,
      branchName,
      worktreePaths,
    }
    this.deps.store.add(workspace)
    this.deps.emitListChanged()
    return workspace
  }

  rename(id: string, name: string): Workspace | undefined {
    const trimmed = name.trim()
    if (!trimmed) return this.deps.store.get(id)
    const renamed = this.deps.store.update(id, { name: trimmed })
    if (renamed) this.deps.emitListChanged()
    return renamed
  }

  /** Removing the workspace is what removes its worktrees — closing an agent
   *  never does, since its siblings work in the same checkout. */
  async remove(id: string): Promise<boolean> {
    const workspace = this.deps.store.get(id)
    if (workspace?.worktreePaths) await this.tearDownWorktrees(workspace.worktreePaths)
    const removed = this.deps.store.remove(id)
    if (removed) this.deps.emitListChanged()
    return removed
  }

  async addProject(id: string, projectId: string): Promise<void> {
    const workspace = this.deps.store.get(id)
    if (!workspace || workspace.projectIds.includes(projectId)) return
    // A folder joining a worktree workspace needs its own checkout on that
    // workspace's branch, or the agent would see the repo's clone instead.
    if (workspace.worktreePaths && workspace.branchName) {
      const [project] = this.resolveProjects([projectId])
      const { worktreePaths } = await buildWorkspaceWorkingSet(
        this.deps.worktreeManager, [project], workspace.branchName,
      )
      this.deps.store.update(id, { worktreePaths: { ...workspace.worktreePaths, ...worktreePaths } })
    }
    this.deps.store.addProject(id, projectId)
    this.deps.emitListChanged()
  }

  async removeProject(id: string, projectId: string): Promise<void> {
    const workspace = this.deps.store.get(id)
    // Never empty a workspace — one with no repos can't spawn an agent. The UI also
    // hides the last repo's remove button, but guard here for any direct caller.
    if (workspace && workspace.projectIds.length <= 1) return
    await this.dropWorktree(workspace, projectId)
    this.deps.store.removeProject(id, projectId)
    this.deps.emitListChanged()
  }

  /** A repo is only ever shown inside a workspace, so one that no workspace holds
   *  gets its own. A workspace of a single folder is the ordinary shape — not a
   *  degenerate case to be avoided. */
  adoptProject(project: Project): Workspace {
    const holder = this.deps.store.list().find((w) => w.projectIds.includes(project.id))
    if (holder) return holder
    const workspace = this.buildWorkspace(project.name, [project.id])
    this.deps.store.add(workspace)
    this.deps.emitListChanged()
    return workspace
  }

  /** Startup migration for the rule above: wrap every registered repo that no
   *  workspace holds. Trees added before workspaces became the only container
   *  come back as one-folder workspaces instead of vanishing from the sidebar. */
  adoptOrphanProjects(): void {
    const held = new Set(this.deps.store.list().flatMap((w) => w.projectIds))
    const orphans = this.deps.projectRegistry.listProjects().filter((p) => !held.has(p.id))
    if (orphans.length === 0) return
    for (const project of orphans) {
      this.deps.store.add(this.buildWorkspace(project.name, [project.id]))
    }
    this.deps.emitListChanged()
  }

  // Cascade for project deletion. Unlike removeProject, this may empty a workspace,
  // and an empty one is dropped: with no folders it can neither spawn an agent nor
  // show anything, so it would sit in the sidebar as an unusable card.
  async removeProjectFromAllWorkspaces(projectId: string): Promise<void> {
    let changed = false
    for (const w of this.deps.store.list()) {
      if (!w.projectIds.includes(projectId)) continue
      await this.dropWorktree(w, projectId)
      this.deps.store.removeProject(w.id, projectId)
      changed = true
    }
    if (this.dropEmptyWorkspaces() || changed) this.deps.emitListChanged()
  }

  // Heals workspaces persisted before project deletion cascaded here. The repo is
  // already gone from the registry, so its worktree can only be forgotten, not
  // removed — `git worktree remove` needs the clone it was cut from.
  pruneMissingProjects(): void {
    let changed = false
    for (const w of this.deps.store.list()) {
      for (const pid of w.projectIds) {
        if (this.deps.projectRegistry.getProject(pid)) continue
        if (w.worktreePaths?.[pid]) {
          const { [pid]: _dropped, ...rest } = w.worktreePaths
          this.deps.store.update(w.id, { worktreePaths: rest })
        }
        this.deps.store.removeProject(w.id, pid)
        changed = true
      }
    }
    if (this.dropEmptyWorkspaces() || changed) this.deps.emitListChanged()
  }

  /** Home workspaces carry no branch and no worktrees: they *are* the clones. */
  private buildWorkspace(name: string, projectIds: string[]): Workspace {
    return { id: randomUUID(), name, projectIds: [...projectIds], createdAt: new Date().toISOString() }
  }

  private resolveProjects(projectIds: readonly string[]): WorkspaceProject[] {
    return projectIds.map((pid) => {
      const project = this.deps.projectRegistry.getProject(pid)
      if (!project) throw new Error(`Project not found: ${pid}`)
      return { id: project.id, path: project.path, name: project.name, baseBranch: project.baseBranch, kind: project.kind }
    })
  }

  private async tearDownWorktrees(worktreePaths: Record<string, string>): Promise<void> {
    await removeWorkspaceWorktrees(
      this.deps.worktreeManager,
      worktreePaths,
      (projectId) => this.deps.projectRegistry.getProject(projectId)?.path,
    )
  }

  private async dropWorktree(workspace: Workspace | undefined, projectId: string): Promise<void> {
    const worktreePath = workspace?.worktreePaths?.[projectId]
    if (!workspace || !worktreePath) return
    await this.tearDownWorktrees({ [projectId]: worktreePath })
    const { [projectId]: _removed, ...rest } = workspace.worktreePaths!
    this.deps.store.update(workspace.id, { worktreePaths: rest })
  }

  private dropEmptyWorkspaces(): boolean {
    let dropped = false
    for (const w of this.deps.store.list()) {
      if (w.projectIds.length > 0) continue
      this.deps.store.remove(w.id)
      dropped = true
    }
    return dropped
  }

  async spawnAgent(workspaceId: string, options: WorkspaceSpawnAgentOptions): Promise<AgentSession> {
    const workspace = this.deps.store.get(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    if (workspace.projectIds.length === 0) throw new Error('Workspace has no projects')

    // The workspace decides where its agents run: the first folder is the cwd and
    // the rest come along as context. Homing on whichever folder the sidebar had
    // selected would make two agents in one workspace live in different places.
    const projects = this.resolveProjects(workspace.projectIds)

    // The workspace already owns a checkout of every repo, so an agent joins it
    // rather than cutting one of its own — that is what keeps a workspace a
    // single place to work instead of a stack of worktrees.
    const worktreePaths = workspace.worktreePaths
      ?? Object.fromEntries(projects.map((p) => [p.id, p.path]))
    const [primary, ...additionalDirs] = projects.map((p) => worktreePaths[p.id] ?? p.path)

    return this.deps.sessionManager.createSession({
      projectId: projects[0].id,
      runtimeId: options.runtimeId,
      prompt: '',
      displayName: options.displayName,
      branchName: workspace.branchName,
      // A home workspace is the clone itself: the agent works on whatever branch
      // the user has checked out there instead of being moved to another.
      ...(workspace.worktreePaths
        ? { existingWorktreePath: primary }
        : { noWorktree: true, stayOnBranch: true }),
      additionalDirs,
      workspaceId,
      workspaceWorktreePaths: worktreePaths,
      nonInteractive: options.nonInteractive,
    })
  }
}
