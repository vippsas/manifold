import { ipcMain } from 'electron'
import type { GitSyncResult } from '../../shared/workspace-types'
import { isGitProject } from '../../shared/project-kind'
import { gitExec } from '../git/git-exec'
import { invalidateCheckoutStatus } from '../fs/checkout-status-cache'
import {
  commitManagedWorktreeIndex,
  discardManagedWorktreePaths,
  stageManagedWorktreePaths,
  unstageManagedWorktreePaths,
} from '../git/managed-worktree'
import { withRepoLock } from '../git/repo-lock'
import type { IpcDependencies } from './types'

function gitFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerGitWorkspaceHandlers(deps: IpcDependencies): void {
  const { gitOps, projectRegistry, workspaceManager } = deps

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

  // Move paths between the working tree and the index — the +/- on a Source
  // Control row or group. Paths are relative to the checkout, and arrive as a
  // list so staging a whole group is one git invocation.
  ipcMain.handle('git:workspace-stage', async (_event, workspaceId: string, projectId: string, paths: string[]) => {
    const { checkoutPath } = resolveWorkspaceCheckout(workspaceId, projectId)
    try {
      await stageManagedWorktreePaths(checkoutPath, paths)
    } finally {
      invalidateCheckoutStatus(checkoutPath)
    }
  })

  ipcMain.handle('git:workspace-unstage', async (_event, workspaceId: string, projectId: string, paths: string[]) => {
    const { checkoutPath } = resolveWorkspaceCheckout(workspaceId, projectId)
    try {
      await unstageManagedWorktreePaths(checkoutPath, paths)
    } finally {
      invalidateCheckoutStatus(checkoutPath)
    }
  })

  // Throw away working-tree changes. Unrecoverable, so the renderer confirms
  // first; this handler is the point of no return.
  ipcMain.handle('git:workspace-discard', async (_event, workspaceId: string, projectId: string, paths: string[]) => {
    const { checkoutPath } = resolveWorkspaceCheckout(workspaceId, projectId)
    try {
      await discardManagedWorktreePaths(checkoutPath, paths)
    } finally {
      invalidateCheckoutStatus(checkoutPath)
    }
  })

  // Commit one repo checkout of a workspace — the Source Control panel's
  // per-repo commit input. `stageAll` is the answer to the panel's "nothing is
  // staged, stage everything?" prompt: set, this is the same managed stage-all
  // commit as the session-scoped `git:commit` (with agent-scratch excludes);
  // clear, it commits exactly what the user staged and nothing more.
  ipcMain.handle('git:workspace-commit', async (
    _event, workspaceId: string, projectId: string, message: string, stageAll: boolean,
  ) => {
    const { checkoutPath } = resolveWorkspaceCheckout(workspaceId, projectId)
    try {
      if (stageAll) await gitOps.commit(checkoutPath, message)
      else await commitManagedWorktreeIndex(checkoutPath, message)
    } finally {
      invalidateCheckoutStatus(checkoutPath)
    }
  })

  // Switch, create (optionally from another ref), or detach one workspace
  // checkout — VS Code's click-the-branch-name flow. A plain switch of a
  // remote-only branch gets git's DWIM local tracking branch; create-from and
  // detached selection retain the exact local/remote ref chosen in the picker.
  // Branches held by another worktree are filtered out of `git:list-branches`.
  // Serialized against other mutating git ops on the repo, like every checkout
  // in branch-checkout-manager. Emits `workspace:list-changed` so Source Control
  // and the workspace list refresh.
  ipcMain.handle('git:workspace-checkout', async (
    _event,
    workspaceId: string,
    projectId: string,
    target: string,
    mode: 'switch' | 'create' | 'detach',
    startPoint?: string,
  ) => {
    const { projectPath, checkoutPath } = resolveWorkspaceCheckout(workspaceId, projectId)
    const args = mode === 'create'
      ? ['checkout', '-b', target, ...(startPoint ? [startPoint] : [])]
      : mode === 'detach'
        ? ['checkout', '--detach', target]
        : ['checkout', target]
    try {
      await withRepoLock(projectPath, () => gitExec(args, checkoutPath))
    } finally {
      invalidateCheckoutStatus(checkoutPath)
    }
    deps.send?.('workspace:list-changed')
  })

  // Sync the active checkout like VS Code's status-bar control: pull its
  // configured upstream without creating a merge commit, then push local
  // commits. Git failures are data rather than rejected IPC so the renderer can
  // show both a useful reason and the complete command output.
  ipcMain.handle('git:workspace-pull', async (_event, workspaceId: string, projectId: string): Promise<GitSyncResult> => {
    const { projectPath, checkoutPath } = resolveWorkspaceCheckout(workspaceId, projectId)
    const result = await withRepoLock(projectPath, async (): Promise<GitSyncResult> => {
      const output: string[] = [`Repository: ${checkoutPath}`, '', '$ git pull --ff-only']
      try {
        const pullOutput = await gitExec(['pull', '--ff-only'], checkoutPath)
        if (pullOutput.trim()) output.push(pullOutput.trimEnd())
      } catch (error: unknown) {
        const message = gitFailureMessage(error)
        output.push(message)
        return { ok: false, failedCommand: 'pull', message, output: output.join('\n') }
      }

      output.push('', '$ git push')
      try {
        const pushOutput = await gitExec(['push'], checkoutPath)
        if (pushOutput.trim()) output.push(pushOutput.trimEnd())
      } catch (error: unknown) {
        const message = gitFailureMessage(error)
        output.push(message)
        return { ok: false, failedCommand: 'push', message, output: output.join('\n') }
      }

      return { ok: true, output: output.join('\n') }
    }).finally(() => invalidateCheckoutStatus(checkoutPath))
    deps.send?.('workspace:list-changed')
    return result
  })

  // The uncommitted diff of one file in a workspace checkout — what the editor
  // shows when a Source Control row is clicked, VS Code's SCM-click diff (which
  // compares against the index or HEAD, unlike the session diff which compares
  // to the base branch). A staged row diffs the index against HEAD; an unstaged
  // row diffs the working tree against the index, so a staged-then-edited file
  // shows only the half that was clicked. `original` is the diff editor's left
  // side; both are null when the file has no such change (a click raced a
  // refresh), and original is '' for a file that side doesn't have (new file).
  ipcMain.handle('git:workspace-file-diff', async (
    _event, workspaceId: string, projectId: string, relativePath: string, staged: boolean,
  ) => {
    const { checkoutPath } = resolveWorkspaceCheckout(workspaceId, projectId)
    const [original, diff] = await Promise.all([
      gitExec(['show', staged ? `HEAD:${relativePath}` : `:${relativePath}`], checkoutPath).catch(() => null),
      gitExec(staged ? ['diff', '--cached', '--', relativePath] : ['diff', '--', relativePath], checkoutPath).catch(() => ''),
    ])
    if (original === null) return { diff: diff || '', original: '' }
    if (!diff.trim()) return { diff: null, original: null }
    return { diff, original }
  })
}
