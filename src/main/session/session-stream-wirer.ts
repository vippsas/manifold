import { BrowserWindow } from 'electron'
import { PtyPool } from '../agent/pty-pool'
import { detectStatus, detectVercelUrl } from '../agent/status-detector'
import { detectAddDir } from '../fs/add-dir-detector'
import { detectUrl } from '../fs/url-detector'
import { parseOptions } from '../agent/chat-adapter'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { FileWatcher } from '../fs/file-watcher'
import { debugLog } from '../app/debug-log'
import type { InternalSession } from './session-types'
import type { SimpleRuntimeOutputMode } from '../agent/simple-runtime'

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

        const vercelUrl = detectVercelUrl(session.outputBuffer)
        if (vercelUrl && !session.detectedVercelUrl) {
          session.detectedVercelUrl = vercelUrl
          for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed()) {
              win.webContents.send('simple:deploy-status-update', {
                sessionId: session.id,
                stage: 'live',
                message: 'Deployed successfully',
                url: vercelUrl,
              })
            }
          }
        }
      }

      this.getChatAdapter()?.processPtyOutput(session.id, data)
      this.sendToRenderer('agent:activity', { sessionId: session.id })
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
  wireStreamJsonOutput(
    ptyId: string,
    session: InternalSession,
    outputMode: Exclude<SimpleRuntimeOutputMode, 'plain-text'> = 'claude-stream-json',
  ): void {
    session.streamJsonLineBuffer = ''

    this.ptyPool.onData(ptyId, (data: string) => {
      debugLog(`[stream-json] raw data (${data.length} bytes): ${data.slice(0, 500)}`)
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
          this.handleStreamJsonEvent(session, event, ptyId, outputMode)
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

  private handleStreamJsonEvent(
    session: InternalSession,
    event: Record<string, unknown>,
    ptyId: string | undefined,
    outputMode: Exclude<SimpleRuntimeOutputMode, 'plain-text'>,
  ): void {
    if (outputMode === 'codex-jsonl') {
      this.handleCodexJsonEvent(session, event, ptyId)
      return
    }

    this.handleClaudeStreamJsonEvent(session, event, ptyId)
  }

  private handleClaudeStreamJsonEvent(session: InternalSession, event: Record<string, unknown>, ptyId?: string): void {
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
          const { cleanText, options } = parseOptions(text)
          const adapter = this.getChatAdapter()

          // Skip if the last agent message has identical text (avoids duplicates
          // when the stream emits multiple assistant events with the same content)
          const existing = adapter?.getMessages(session.id) ?? []
          const lastAgent = [...existing].reverse().find(m => m.role === 'agent')
          const textToCompare = options ? cleanText : text
          if (lastAgent?.text === textToCompare) {
            return
          }

          if (options) {
            adapter?.addAgentMessageWithOptions(session.id, cleanText, options)
          } else {
            adapter?.addAgentMessage(session.id, text)
          }
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
          const { cleanText, options } = parseOptions(result)
          const adapter = this.getChatAdapter()
          if (options) {
            adapter?.addAgentMessageWithOptions(session.id, cleanText, options)
          } else {
            adapter?.addAgentMessage(session.id, result)
          }
        }
      }
      // The result event signals the agent is done. Transition to 'waiting'
      // immediately rather than waiting for the process to exit (which can
      // linger for over a minute after the result is emitted).
      // Guard: skip if a new process has already replaced this one.
      if (!ptyId || session.ptyId === ptyId) {
        if (!session.detectedUrl && !session.devServerPtyId) {
          this.onDevServerNeeded(session)
        } else {
          session.status = 'waiting'
          this.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
        }
      }
    }
  }

  private handleCodexJsonEvent(session: InternalSession, event: Record<string, unknown>, ptyId?: string): void {
    const type = event.type as string | undefined

    if (type === 'item.completed') {
      const item = event.item as { type?: string; text?: string; message?: string } | undefined
      if (item?.type === 'agent_message' && item.text) {
        this.publishAgentText(session, item.text)
        return
      }
      if (item?.type === 'error' && item.message) {
        this.getChatAdapter()?.addSystemMessage(session.id, item.message)
      }
      return
    }

    if (type === 'error') {
      const message = event.message as string | undefined
      if (message) {
        this.getChatAdapter()?.addSystemMessage(session.id, message)
      }
      return
    }

    if (type === 'turn.completed' && (!ptyId || session.ptyId === ptyId)) {
      if (!session.detectedUrl && !session.devServerPtyId) {
        this.onDevServerNeeded(session)
      } else {
        session.status = 'waiting'
        this.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
      }
    }
  }

  private publishAgentText(session: InternalSession, text: string): void {
    const { cleanText, options } = parseOptions(text)
    const adapter = this.getChatAdapter()

    const existing = adapter?.getMessages(session.id) ?? []
    const lastAgent = [...existing].reverse().find(m => m.role === 'agent')
    const textToCompare = options ? cleanText : text
    if (lastAgent?.text === textToCompare) return

    if (options) {
      adapter?.addAgentMessageWithOptions(session.id, cleanText, options)
    } else {
      adapter?.addAgentMessage(session.id, text)
    }
  }

}
