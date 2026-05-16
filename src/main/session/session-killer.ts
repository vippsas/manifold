import type { PtyPool } from '../agent/pty-pool'
import { debugLog } from '../app/debug-log'
import type { FileWatcher } from '../fs/file-watcher'
import type { WorktreeManager } from '../git/worktree-manager'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { MemoryCapture } from '../memory/memory-capture'
import type { ProjectRegistry } from '../store/project-registry'
import type { InternalSession } from './session-types'
import type { VerdictRecorder } from './verdict-recorder'

interface SessionKillerDeps {
  sessions: Map<string, InternalSession>
  ptyPool: PtyPool
  worktreeManager: WorktreeManager
  projectRegistry: ProjectRegistry
  getFileWatcher: () => FileWatcher | undefined
  getMemoryCapture: () => MemoryCapture | null
  getChatAdapter: () => ChatAdapter | null
  notifySessionsChanged: (projectId: string) => void
}

export class SessionKiller {
  private verdictRecorder: VerdictRecorder | null = null

  constructor(private deps: SessionKillerDeps) {}

  setVerdictRecorder(recorder: VerdictRecorder): void { this.verdictRecorder = recorder }

  async killSession(sessionId: string): Promise<void> {
    const session = this.deps.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const { projectId } = session

    this.deps.sessions.delete(sessionId)
    this.cleanupSession(session)
    void this.verdictRecorder?.onSessionTerminated(sessionId)

    if (session.projectId && !session.noWorktree) {
      await this.removeWorktreeIfUnused(session)
    }

    this.deps.notifySessionsChanged(projectId)
  }

  async killAllSessionsOnWorktree(worktreePath: string): Promise<void> {
    const matching = Array.from(this.deps.sessions.values()).filter(
      (session) => session.worktreePath === worktreePath,
    )
    debugLog(`[session] killAllSessionsOnWorktree path=${worktreePath} count=${matching.length}`)
    if (matching.length === 0) return

    const projectId = matching[0].projectId
    const noWorktree = matching.some((session) => session.noWorktree)

    for (const session of matching) {
      this.deps.sessions.delete(session.id)
      this.cleanupSession(session)
      void this.verdictRecorder?.onSessionTerminated(session.id)
    }

    if (!noWorktree && projectId) {
      await this.removeWorktree(projectId, worktreePath)
    }

    if (projectId) this.deps.notifySessionsChanged(projectId)
  }

  private cleanupSession(session: InternalSession): void {
    const fileWatcher = this.deps.getFileWatcher()
    if (fileWatcher) {
      for (const dir of session.additionalDirs) {
        fileWatcher.unwatchAdditionalDir(dir, session.id)
      }
    }

    this.deps.getMemoryCapture()?.stopCapturing(session.id)
    this.deps.getChatAdapter()?.clearSession(session.id)

    if (session.ptyId) {
      this.deps.ptyPool.kill(session.ptyId)
    }
    if (session.devServerPtyId) {
      try { this.deps.ptyPool.kill(session.devServerPtyId) } catch { /* already exited */ }
    }
  }

  private async removeWorktreeIfUnused(session: InternalSession): Promise<void> {
    const sharedWithOther = Array.from(this.deps.sessions.values()).some(
      (other) => other.worktreePath === session.worktreePath,
    )
    if (sharedWithOther) return

    await this.removeWorktree(session.projectId, session.worktreePath)
  }

  private async removeWorktree(projectId: string, worktreePath: string): Promise<void> {
    const projectPath = this.deps.projectRegistry.getProject(projectId)?.path
    if (!projectPath) {
      debugLog(`[session] worktree remove skipped — project ${projectId} not found in registry (worktree ${worktreePath} left on disk)`)
      return
    }

    try {
      await this.deps.worktreeManager.removeWorktree(projectPath, worktreePath)
    } catch (err) {
      debugLog(`[session] worktree remove failed for ${worktreePath}: ${err}`)
    }
  }
}
