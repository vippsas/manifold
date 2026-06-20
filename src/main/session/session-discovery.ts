import { v4 as uuidv4 } from 'uuid'
import { WorktreeManager, type WorktreeInfo } from '../git/worktree-manager'
import { isGitRepositoryError, isMissingGitError } from '../git/git-errors'
import { ProjectRegistry } from '../store/project-registry'
import type { FileWatcher } from '../fs/file-watcher'
import { readWorktreeMeta } from '../git/worktree-meta'
import { gitExec } from '../git/git-exec'
import { prepareManagedWorktree } from '../git/managed-worktree'
import { debugLog } from '../app/debug-log'
import type { InternalSession } from './session-types'
import type { VerdictRecorder } from './verdict-recorder'
import type { DismissedAgentsStore } from '../store/dismissed-agents-store'
import { isGitProject } from '../../shared/project-kind'

export class SessionDiscovery {
  private discoveryInFlight = new Map<string, Promise<void>>()
  private verdictRecorder: VerdictRecorder | null = null
  private dismissedAgents: Pick<DismissedAgentsStore, 'has'> | null = null

  constructor(
    private sessions: Map<string, InternalSession>,
    private worktreeManager: WorktreeManager,
    private projectRegistry: ProjectRegistry,
    private fileWatcher: FileWatcher | undefined,
  ) {}

  setVerdictRecorder(recorder: VerdictRecorder): void {
    this.verdictRecorder = recorder
  }

  setDismissedAgents(store: Pick<DismissedAgentsStore, 'has'>): void {
    this.dismissedAgents = store
  }

  private adoptForVerdict(session: InternalSession, baseBranch: string): void {
    if (!this.verdictRecorder) return
    if (session.noWorktree || !session.worktreePath) return
    this.verdictRecorder.onSessionCreated({
      sessionId: session.id,
      projectId: session.projectId,
      branch: session.branchName,
      runtime: session.runtimeId,
      taskPrompt: session.taskDescription ?? '',
      worktreePath: session.worktreePath,
      baseBranch,
    })
  }

  async discoverSessionsForProject(projectId: string): Promise<void> {
    // Serialize concurrent calls for the same project to prevent duplicate sessions.
    // Without this, two renderer hooks calling discovery simultaneously can both see
    // zero sessions and each create a new one.
    const inflight = this.discoveryInFlight.get(projectId)
    if (inflight) {
      await inflight
      return
    }
    const promise = this.doDiscoverSessionsForProject(projectId)
    this.discoveryInFlight.set(projectId, promise)
    try {
      await promise
    } finally {
      this.discoveryInFlight.delete(projectId)
    }
  }

