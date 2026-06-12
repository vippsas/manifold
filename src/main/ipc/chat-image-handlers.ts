import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'

async function isWithinExistingDir(filePath: string, dirPath: string): Promise<boolean> {
  try {
    const baseDir = await fs.realpath(dirPath)
    const resolved = await fs.realpath(path.resolve(filePath))
    return resolved === baseDir || resolved.startsWith(baseDir + path.sep)
  } catch {
    return false
  }
}

async function realpathIfReadable(filePath: string): Promise<string | null> {
  try {
    return await fs.realpath(path.resolve(filePath))
  } catch {
    return null
  }
}

async function resolveReadableChatImagePath(filePath: string, projectGeneratedImageDirs: string[] = [], projectImageRoot?: string): Promise<string> {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const allowedDirs = [
    path.join(os.tmpdir(), 'manifold-chat-images'),
    path.join(codexHome, 'generated_images'),
    ...projectGeneratedImageDirs,
    ...(projectImageRoot ? [projectImageRoot] : []),
  ]

  const candidates = path.isAbsolute(filePath)
    ? [filePath]
    : [
        ...(projectImageRoot ? [path.join(projectImageRoot, filePath)] : []),
        filePath,
      ]

  for (const candidate of candidates) {
    const resolved = await realpathIfReadable(candidate)
    if (!resolved) continue
    for (const dir of allowedDirs) {
      if (await isWithinExistingDir(resolved, dir)) return resolved
    }
  }

  throw new Error('Image path is outside the allowed chat image directories')
}

function sessionWorktreePath(deps: IpcDependencies, sessionId?: string): string | undefined {
  return sessionId ? deps.sessionManager.getSession(sessionId)?.worktreePath : undefined
}

function projectGeneratedImageDirs(deps: IpcDependencies, sessionId?: string, sessionWorktree = sessionWorktreePath(deps, sessionId)): string[] {
  const dirs: string[] = []
  if (sessionWorktree) {
    dirs.push(path.join(sessionWorktree, 'public', 'generated-images'))
  }
  for (const project of deps.projectRegistry?.listProjects?.() ?? []) {
    dirs.push(path.join(project.path, 'public', 'generated-images'))
  }
  return dirs
}

export function registerChatImageHandlers(deps: IpcDependencies): void {
  ipcMain.handle('chat:save-pasted-image', async (_event, sessionId: string, dataUrl: string) => {
    const match = /^data:image\/([a-z0-9+]+);base64,(.+)$/i.exec(dataUrl)
    if (!match) throw new Error('Invalid image data URL')
    const mimeSubtype = match[1].toLowerCase()
    const allowed: Record<string, string> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp' }
    const ext = allowed[mimeSubtype]
    if (!ext) throw new Error(`Unsupported image type: image/${mimeSubtype}`)
    const buffer = Buffer.from(match[2], 'base64')
    if (buffer.byteLength === 0) throw new Error('Empty image data')
    const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')
    const dir = path.join(os.tmpdir(), 'manifold-chat-images', safeSessionId)
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, `${randomUUID()}.${ext}`)
    await fs.writeFile(filePath, buffer)
    return filePath
  })

  ipcMain.handle('chat:read-pasted-image', async (_event, filePath: string, sessionId?: string) => {
    const ext = path.extname(filePath).toLowerCase().replace('.', '')
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
    }
    const mime = mimeMap[ext]
    if (!mime) throw new Error(`Unsupported image type: ${ext}`)
    // Only ever read back chat attachments, Codex generated images, or image files in the active worktree.
    const worktreePath = sessionWorktreePath(deps, sessionId)
    const resolved = await resolveReadableChatImagePath(filePath, projectGeneratedImageDirs(deps, sessionId, worktreePath), worktreePath)
    const buffer = await fs.readFile(resolved)
    return `data:${mime};base64,${buffer.toString('base64')}`
  })
}
