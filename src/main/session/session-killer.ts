import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import type { PtyPool } from '../agent/pty-pool'
import { debugLog } from '../app/debug-log'
import type { FileWatcher } from '../fs/file-watcher'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { MemoryCapture } from '../memory/memory-capture'
import type { InternalSession } from './session-types'
import type { VerdictRecorder } from './verdict-recorder'

interface SessionKillerDeps {
  sessions: Map<string, InternalSession>
  ptyPool: PtyPool
  getFileWatcher: () => FileWatcher | undefined
  getMemoryCapture: () => MemoryCapture | null
  getChatAdapter: () => ChatAdapter | null
  notifySessionsChanged: (projectId: string) => void
}

export class SessionKiller {
  private verdictRecorder: VerdictRecorder | null = null

  constructor(private deps: SessionKillerDeps) {}

  setVerdictRecorder(recorder: VerdictRecorder): void { this.verdictRecorder = recorder }

  /** Closing an agent never removes a checkout. The workspace owns it, and its
   *  other agents are still working there — the worktrees go when the workspace
   *  does (`WorkspaceManager.remove`). */
  async killSession(sessionId: string): Promise<void> {
    const session = this.deps.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const { projectId } = session

    this.deps.sessions.delete(sessionId)
    this.cleanupSession(session)
    void this.verdictRecorder?.onSessionTerminated(sessionId)

    this.deps.notifySessionsChanged(projectId)
  }

  /** Stop and forget a session while deliberately retaining its worktree(s).
   * Used when agent settings replace it with a fresh session in the same place. */
  retireSession(sessionId: string): void {
    const session = this.deps.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    this.deps.sessions.delete(sessionId)
    this.cleanupSession(session)
    void this.verdictRecorder?.onSessionTerminated(sessionId)
    this.deps.notifySessionsChanged(session.projectId)
  }

  private cleanupSession(session: InternalSession): void {
    const fileWatcher = this.deps.getFileWatcher()
    if (fileWatcher) {
      for (const dir of session.additionalDirs) {
        fileWatcher.unwatchAdditionalDir(dir, session.id)
      }
      // Caller already removed `session` from the map. Keep shared polls pointing
      // at a survivor so file/conflict events and branch updates still reach it.
      // Dormant sessions registered nothing, so closing one must not start a poll.
      const survivor = Array.from(this.deps.sessions.values()).find(
        (other) => other.worktreePath === session.worktreePath && other.checkoutWatched,
      )
      if (!survivor) {
        void fileWatcher.unwatch(session.worktreePath)
      } else if (session.checkoutWatched) {
        fileWatcher.watch(session.worktreePath, survivor.id, session.id)
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
    if (session.slashCommandProbePtyId) {
      try { this.deps.ptyPool.kill(session.slashCommandProbePtyId) } catch { /* already exited */ }
    }

    const safeSessionId = session.id.replace(/[^a-zA-Z0-9_-]/g, '_')
    const pastedImagesDir = path.join(os.tmpdir(), 'manifold-chat-images', safeSessionId)
    void fs.rm(pastedImagesDir, { recursive: true, force: true }).catch(() => { /* best-effort */ })
  }

}
