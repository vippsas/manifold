import { PtyPool } from './pty-pool'
import { detectStatus } from './status-detector'
import { detectAddDir } from './add-dir-detector'
import { detectUrl } from './url-detector'
import type { ChatAdapter } from './chat-adapter'
import type { FileWatcher } from './file-watcher'
import { debugLog } from './debug-log'
import type { InternalSession } from './session-types'

export class SessionStreamWirer {
  constructor(
    private ptyPool: PtyPool,
    private getChatAdapter: () => ChatAdapter | null,
    private sendToRenderer: (channel: string, ...args: unknown[]) => void,
    private fileWatcher: FileWatcher | undefined,
    private onPersistAdditionalDirs: (session: InternalSession) => void,
    private onDevServerNeeded: (session: InternalSession) => void,
  ) {}

  wireOutputStreaming(ptyId: string, session: InternalSession): void {
    this.ptyPool.onData(ptyId, (data: string) => {
      session.outputBuffer += data
      if (session.outputBuffer.length > 100_000) {
        session.outputBuffer = session.outputBuffer.slice(-50_000)
      }

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

      this.getChatAdapter()?.processPtyOutput(session.id, data)
      this.sendToRenderer('agent:output', { sessionId: session.id, data })
    })
  }

  wireExitHandling(ptyId: string, session: InternalSession): void {
    this.ptyPool.onExit(ptyId, (exitCode: number) => {
      session.status = 'done'
      session.pid = null
      session.ptyId = ''
      this.sendToRenderer('agent:status', { sessionId: session.id, status: 'done' })
      this.sendToRenderer('agent:exit', { sessionId: session.id, code: exitCode })
    })
  }

  /**
   * Parse NDJSON stream from `claude -p --output-format stream-json`.
   * Each line is a JSON object. We extract assistant text content and
   * stream it to the chat in real time.
   */
  wireStreamJsonOutput(ptyId: string, session: InternalSession): void {
    session.streamJsonLineBuffer = ''

    this.ptyPool.onData(ptyId, (data: string) => {
      debugLog(`[stream-json] raw data (${data.length} bytes): ${data.slice(0, 500)}`)
      session.streamJsonLineBuffer = (session.streamJsonLineBuffer ?? '') + data

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
          this.handleStreamJsonEvent(session, event)
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
      session.status = 'waiting'
      session.pid = null
      session.ptyId = ''
      this.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
    })
  }

  /**
   * After the initial print-mode build finishes, auto-start the dev server
   * so the preview pane can show the app.
   */
  wirePrintModeInitialExitHandling(ptyId: string, session: InternalSession): void {
    this.ptyPool.onExit(ptyId, () => {
      session.pid = null
      session.ptyId = ''

      if (session.detectedUrl) {
        // The agent already started the dev server and we detected its URL
        // from the stream-json output — no need to start another one.
        debugLog(`[session] initial build finished, URL already detected: ${session.detectedUrl}`)
        session.status = 'waiting'
        this.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
      } else {
        debugLog(`[session] initial build finished, starting dev server in ${session.worktreePath}`)
        this.onDevServerNeeded(session)
      }
    })
  }

  private handleStreamJsonEvent(session: InternalSession, event: Record<string, unknown>): void {
    const type = event.type as string | undefined

    if (type === 'assistant') {
      // Each assistant turn emits an event with the full message content.
      // Extract text blocks and send them to chat.
      const message = event.message as { content?: Array<{ type: string; text?: string }> } | undefined
      if (message?.content) {
        const textParts = message.content
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text!)
        if (textParts.length > 0) {
          const text = textParts.join('\n')
          this.getChatAdapter()?.addAgentMessage(session.id, text)
          this.detectUrlInText(session, text)
        }
      }
    } else if (type === 'result') {
      // Final result — only emit if no agent messages were sent (fallback)
      const result = event.result as string | undefined
      const subtype = event.subtype as string | undefined
      if (result && subtype === 'success') {
        const existing = this.getChatAdapter()?.getMessages(session.id) ?? []
        const hasAgentMsg = existing.some(m => m.role === 'agent')
        if (!hasAgentMsg) {
          this.getChatAdapter()?.addAgentMessage(session.id, result)
        }
        this.detectUrlInText(session, result)
      }
      // The result event signals the agent is done. Transition to 'waiting'
      // immediately rather than waiting for the process to exit (which can
      // linger for over a minute after the result is emitted).
      session.status = 'waiting'
      this.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
    }
  }

  private detectUrlInText(session: InternalSession, text: string): void {
    if (session.detectedUrl) return
    const urlResult = detectUrl(text)
    if (urlResult) {
      session.detectedUrl = urlResult.url
      debugLog(`[session] URL detected in agent text: ${urlResult.url}`)
      this.sendToRenderer('preview:url-detected', {
        sessionId: session.id,
        url: urlResult.url,
      })
    }
  }
}
