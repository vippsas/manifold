import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
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
    captureCodexThread(session, event.thread_id)
    return
  }

  if (type === 'event_msg') {
    const payload = event.payload as CodexEventPayload | undefined
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

interface CodexEventPayload {
  type?: string
  message?: string
  saved_path?: string
  result?: string
  call_id?: string
}

function captureCodexThread(session: InternalSession, threadId: unknown): void {
  if (typeof threadId !== 'string' || !threadId.trim()) return
  const nextThreadId = threadId.trim()
  if (session.codexThreadId !== nextThreadId) {
    session.codexThreadId = nextThreadId
    session.codexPublishedGeneratedImageSources = []
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

async function publishGeneratedImage(ctx: StreamJsonCtx, session: InternalSession, payload: CodexEventPayload): Promise<void> {
  const savedPath = (await saveGeneratedImageToProject(session, payload)) ?? payload.saved_path
  if (!savedPath) return

  publishImageRef(ctx, session, savedPath)
}

async function publishGeneratedImagesFromThread(ctx: StreamJsonCtx, session: InternalSession): Promise<void> {
  const sourcePaths = await listGeneratedImagePathsForThread(session.codexThreadId)
  if (sourcePaths.length === 0) return

  const published = new Set(session.codexPublishedGeneratedImageSources ?? [])
  for (const sourcePath of sourcePaths) {
    const sourceKey = await realpathIfReadable(sourcePath)
    if (!sourceKey || published.has(sourceKey)) continue

    const savedPath = await saveGeneratedImageToProject(session, { saved_path: sourcePath })
    if (!savedPath) continue

    published.add(sourceKey)
    publishImageRef(ctx, session, savedPath)
  }
  session.codexPublishedGeneratedImageSources = [...published]
}

function publishImageRef(ctx: StreamJsonCtx, session: InternalSession, filePath: string): void {
  const imageRef = `[image: ${filePath}]`
  const adapter = ctx.getChatAdapter()
  const existing = adapter?.getMessages(session.id) ?? []
  if (existing.some(m => m.role === 'agent' && m.text === imageRef)) return

  adapter?.addAgentMessage(session.id, imageRef)
}

async function saveGeneratedImageToProject(session: InternalSession, payload: CodexEventPayload): Promise<string | null> {
  try {
    const buffer = await imageBufferFromPayload(payload)
    if (!buffer) return null

    const ext = imageExtension(buffer)
    if (!ext) return null

    const baseName = sanitizeFileName(payload.call_id ?? sourceBaseName(payload.saved_path) ?? randomUUID())
    const dir = path.join(session.worktreePath, 'public', 'generated-images')
    const filePath = path.join(dir, `${baseName}.${ext}`)

    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, buffer)
    return filePath
  } catch {
    return null
  }
}

async function imageBufferFromPayload(payload: CodexEventPayload): Promise<Buffer | null> {
  if (payload.result) {
    const buffer = Buffer.from(payload.result, 'base64')
    return buffer.byteLength > 0 ? buffer : null
  }

  if (payload.saved_path) {
    return readTrustedGeneratedImageFile(payload.saved_path)
  }

  return null
}

async function readTrustedGeneratedImageFile(filePath: string): Promise<Buffer | null> {
  try {
    const resolved = await fs.realpath(path.resolve(filePath))
    const generatedDir = await fs.realpath(codexGeneratedImagesDir())
    if (resolved !== generatedDir && !resolved.startsWith(generatedDir + path.sep)) return null
    return await fs.readFile(resolved)
  } catch {
    return null
  }
}

async function listGeneratedImagePathsForThread(threadId: string | undefined): Promise<string[]> {
  if (!threadId || !/^[a-zA-Z0-9_-]+$/.test(threadId)) return []
  try {
    const generatedDir = await fs.realpath(codexGeneratedImagesDir())
    const threadDir = await fs.realpath(path.join(generatedDir, threadId))
    if (threadDir !== generatedDir && !threadDir.startsWith(generatedDir + path.sep)) return []
    const entries = await fs.readdir(threadDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(threadDir, entry.name))
  } catch {
    return []
  }
}

function codexGeneratedImagesDir(): string {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  return path.join(codexHome, 'generated_images')
}

async function realpathIfReadable(filePath: string): Promise<string | null> {
  try {
    return await fs.realpath(path.resolve(filePath))
  } catch {
    return null
  }
}

function imageExtension(buffer: Buffer): string | null {
  if (buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a) {
    return 'png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'gif'
  return null
}

function sanitizeFileName(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '')
  return safe || randomUUID()
}

function sourceBaseName(filePath: string | undefined): string | null {
  if (!filePath) return null
  const ext = path.extname(filePath)
  return path.basename(filePath, ext)
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
