import type { PtyPool } from '../agent/pty-pool'
import type { MemoryCapture } from '../memory/memory-capture'
import type { InternalSession } from './session-types'
import type { ShellSessionController } from './shell-session-controller'

interface SessionIoControllerDeps {
  sessions: Map<string, InternalSession>
  ptyPool: PtyPool
  shellController: ShellSessionController
  getMemoryCapture: () => MemoryCapture | null
  spawnPrintModeFollowUp: (session: InternalSession, input: string) => void
  trackActivity: (session: InternalSession) => void
}

export class SessionIoController {
  constructor(private deps: SessionIoControllerDeps) {}

  interruptSession(sessionId: string): void {
    const session = this.deps.sessions.get(sessionId)
    if (!session?.ptyId) return
    try {
      this.deps.ptyPool.kill(session.ptyId)
    } catch {
      // PTY may have already exited.
    }
  }

  sendInput(sessionId: string, input: string): void {
    const session = this.deps.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    this.deps.getMemoryCapture()?.recordInput(sessionId, input)

    if (session.nonInteractive) {
      this.deps.spawnPrintModeFollowUp(session, input.trim())
      return
    }

    if (!session.ptyId) return
    if (this.deps.shellController.handleInput(session, input)) return

    try {
      this.deps.ptyPool.write(session.ptyId, input)
      if (input.includes('\r') || input.includes('\n')) {
        this.deps.trackActivity(session)
      }
    } catch {
      // PTY may have already exited.
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.deps.sessions.get(sessionId)
    if (!session) return
    try {
      this.deps.ptyPool.resize(session.ptyId, cols, rows)
    } catch {
      // PTY may have already exited.
    }
  }

  killAllSessions(): void {
    for (const session of this.deps.sessions.values()) {
      try { this.deps.ptyPool.kill(session.ptyId) } catch { /* best effort */ }
    }
    this.deps.sessions.clear()
  }
}
