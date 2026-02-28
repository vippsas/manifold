import { v4 as uuidv4 } from 'uuid'
import { WorktreeManager } from './worktree-manager'
import { ProjectRegistry } from './project-registry'
import type { FileWatcher } from './file-watcher'
import { readWorktreeMeta } from './worktree-meta'
import { gitExec } from './git-exec'
import { debugLog } from './debug-log'
import type { InternalSession } from './session-types'

export class SessionDiscovery {
  constructor(
    private sessions: Map<string, InternalSession>,
    private worktreeManager: WorktreeManager,
    private projectRegistry: ProjectRegistry,
    private fileWatcher: FileWatcher | undefined,
  ) {}

  async discoverSessionsForProject(projectId: string): Promise<void> {
    const project = this.projectRegistry.getProject(projectId)
    if (!project) throw new Error('Project not found: ' + projectId)

    const worktrees = await this.worktreeManager.listWorktrees(project.path)

    const trackedPaths = new Set(
      Array.from(this.sessions.values())
        .filter((s) => s.projectId === projectId)
        .map((s) => s.worktreePath)
    )

    for (const wt of worktrees) {
      if (!trackedPaths.has(wt.path)) {
        const meta = await readWorktreeMeta(wt.path)
        const session: InternalSession = {
          id: uuidv4(),
          projectId,
          runtimeId: meta?.runtimeId ?? '',
          branchName: wt.branch,
          worktreePath: wt.path,
          status: 'done',
          pid: null,
          ptyId: '',
          outputBuffer: '',
          taskDescription: meta?.taskDescription,
          additionalDirs: meta?.additionalDirs ?? [],
          ollamaModel: meta?.ollamaModel,
        }
        this.sessions.set(session.id, session)

        if (meta?.additionalDirs) {
          for (const dir of meta.additionalDirs) {
            this.fileWatcher?.watchAdditionalDir(dir, session.id)
          }
        }
      }
    }
  }

  async discoverAllSessions(simpleProjectsBase?: string): Promise<void> {
    const projects = this.projectRegistry.listProjects()

    for (const project of projects) {
      // Already have sessions for this project — skip
      if (Array.from(this.sessions.values()).some((s) => s.projectId === project.id)) {
        continue
      }

      // Discover worktree-based sessions
      try {
        await this.discoverSessionsForProject(project.id)
      } catch {
        // Project path may no longer exist
      }

      // If still no sessions and project is a simple-mode project (lives under
      // the managed projects directory), create a dormant noWorktree stub.
      if (simpleProjectsBase &&
          project.path.startsWith(simpleProjectsBase) &&
          !Array.from(this.sessions.values()).some((s) => s.projectId === project.id)) {
        try {
          let branch = (await gitExec(['branch', '--show-current'], project.path)).trim()

          // If on the base branch, look for a feature branch that has the app code.
          // killNonInteractiveSessions switches back to the base branch, so dormant
          // projects are often left on main while the real code is on a feature branch.
          if (branch === project.baseBranch) {
            const allBranches = (await gitExec(['branch', '--format=%(refname:short)'], project.path))
              .split('\n').map(b => b.trim()).filter(Boolean)
            const featureBranch = allBranches.find(b => b !== project.baseBranch)
            if (featureBranch) branch = featureBranch
          }

          if (branch) {
            const session: InternalSession = {
              id: uuidv4(),
              projectId: project.id,
              runtimeId: '',
              branchName: branch,
              worktreePath: project.path,
              status: 'done',
              pid: null,
              ptyId: '',
              outputBuffer: '',
              taskDescription: undefined,
              additionalDirs: [],
              noWorktree: true,
              nonInteractive: true,
            }
            this.sessions.set(session.id, session)
          }
        } catch {
          // Git command failed — project directory may be gone
        }
      }
    }
  }
}
