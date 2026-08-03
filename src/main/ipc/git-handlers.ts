import { ipcMain } from 'electron'
import { CreatePROptions, AheadBehind, FetchResult } from '../../shared/types'
import type { WorkspaceRepoStatus } from '../../shared/workspace-types'
import { isGitProject } from '../../shared/project-kind'
import { gitExec } from '../git/git-exec'
import { gitStatus, parseStatusWithConflicts } from '../fs/file-watcher-utils'
import { withRepoLock } from '../git/repo-lock'
import { getRuntimeById } from '../agent/runtimes'
import type { IpcDependencies } from './types'
import { resolveSession } from './types'

/** The base branch to diff/PR/compare against: the session's own base branch
 *  (e.g. a no-worktree agent based off a selected branch) or the project's. */
function baseBranchFor(session: { baseBranch?: string }, project: { baseBranch: string }): string {
  return session.baseBranch || project.baseBranch
}

export function registerDiffHandler(deps: IpcDependencies): void {
  const { sessionManager, projectRegistry, diffProvider } = deps

  ipcMain.handle('diff:get', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    // Session teardown removes the session before the renderer necessarily
    // clears every in-flight refresh. Treat that race as an empty diff.
    if (!session) return { diff: '', changedFiles: [] }
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)
    if (!isGitProject(project)) return { diff: '', changedFiles: [] }

    const base = baseBranchFor(session, project)
    const [diff, changedFiles] = await Promise.all([
      diffProvider.getDiff(session.worktreePath, base),
      diffProvider.getChangedFiles(session.worktreePath, base)
    ])

    return { diff, changedFiles }
  })

  ipcMain.handle('diff:file-original', async (_event, sessionId: string, relativePath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)
    if (!isGitProject(project)) return ''

    return diffProvider.getOriginalContent(session.worktreePath, baseBranchFor(session, project), relativePath)
  })
}

export function registerPrHandler(deps: IpcDependencies): void {
  const { sessionManager, projectRegistry, prCreator, verdictRecorder } = deps

  ipcMain.handle('pr:create', async (_event, options: CreatePROptions) => {
    const session = sessionManager.getSession(options.sessionId)
    if (!session) throw new Error(`Session not found: ${options.sessionId}`)
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)
    if (!isGitProject(project)) throw new Error('This project is a plain folder, not a git repository')

    const url = await prCreator.createPR(session.worktreePath, session.branchName, {
      title: options.title,
      body: options.body,
      baseBranch: baseBranchFor(session, project)
    })

    verdictRecorder?.onPrCreated(options.sessionId, url)

    return url
  })
}

