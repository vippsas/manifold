import { PtyPool } from './pty-pool'
import { ProjectRegistry } from './project-registry'
import { gitExec } from './git-exec'
import { removeWorktreeMeta } from './worktree-meta'
import { debugLog } from './debug-log'
import type { InternalSession } from './session-types'

export class SessionTeardown {
  constructor(
    private sessions: Map<string, InternalSession>,
    private ptyPool: PtyPool,
    private projectRegistry: ProjectRegistry,
    private onKillSession: (sessionId: string) => Promise<void>,
  ) {}

  async killNonInteractiveSessions(projectId: string): Promise<{ killedIds: string[]; branchName?: string }> {
    const toKill = Array.from(this.sessions.values())
      .filter(s => s.projectId === projectId && s.nonInteractive)
    const killedIds: string[] = []
    let branchName: string | undefined

    for (const session of toKill) {
      branchName = session.branchName

      if (session.ptyId) {
        try { this.ptyPool.kill(session.ptyId) } catch { /* already exited */ }
        session.ptyId = ''
      }
      if (session.devServerPtyId) {
        try { this.ptyPool.kill(session.devServerPtyId) } catch { /* already exited */ }
        session.devServerPtyId = undefined
      }

      try {
        const status = await gitExec(['status', '--porcelain'], session.worktreePath)
        if (status.trim().length > 0) {
          await gitExec(['add', '-A'], session.worktreePath)
          await gitExec(['commit', '-m', 'Auto-commit: work from simple mode'], session.worktreePath)
          debugLog(`[session] auto-committed changes on branch ${branchName}`)
        }
      } catch (err) {
        debugLog(`[session] auto-commit failed: ${err}`)
      }

      await this.onKillSession(session.id)
      killedIds.push(session.id)
    }

    if (branchName) {
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

    return { killedIds, branchName }
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
      const status = await gitExec(['status', '--porcelain'], worktreePath)
      if (status.trim().length > 0) {
        await gitExec(['add', '-A'], worktreePath)
        await gitExec(['commit', '-m', 'Auto-commit: work from developer mode'], worktreePath)
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