  private async doDiscoverSessionsForProject(projectId: string): Promise<void> {
    const project = this.projectRegistry.getProject(projectId)
    if (!project) throw new Error('Project not found: ' + projectId)
    if (!isGitProject(project)) {
      return
    }

    let worktrees: WorktreeInfo[]
    try {
      worktrees = await this.worktreeManager.listWorktrees(project.path)
    } catch (error) {
      if (isGitRepositoryError(error) || isMissingGitError(error)) {
        debugLog(`[session] skipping git session discovery for ${project.path}: ${(error as Error).message}`)
        return
      }
      throw error
    }

    const trackedPaths = new Set(
      Array.from(this.sessions.values())
        .filter((s) => s.projectId === projectId)
        .map((s) => s.worktreePath)
    )

    for (const wt of worktrees) {
      if (!trackedPaths.has(wt.path)) {
        try {
          await prepareManagedWorktree(wt.path)
        } catch (err) {
          debugLog(`[session] failed to install managed worktree guards for ${wt.path}: ${err}`)
        }

        const meta = await readWorktreeMeta(wt.path)
        const session: InternalSession = {
          // Restore the persisted session id so the re-adopted session matches its
          // verdict record and (for interactive Claude) its on-disk transcript.
          id: meta?.sessionId ?? uuidv4(),
          projectId,
          runtimeId: meta?.runtimeId ?? '',
          branchName: wt.branch,
          worktreePath: wt.path,
          status: 'done',
          pid: null,
          ptyId: '',
          outputBuffer: '',
          displayName: meta?.displayName,
          taskDescription: meta?.taskDescription,
          simpleTemplateTitle: meta?.simpleTemplateTitle,
          simplePromptInstructions: meta?.simplePromptInstructions,
          additionalDirs: meta?.additionalDirs ?? [],
          ollamaModel: meta?.ollamaModel,
          workspaceId: meta?.workspaceId,
          workspaceWorktreePaths: meta?.workspaceWorktreePaths,
          nonInteractive: meta?.nonInteractive,
          codexThreadId: meta?.codexThreadId,
          locked: meta?.locked,
        }
        this.sessions.set(session.id, session)
        this.adoptForVerdict(session, project.baseBranch)

        if (meta?.additionalDirs) {
          for (const dir of meta.additionalDirs) {
            this.fileWatcher?.watchAdditionalDir(dir, session.id)
          }
        }
      }
    }

    // If no sessions found (no worktrees and nothing in memory), check whether
    // the main repo is on a non-base branch — this indicates prior noWorktree work
    // that should be surfaced as a dormant session. Branch state alone is not
    // proof, though: if the user explicitly deleted that agent (#679), the
    // dismissal record suppresses resurrection until a session is recreated.
    const hasAnySession = Array.from(this.sessions.values()).some((s) => s.projectId === projectId)
    if (!hasAnySession) {
      try {
        const branch = (await gitExec(['branch', '--show-current'], project.path)).trim()
        if (branch && branch !== project.baseBranch && !this.dismissedAgents?.has(projectId, branch)) {
          const meta = await readWorktreeMeta(project.path)
          const session: InternalSession = {
            id: meta?.sessionId ?? uuidv4(),
            projectId,
            runtimeId: meta?.runtimeId ?? '',
            branchName: branch,
            worktreePath: project.path,
            status: 'done',
            pid: null,
            ptyId: '',
            outputBuffer: '',
            displayName: meta?.displayName,
            taskDescription: meta?.taskDescription,
            simpleTemplateTitle: meta?.simpleTemplateTitle ?? project.simpleTemplateTitle,
            simplePromptInstructions: meta?.simplePromptInstructions ?? project.simplePromptInstructions,
            additionalDirs: meta?.additionalDirs ?? [],
            noWorktree: true,
            nonInteractive: meta?.nonInteractive ?? true,
            codexThreadId: meta?.codexThreadId,
            locked: meta?.locked,
          }
          this.sessions.set(session.id, session)
        }
      } catch {
        // Git command failed — project directory may be gone
      }
    }
  }

  async discoverAllSessions(simpleProjectsBase?: string): Promise<void> {
    // Serialize concurrent calls to prevent duplicate dormant sessions.
    const inflight = this.discoveryInFlight.get('__all__')
    if (inflight) {
      await inflight
      return
    }
    const promise = this.doDiscoverAllSessions(simpleProjectsBase)
    this.discoveryInFlight.set('__all__', promise)
    try {
      await promise
    } finally {
      this.discoveryInFlight.delete('__all__')
    }
  }

  private async doDiscoverAllSessions(simpleProjectsBase?: string): Promise<void> {
    const projects = this.projectRegistry.listProjects()

    for (const project of projects) {
      // Already have sessions for this project — skip
      if (Array.from(this.sessions.values()).some((s) => s.projectId === project.id)) {
        continue
      }

      if (!isGitProject(project)) {
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

          if (branch && !this.dismissedAgents?.has(project.id, branch)) {
            const meta = await readWorktreeMeta(project.path)
            const session: InternalSession = {
              id: meta?.sessionId ?? uuidv4(),
              projectId: project.id,
              runtimeId: meta?.runtimeId ?? '',
              branchName: branch,
              worktreePath: project.path,
              status: 'done',
              pid: null,
              ptyId: '',
              outputBuffer: '',
              displayName: meta?.displayName,
              taskDescription: meta?.taskDescription,
              simpleTemplateTitle: meta?.simpleTemplateTitle ?? project.simpleTemplateTitle,
              simplePromptInstructions: meta?.simplePromptInstructions ?? project.simplePromptInstructions,
              additionalDirs: meta?.additionalDirs ?? [],
              noWorktree: true,
              nonInteractive: meta?.nonInteractive ?? true,
              locked: meta?.locked,
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
