import { PtyPool } from '../agent/pty-pool'
import { ProjectRegistry } from '../store/project-registry'
import { gitExec } from '../git/git-exec'
import { commitManagedWorktree, getManagedWorktreeStatus } from '../git/managed-worktree'
import { removeWorktreeMeta } from '../git/worktree-meta'
import { debugLog } from '../app/debug-log'
import type { InternalSession } from './session-types'

export class SessionTeardown {
  constructor(
    private sessions: Map<string, InternalSession>,
    private ptyPool: PtyPool,
    private projectRegistry: ProjectRegistry,
    private onKillSession: (sessionId: string) => Promise<void>,
  ) {}

  async killNonInteractiveSessions(projectId: string): Promise<{ killedIds: string[]; branchName?: string; noWorktree?: boolean }> {
    const toKill = Array.from(this.sessions.values())
      .filter(s => s.projectId === projectId && s.nonInteractive)
    const killedIds: string[] = []
    let branchName: string | undefined
    let noWorktree: boolean | undefined

    for (const session of toKill) {
      branchName = session.branchName
      noWorktree = session.noWorktree

      if (session.ptyId) {
        try { this.ptyPool.kill(session.ptyId) } catch { /* already exited */ }
        session.ptyId = ''
      }
      if (session.devServerPtyId) {
        try { this.ptyPool.kill(session.devServerPtyId) } catch { /* already exited */ }
        session.devServerPtyId = undefined
      }

      try {
        const status = await getManagedWorktreeStatus(session.worktreePath)
        if (status.trim().length > 0) {
          await commitManagedWorktree(session.worktreePath, 'Auto-commit: work from simple mode')
          debugLog(`[session] auto-committed changes on branch ${branchName}`)
        }
      } catch (err) {
        debugLog(`[session] auto-commit failed: ${err}`)
      }

      await this.onKillSession(session.id)
      killedIds.push(session.id)
    }

    // Only checkout base branch for worktree-based sessions.
    // noWorktree sessions work directly in the project directory — checking
    // out base would remove .gitignore and expose build artifacts (node_modules)
    // as untracked files, breaking the subsequent agent spawn.
    if (branchName && !noWorktree) {
      const project = this.projectRegistry.getProject(projectId)
      if (project) {
        try {
          await gitExec(['checkout', project.baseBranch], project.path)
          debugLog(`[session] switched project back to ${project.baseBranch}`)
        } catch (err) {
          debugLog(`[session] checkout base branch failed: ${err}`)
        }
      }
    }

    return { killedIds, branchName, noWorktree }
  }

  async killInteractiveSession(sessionId: string): Promise<{ projectPath: string; branchName: string; taskDescription?: string }> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    const branchName = session.branchName
    const taskDescription = session.taskDescription
    const worktreePath = session.worktreePath
    const projectId = session.projectId

    if (session.ptyId) {
      try { this.ptyPool.kill(session.ptyId) } catch { /* already exited */ }
      session.ptyId = ''
    }
    if (session.devServerPtyId) {
      try { this.ptyPool.kill(session.devServerPtyId) } catch { /* already exited */ }
      session.devServerPtyId = undefined
    }

    try {
      const status = await getManagedWorktreeStatus(worktreePath)
      if (status.trim().length > 0) {
        await commitManagedWorktree(worktreePath, 'Auto-commit: work from developer mode')
        debugLog(`[session] auto-committed changes on branch ${branchName}`)
      }
    } catch (err) {
      debugLog(`[session] auto-commit failed: ${err}`)
    }

    if (!session.noWorktree) {
      try {
        await gitExec(['worktree', 'remove', worktreePath, '--force'], this.projectRegistry.getProject(projectId)?.path ?? '')
        await removeWorktreeMeta(worktreePath)
      } catch {
        // Best-effort cleanup
      }
      session.noWorktree = true
    }

    await this.onKillSession(sessionId)

    const project = this.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    return { projectPath: project.path, branchName, taskDescription }
  }
}
