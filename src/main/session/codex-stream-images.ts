import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { InternalSession } from './session-types'

interface CodexImageCtx {
  getChatAdapter: () => ChatAdapter | null
}

export interface CodexImageEventPayload {
  saved_path?: string
  result?: string
  call_id?: string
}

export async function publishGeneratedImage(
  ctx: CodexImageCtx,
  session: InternalSession,
  payload: CodexImageEventPayload,
): Promise<void> {
  const savedPath = (await saveGeneratedImageToProject(session, payload)) ?? payload.saved_path
  if (savedPath) publishImageRef(ctx, session, savedPath)
}

export async function publishGeneratedImagesFromThread(ctx: CodexImageCtx, session: InternalSession): Promise<void> {
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

function publishImageRef(ctx: CodexImageCtx, session: InternalSession, filePath: string): void {
  const imageRef = `[image: ${filePath}]`
  const adapter = ctx.getChatAdapter()
  const existing = adapter?.getMessages(session.id) ?? []
  if (!existing.some(m => m.role === 'agent' && m.text === imageRef)) {
    adapter?.addAgentMessage(session.id, imageRef)
  }
}

async function saveGeneratedImageToProject(session: InternalSession, payload: CodexImageEventPayload): Promise<string | null> {
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

async function imageBufferFromPayload(payload: CodexImageEventPayload): Promise<Buffer | null> {
  if (payload.result) {
    const buffer = Buffer.from(payload.result, 'base64')
    return buffer.byteLength > 0 ? buffer : null
  }
  return payload.saved_path ? readTrustedGeneratedImageFile(payload.saved_path) : null
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
    return entries.filter((entry) => entry.isFile()).map((entry) => path.join(threadDir, entry.name))
  } catch {
    return []
  }
}

function codexGeneratedImagesDir(): string {
  return path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images')
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
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
      buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return 'png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buffer.length >= 6 &&
      (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
       buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'gif'
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