export function registerGitHandlers(deps: IpcDependencies): void {
  const { gitOps, sessionManager, projectRegistry, workspaceManager } = deps

  ipcMain.handle('git:commit', async (_event, sessionId: string, message: string) => {
    const session = resolveSession(sessionManager, sessionId)
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)
    if (!isGitProject(project)) throw new Error('This project is a plain folder, not a git repository')
    await gitOps.commit(session.worktreePath, message)
  })

  ipcMain.handle('git:ai-generate', async (_event, sessionId: string, prompt: string) => {
    const session = resolveSession(sessionManager, sessionId)
    const runtime = getRuntimeById(session.runtimeId)
    if (!runtime) throw new Error(`Runtime not found: ${session.runtimeId}`)
    return gitOps.aiGenerate(runtime, prompt, session.worktreePath, runtime.aiModelArgs ?? [])
  })

  ipcMain.handle('git:ahead-behind', async (_event, sessionId: string): Promise<AheadBehind> => {
    const session = resolveSession(sessionManager, sessionId)
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)
    if (!isGitProject(project)) return { ahead: 0, behind: 0 }
    return gitOps.getAheadBehind(session.worktreePath, baseBranchFor(session, project))
  })

  ipcMain.handle('git:resolve-conflict', async (_event, sessionId: string, filePath: string, resolvedContent: string) => {
    await gitOps.resolveConflict(resolveSession(sessionManager, sessionId).worktreePath, filePath, resolvedContent)
  })

  ipcMain.handle('git:pr-context', async (_event, sessionId: string) => {
    const session = resolveSession(sessionManager, sessionId)
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)
    if (!isGitProject(project)) return { commits: '', diffStat: '', diffPatch: '' }
    return gitOps.getPRContext(session.worktreePath, baseBranchFor(session, project))
  })

  ipcMain.handle('git:fetch', async (_event, projectId: string): Promise<FetchResult> => {
    const project = projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!isGitProject(project)) throw new Error('This project is a plain folder, not a git repository')
    return gitOps.fetchAndUpdate(project.path, project.baseBranch)
  })

  ipcMain.handle('git:staleness', async (_event, projectId: string): Promise<{ baseBranch: string; behindCount: number }> => {
    const project = projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!isGitProject(project)) return { baseBranch: '', behindCount: 0 }
    const behindCount = await gitOps.getRemoteBehindCount(project.path, project.baseBranch)
    return { baseBranch: project.baseBranch, behindCount }
  })

  // The branch a folder currently has checked out. The sidebar labels each folder
  // of a home workspace with it — that workspace *is* the clones, so each folder
  // sits on its own branch (a worktree workspace puts them all on its branch,
  // which the workspace card names once). Empty for a plain folder.
  ipcMain.handle('git:current-branch', async (_event, projectId: string): Promise<string> => {
    const project = projectRegistry.getProject(projectId)
    if (!project || !isGitProject(project)) return ''
    try {
      return (await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], project.path)).trim()
    } catch {
      // A repo with no commits yet has no resolvable HEAD; it simply has no label.
      return ''
    }
  })

  // Git status of every repo checkout in a workspace, for the Source Control
  // view: one entry per member repo with its branch and uncommitted changes —
  // the multi-root shape VS Code's SCM view has. Reads the workspace's own
  // checkout of each repo (worktree, or the clone on a home workspace); plain
  // folders are skipped. A repo that fails to answer reports an empty status
  // rather than failing the whole workspace.
  ipcMain.handle('git:workspace-status', async (_event, workspaceId: string): Promise<WorkspaceRepoStatus[]> => {
    const workspace = workspaceManager.get(workspaceId)
    if (!workspace) return []
    const statuses = await Promise.all(workspace.projectIds.map(async (projectId) => {
      const project = projectRegistry.getProject(projectId)
      if (!project || !isGitProject(project)) return null
      const checkoutPath = workspace.worktreePaths?.[projectId] ?? project.path
      const [branch, changes] = await Promise.all([
        gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], checkoutPath).then((out) => out.trim()).catch(() => ''),
        gitStatus(checkoutPath).then((raw) => parseStatusWithConflicts(raw).changes).catch(() => []),
      ])
      return { projectId, projectName: project.name, checkoutPath, branch, changes }
    }))
    return statuses.filter((status): status is WorkspaceRepoStatus => status !== null)
  })

  /** The workspace's checkout of a member repo — the target of the Source
   *  Control panel's commit and branch operations. Throws for plain folders,
   *  which the panel never lists. */
  function resolveWorkspaceCheckout(workspaceId: string, projectId: string): { projectPath: string; checkoutPath: string } {
    const workspace = workspaceManager.get(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    const project = projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!isGitProject(project)) throw new Error('This project is a plain folder, not a git repository')
    return { projectPath: project.path, checkoutPath: workspace.worktreePaths?.[projectId] ?? project.path }
  }

  // Commit one repo checkout of a workspace — the Source Control panel's
  // per-repo commit input. Same managed commit as the session-scoped
  // `git:commit` (stage-all with agent-scratch excludes), just addressed by
  // workspace membership instead of a session.
  ipcMain.handle('git:workspace-commit', async (_event, workspaceId: string, projectId: string, message: string) => {
    const { checkoutPath } = resolveWorkspaceCheckout(workspaceId, projectId)
    await gitOps.commit(checkoutPath, message)
  })

  // Switch (or create) the branch of one workspace checkout — VS Code's
  // click-the-branch-name flow. A plain `git checkout` in the checkout path:
  // remote-only branches get git's DWIM local tracking branch, and branches
  // held by another worktree are already filtered out of `git:list-branches`.
  // Serialized against other mutating git ops on the repo, like every checkout
  // in branch-checkout-manager. Emits `workspace:list-changed` so the sidebar
  // re-reads its folder branch badges.
  ipcMain.handle('git:workspace-checkout', async (_event, workspaceId: string, projectId: string, branchName: string, createNew: boolean) => {
    const { projectPath, checkoutPath } = resolveWorkspaceCheckout(workspaceId, projectId)
    await withRepoLock(projectPath, () =>
      gitExec(createNew ? ['checkout', '-b', branchName] : ['checkout', branchName], checkoutPath),
    )
    deps.send?.('workspace:list-changed')
  })

  // Whether the project's main working tree has uncommitted changes. Used by the
  // New Agent form to confirm before a no-worktree agent switches the working
  // copy to a new branch (which carries those changes along).
  ipcMain.handle('git:has-uncommitted-changes', async (_event, projectId: string): Promise<boolean> => {
    const project = projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!isGitProject(project)) return false
    const status = await gitExec(['status', '--porcelain'], project.path)
    return status.trim().length > 0
  })
}
