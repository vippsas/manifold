import { PtyPool } from '../agent/pty-pool'
import { detectStatus } from '../agent/status-detector'
import { detectAddDir } from '../fs/add-dir-detector'
import { detectUrl } from '../fs/url-detector'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { FileWatcher } from '../fs/file-watcher'
import { debugLog } from '../app/debug-log'
import type { InternalSession } from './session-types'
import type { SimpleRuntimeOutputMode } from '../agent/simple-runtime'
import type { TokenUsage } from '../../shared/verdict-types'
import type { GitOperationsManager } from '../git/git-operations'
import { predictNextCommand } from './shell-suggestion'
import { handleStreamJsonEvent, type StreamJsonCtx } from './session-stream-json'
import { hasShellPromptAtEnd as hasPromptAtEnd } from './session-shell-prompt-detection'

export { hasShellPromptAtEnd, isAtShellPromptLine } from './session-shell-prompt-detection'

export class SessionStreamWirer {
  private gitOps: GitOperationsManager | undefined
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private ptyPool: PtyPool,
    private getChatAdapter: () => ChatAdapter | null,
    private sendToRenderer: (channel: string, ...args: unknown[]) => void,
    private fileWatcher: FileWatcher | undefined,
    private onPersistAdditionalDirs: (session: InternalSession) => void,
    private onDevServerNeeded: (session: InternalSession) => void,
    private onSlashCommands?: (session: InternalSession, commands: string[]) => void,
    private onTurnUsage?: (session: InternalSession, usage: TokenUsage) => void,
    private onRunUsage?: (session: InternalSession, runId: string, usage: TokenUsage, turns: number) => void,
    private onRuntimeMeta?: (session: InternalSession) => void,
  ) {}

  setGitOps(gitOps: GitOperationsManager): void {
    this.gitOps = gitOps
  }

  private streamCtx(): StreamJsonCtx {
    return {
      getChatAdapter: this.getChatAdapter,
      sendToRenderer: this.sendToRenderer,
      onDevServerNeeded: this.onDevServerNeeded,
      onSlashCommands: this.onSlashCommands,
      onTurnUsage: this.onTurnUsage,
      onRunUsage: this.onRunUsage,
      onRuntimeMeta: this.onRuntimeMeta,
    }
  }

  /**
   * Track PTY output activity per session.
   * Emits `agent:activity-state` when transitioning between active/idle.
   * Active = PTY output within last 5 seconds. Idle = no output for 5s.
   */
  trackActivity(session: InternalSession): void {
    const wasIdle = !session.lastOutputTime ||
      Date.now() - session.lastOutputTime > 2000
    session.lastOutputTime = Date.now()

    if (wasIdle) {
      this.sendToRenderer('agent:activity-state', {
        sessionId: session.id,
        isOutputting: true,
      })
    }

    // Reset the 5-second idle timer
    const existing = this.idleTimers.get(session.id)
    if (existing) clearTimeout(existing)

    this.idleTimers.set(
      session.id,
      setTimeout(() => {
        this.idleTimers.delete(session.id)
        this.sendToRenderer('agent:activity-state', {
          sessionId: session.id,
          isOutputting: false,
        })
      }, 2000)
    )
  }

  /** Clear idle timer for a session (call on exit or cleanup). */
  clearActivityTimer(sessionId: string): void {
    const timer = this.idleTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.idleTimers.delete(sessionId)
    }
  }

  wireOutputStreaming(ptyId: string, session: InternalSession): void {
    this.ptyPool.onData(ptyId, (data: string) => {
      session.outputBuffer += data
      if (session.outputBuffer.length > 100_000) {
        session.outputBuffer = session.outputBuffer.slice(-50_000)
      }

      // Feed rolling plain-text buffer for NL command translator context
      session.nlOutputBuffer?.append(data)

      this.trackActivity(session)

      if (session.runtimeId !== '__shell__') {
        const newStatus = detectStatus(session.outputBuffer, session.runtimeId)
        if (newStatus !== session.status) {
          session.status = newStatus
          this.sendToRenderer('agent:status', { sessionId: session.id, status: newStatus })
        }

        const addedDir = detectAddDir(session.outputBuffer.slice(-2000))
        if (addedDir && !session.additionalDirs.includes(addedDir)) {
          session.additionalDirs.push(addedDir)
          this.sendToRenderer('agent:dirs-changed', {
            sessionId: session.id,
            additionalDirs: [...session.additionalDirs],
          })
          this.onPersistAdditionalDirs(session)
          this.fileWatcher?.watchAdditionalDir(addedDir, session.id)
        }

        const urlResult = detectUrl(session.outputBuffer.slice(-2000))
        if (urlResult && !session.detectedUrl) {
          session.detectedUrl = urlResult.url
          this.sendToRenderer('preview:url-detected', {
            sessionId: session.id,
            url: urlResult.url,
          })
        }
      }

      // Detect Manifold shell prompt and trigger AI command prediction immediately.
      // Use the accumulated buffer so prompt detection still works if PTY chunks
      // split the prompt glyph away from the current output chunk.
      if (session.runtimeId === '__shell__' && this.gitOps && hasPromptAtEnd(session.outputBuffer)
          && !session.shellSuggestion?.pending && !session.shellSuggestion?.activeSuggestion
          && !session.nlPending) {
        if (!session.nlInputBuffer?.hasBufferedInput()) {
          void predictNextCommand(session, this.ptyPool, this.gitOps)
        }
      }

      // Only a chat-mode agent's output belongs in the chat. An interactive
      // agent paints a TUI, and its redraw frames stripped of ANSI are
      // unreadable half-sentences — which then persist as that folder's chat
      // history and feed the memory compressor as fake "interactions".
      if (session.nonInteractive) {
        this.getChatAdapter()?.processPtyOutput(session.id, data)
      }
      this.sendToRenderer('agent:activity', { sessionId: session.id })
      this.sendToRenderer('agent:output', { sessionId: session.id, data })
    })
  }

  wireExitHandling(ptyId: string, session: InternalSession): void {
    this.ptyPool.onExit(ptyId, (exitCode: number) => {
      if (session.ptyId !== ptyId) return
      session.status = 'done'
      session.pid = null
      session.ptyId = ''
      this.clearActivityTimer(session.id)
      this.sendToRenderer('agent:activity-state', {
        sessionId: session.id,
        isOutputting: false,
      })
      this.sendToRenderer('agent:status', { sessionId: session.id, status: 'done' })
      this.sendToRenderer('agent:exit', { sessionId: session.id, code: exitCode })
    })
  }

  /**
   * Parse NDJSON stream from `claude -p --output-format stream-json`.
   * Each line is a JSON object. We extract assistant text content and
   * stream it to the chat in real time.
   */
  wireStreamJsonOutput(
    ptyId: string,
    session: InternalSession,
    outputMode: Exclude<SimpleRuntimeOutputMode, 'plain-text'> = 'claude-stream-json',
  ): void {
    session.streamJsonLineBuffer = ''

    this.ptyPool.onData(ptyId, (data: string) => {
      debugLog(`[stream-json] raw data (${data.length} bytes): ${data.slice(0, 500)}`)
      session.outputBuffer += data
      if (session.outputBuffer.length > 100_000) {
        session.outputBuffer = session.outputBuffer.slice(-50_000)
      }
      this.trackActivity(session)
      session.streamJsonLineBuffer = (session.streamJsonLineBuffer ?? '') + data
      this.sendToRenderer('agent:activity', { sessionId: session.id })

      // Process complete lines
      const lines = session.streamJsonLineBuffer.split('\n')
      // Keep the last (potentially incomplete) line in the buffer
      session.streamJsonLineBuffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
          const event = JSON.parse(trimmed)
          debugLog(`[stream-json] event type=${event.type}`)
          handleStreamJsonEvent(this.streamCtx(), session, event, ptyId, outputMode)
        } catch {
          debugLog(`[stream-json] non-JSON line: ${trimmed.slice(0, 200)}`)
        }
      }
    })
  }

  /**
   * Print-mode processes exit after each prompt. The session stays alive
   * in 'waiting' state, ready for follow-up messages via spawnPrintModeFollowUp.
   */
  wirePrintModeExitHandling(ptyId: string, session: InternalSession): void {
    this.ptyPool.onExit(ptyId, () => {
      // Guard against stale exit: if a new process has already replaced this one,
      // don't overwrite its 'running' status with 'waiting'.
      if (session.ptyId && session.ptyId !== ptyId) return
      this.flushStreamJsonBuffer(session, ptyId)
      this.clearActivityTimer(session.id)
      this.sendToRenderer('agent:activity-state', {
        sessionId: session.id,
        isOutputting: false,
      })
      session.status = 'waiting'
      session.pid = null
      session.ptyId = ''
      this.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
    })
  }

  /**
   * Parse any trailing line left in the stream-json buffer at process exit.
   * Without this, an assistant event whose final newline never arrived before
   * the PTY closed would be silently dropped — surfacing as a "missing reply"
   * that only reappears after the next chat-messages refetch.
   */
  private flushStreamJsonBuffer(session: InternalSession, ptyId: string): void {
    const mode = session.nonInteractiveOutputMode
    if (mode !== 'claude-stream-json' && mode !== 'codex-jsonl') return
    const trailing = (session.streamJsonLineBuffer ?? '').trim()
    session.streamJsonLineBuffer = ''
    if (!trailing) return
    try {
      const event = JSON.parse(trailing)
      handleStreamJsonEvent(this.streamCtx(), session, event, ptyId, mode)
    } catch {
      // Non-JSON trailing data is not recoverable as a chat message.
    }
  }

  /**
   * After the initial print-mode build finishes, auto-start the dev server
   * so the preview pane can show the app.
   */
  wirePrintModeInitialExitHandling(ptyId: string, session: InternalSession): void {
    this.ptyPool.onExit(ptyId, () => {
      // Guard against stale exit: if a follow-up turn has already replaced this
      // PTY, don't wipe its ptyId/pid or spawn a dev server mid-turn.
      if (session.ptyId && session.ptyId !== ptyId) return
      this.clearActivityTimer(session.id)
      this.sendToRenderer('agent:activity-state', {
        sessionId: session.id,
        isOutputting: false,
      })
      session.pid = null
      session.ptyId = ''

      if (session.detectedUrl || session.devServerPtyId) {
        // URL already detected or dev server already started (from result event).
        debugLog(`[session] initial build finished, URL already detected: ${session.detectedUrl}`)
        if (session.status !== 'running') {
          session.status = 'waiting'
          this.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
        }
      } else {
        debugLog(`[session] initial build finished, starting dev server in ${session.worktreePath}`)
        this.onDevServerNeeded(session)
      }
    })
  }
}
