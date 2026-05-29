import { parseOptions } from '../agent/chat-adapter'
import { extractSlashCommands } from '../agent/ai-runtime-output-parsers'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { InternalSession } from './session-types'
import type { SimpleRuntimeOutputMode } from '../agent/simple-runtime'

/**
 * Callbacks the stream-JSON event handlers need from SessionStreamWirer.
 * Passing these explicitly keeps the handlers as free functions.
 */
export interface StreamJsonCtx {
  getChatAdapter: () => ChatAdapter | null
  sendToRenderer: (channel: string, ...args: unknown[]) => void
  onDevServerNeeded: (session: InternalSession) => void
  /** Persist the captured slash-command list so the chat `/` autocomplete is ready before the next session's first message. */
  onSlashCommands?: (session: InternalSession, commands: string[]) => void
}

export function handleStreamJsonEvent(
  ctx: StreamJsonCtx,
  session: InternalSession,
  event: Record<string, unknown>,
  ptyId: string | undefined,
  outputMode: Exclude<SimpleRuntimeOutputMode, 'plain-text'>,
): void {
  if (outputMode === 'codex-jsonl') {
    handleCodexJsonEvent(ctx, session, event, ptyId)
    return
  }

  handleClaudeStreamJsonEvent(ctx, session, event, ptyId)
}

function handleClaudeStreamJsonEvent(ctx: StreamJsonCtx, session: InternalSession, event: Record<string, unknown>, ptyId?: string): void {
  const type = event.type as string | undefined

  const slashCommands = extractSlashCommands(event)
  if (slashCommands) {
    session.slashCommands = slashCommands
    ctx.onSlashCommands?.(session, slashCommands)
    ctx.sendToRenderer('agent:slash-commands', { sessionId: session.id, commands: slashCommands })
    return
  }

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
        const adapter = ctx.getChatAdapter()

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
      const existing = ctx.getChatAdapter()?.getMessages(session.id) ?? []
      const hasAgentMsg = existing.some(m => m.role === 'agent')
      if (!hasAgentMsg) {
        const { cleanText, options } = parseOptions(result)
        const adapter = ctx.getChatAdapter()
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
        ctx.onDevServerNeeded(session)
      } else {
        session.status = 'waiting'
        ctx.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
      }
    }
  }
}

function handleCodexJsonEvent(ctx: StreamJsonCtx, session: InternalSession, event: Record<string, unknown>, ptyId?: string): void {
  const type = event.type as string | undefined

  if (type === 'item.completed') {
    const item = event.item as { type?: string; text?: string; message?: string } | undefined
    if (item?.type === 'agent_message' && item.text) {
      publishAgentText(ctx, session, item.text)
      return
    }
    if (item?.type === 'error' && item.message) {
      ctx.getChatAdapter()?.addSystemMessage(session.id, item.message)
    }
    return
  }

  if (type === 'error') {
    const message = event.message as string | undefined
    if (message) {
      ctx.getChatAdapter()?.addSystemMessage(session.id, message)
    }
    return
  }

  if (type === 'turn.completed' && (!ptyId || session.ptyId === ptyId)) {
    if (!session.detectedUrl && !session.devServerPtyId) {
      ctx.onDevServerNeeded(session)
    } else {
      session.status = 'waiting'
      ctx.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
    }
  }
}

function publishAgentText(ctx: StreamJsonCtx, session: InternalSession, text: string): void {
  const { cleanText, options } = parseOptions(text)
  const adapter = ctx.getChatAdapter()

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
