import type { PtyPool } from '../agent/pty-pool'
import type { MemoryCapture } from '../memory/memory-capture'
import type { InternalSession } from './session-types'
import type { ShellSessionController } from './shell-session-controller'
import { isAtShellPromptLine } from './session-stream-wirer'

interface SessionIoControllerDeps {
  sessions: Map<string, InternalSession>
  ptyPool: PtyPool
  shellController: ShellSessionController
  getMemoryCapture: () => MemoryCapture | null
  spawnPrintModeFollowUp: (session: InternalSession, input: string) => void
  trackActivity: (session: InternalSession) => void
}

// After SIGINT, some processes (notably electron-vite/electron) leave the
// PTY's slave-side termios in a state where zsh's first prompt-read runs in
// canonical (cooked) mode instead of zle's raw mode. Subsequent key bytes
// get kernel-echoed (e.g. up arrow shows up as `^[[A`) and zle never
// interprets them. Injecting `\r` after a short delay terminates the cooked
// read so zsh re-enters zle properly for the next prompt. Any user keys
// pressed during the window are buffered so they don't get tangled with the
// drain newline.
const POST_INTERRUPT_DRAIN_MS = 500
const POST_DRAIN_FLUSH_MS = 50
const INTERRUPT_BYTE = '\x03'

interface PostInterruptState {
  buffer: string
  timer: ReturnType<typeof setTimeout>
}

export class SessionIoController {
  private postInterruptState = new Map<string, PostInterruptState>()

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

    if (session.runtimeId === '__shell__') {
      if (input.includes(INTERRUPT_BYTE)) {
        this.armPostInterruptDrain(sessionId)
        this.writeToPty(session, input)
        return
      }
      const state = this.postInterruptState.get(sessionId)
      if (state) {
        state.buffer += input
        return
      }

      // Once an interactive program takes over the terminal, stop routing
      // keystrokes through Manifold's shell helpers. Prompt-only features like
      // NL command translation should not mediate input to TUIs or auth prompts.
      if (!isAtShellPromptLine(session.outputBuffer)) {
        this.writeToPty(session, input)
        return
      }
    }

    if (this.deps.shellController.handleInput(session, input)) return
    this.writeToPty(session, input)
  }

  private writeToPty(session: InternalSession, input: string): void {
    if (!session.ptyId) return
    try {
      this.deps.ptyPool.write(session.ptyId, input)
      if (input.includes('\r') || input.includes('\n')) {
        this.deps.trackActivity(session)
      }
    } catch {
      // PTY may have already exited.
    }
  }

  private armPostInterruptDrain(sessionId: string): void {
    const existing = this.postInterruptState.get(sessionId)
    if (existing) {
      clearTimeout(existing.timer)
      this.postInterruptState.set(sessionId, {
        buffer: existing.buffer,
        timer: setTimeout(() => this.runPostInterruptDrain(sessionId), POST_INTERRUPT_DRAIN_MS),
      })
      return
    }
    this.postInterruptState.set(sessionId, {
      buffer: '',
      timer: setTimeout(() => this.runPostInterruptDrain(sessionId), POST_INTERRUPT_DRAIN_MS),
    })
  }

  private runPostInterruptDrain(sessionId: string): void {
    const state = this.postInterruptState.get(sessionId)
    if (!state) return
    this.postInterruptState.delete(sessionId)

    const session = this.deps.sessions.get(sessionId)
    if (!session?.ptyId) return

    this.writeToPty(session, '\r')

    if (!state.buffer) return
    const pending = state.buffer
    setTimeout(() => {
      const current = this.deps.sessions.get(sessionId)
      if (!current?.ptyId) return
      if (this.deps.shellController.handleInput(current, pending)) return
      this.writeToPty(current, pending)
    }, POST_DRAIN_FLUSH_MS)
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
    for (const state of this.postInterruptState.values()) {
      clearTimeout(state.timer)
    }
    this.postInterruptState.clear()
    for (const session of this.deps.sessions.values()) {
      try { this.deps.ptyPool.kill(session.ptyId) } catch { /* best effort */ }
    }
    this.deps.sessions.clear()
  }
}
