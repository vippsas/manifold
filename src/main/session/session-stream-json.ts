import { parseOptions } from '../agent/chat-adapter'
import { extractSlashCommands } from '../agent/ai-runtime-output-parsers'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { InternalSession } from './session-types'
import type { SimpleRuntimeOutputMode } from '../agent/simple-runtime'
import type { TokenUsage } from '../../shared/verdict-types'
import { publishGeneratedImage, publishGeneratedImagesFromThread, type CodexImageEventPayload } from './codex-stream-images'
import { captureCodexThread, recordCodexTokenCount, recordCodexUserMessage, type CodexUsageEventPayload } from './codex-stream-usage'

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
  /** Record a completed Claude chat-mode turn's token usage (one call per `result` event). */
  onTurnUsage?: (session: InternalSession, usage: TokenUsage) => void
  /** Record the latest cumulative usage for one Codex JSONL run. */
  onRunUsage?: (session: InternalSession, runId: string, usage: TokenUsage, turns: number) => void
  /** Persist runtime metadata captured from a JSONL stream. */
  onRuntimeMeta?: (session: InternalSession) => void
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
    // A `result` event ends one chat-mode turn; record its token usage (zeros if absent).
    const u = event.usage as Record<string, number> | undefined
    ctx.onTurnUsage?.(session, {
      inputTokens: u?.input_tokens ?? 0,
      outputTokens: u?.output_tokens ?? 0,
      cacheReadTokens: u?.cache_read_input_tokens ?? 0,
      cacheCreationTokens: u?.cache_creation_input_tokens ?? 0,
    })
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
      markTurnCompleted(session)
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

  if (type === 'thread.started') {
    captureCodexThread(ctx, session, event.thread_id, ptyId)
    return
  }

  if (type === 'event_msg') {
    const payload = event.payload as CodexEventPayload | undefined
    if (payload?.type === 'user_message') {
      recordCodexUserMessage(session, ptyId)
      return
    }
    if (payload?.type === 'token_count') {
      recordCodexTokenCount(ctx, session, payload, ptyId)
      return
    }
    if (payload?.type === 'agent_message' && payload.message) {
      publishAgentText(ctx, session, payload.message)
      return
    }
    if (payload?.type === 'image_generation_end') {
      void publishGeneratedImage(ctx, session, payload)
      return
    }
    if (payload?.type === 'task_complete' && (!ptyId || session.ptyId === ptyId)) {
      completeCodexTurn(ctx, session)
    }
    return
  }

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
    void publishGeneratedImagesFromThread(ctx, session)
    completeCodexTurn(ctx, session)
  }
}

interface CodexEventPayload extends CodexImageEventPayload, CodexUsageEventPayload {
  type?: string
  message?: string
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

function completeCodexTurn(ctx: StreamJsonCtx, session: InternalSession): void {
  markTurnCompleted(session)
  if (!session.detectedUrl && !session.devServerPtyId) {
    ctx.onDevServerNeeded(session)
  } else {
    session.status = 'waiting'
    ctx.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
  }
}

function markTurnCompleted(session: InternalSession): void {
  session.lastTurnCompletedTime = Date.now()
}
