import { ipcMain, shell } from 'electron'
import * as fs from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { extname, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { IpcDependencies } from './types'
import type { AgentSession } from '../../shared/types'

const execFileAsync = promisify(execFile)

function isUnderDir(filePath: string, dir: string): boolean {
  const prefix = dir.endsWith('/') ? dir : dir + '/'
  return filePath === dir || filePath.startsWith(prefix)
}

function isPathAllowed(resolved: string, session: AgentSession): boolean {
  if (isUnderDir(resolved, session.worktreePath)) return true
  return session.additionalDirs.some((dir) => isUnderDir(resolved, dir))
}

export function registerFileHandlers(deps: IpcDependencies): void {
  const { sessionManager, fileWatcher } = deps

  ipcMain.handle('files:tree', (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return fileWatcher.getFileTree(session.worktreePath)
  })

  ipcMain.handle('files:tree-dir', (_event, sessionId: string, dirPath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    if (!session.additionalDirs.includes(dirPath)) {
      throw new Error(`Directory not in session additional dirs: ${dirPath}`)
    }
    return fileWatcher.getFileTree(dirPath)
  })

  ipcMain.handle('files:dir-branch', async (_event, sessionId: string, dirPath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    if (!isPathAllowed(dirPath, session)) {
      throw new Error(`Directory not in allowed paths: ${dirPath}`)
    }
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: dirPath,
        timeout: 5000,
      })
      return stdout.trim() || null
    } catch {
      return null
    }
  })

  ipcMain.handle('files:read', (_event, sessionId: string, filePath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, filePath)
    if (!isPathAllowed(resolved, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    return fileWatcher.readFile(resolved)
  })

  ipcMain.handle('files:read-data-url', (_event, sessionId: string, filePath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, filePath)
    if (!isPathAllowed(resolved, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    return readFileAsDataUrl(resolved)
  })

  ipcMain.handle('files:write', (_event, sessionId: string, filePath: string, content: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, filePath)
    if (!isPathAllowed(resolved, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    fileWatcher.writeFile(resolved, content)
  })

  ipcMain.handle('files:delete', (_event, sessionId: string, filePath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, filePath)
    if (!isPathAllowed(resolved, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    fileWatcher.deleteFile(resolved)
    return { tree: fileWatcher.getFileTree(session.worktreePath) }
  })

  ipcMain.handle('files:rename', (_event, sessionId: string, oldPath: string, newPath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolvedOld = resolve(session.worktreePath, oldPath)
    if (!isPathAllowed(resolvedOld, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    const resolvedNew = resolve(session.worktreePath, newPath)
    if (!isPathAllowed(resolvedNew, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    fileWatcher.renameFile(resolvedOld, resolvedNew)
    return { tree: fileWatcher.getFileTree(session.worktreePath) }
  })

  ipcMain.handle('files:create-file', (_event, sessionId: string, dirPath: string, fileName: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolvedDir = resolve(session.worktreePath, dirPath)
    if (!isPathAllowed(resolvedDir, session)) {
      throw new Error('Path traversal denied: directory outside allowed directories')
    }
    const filePath = resolve(resolvedDir, fileName)
    if (!isPathAllowed(filePath, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    fileWatcher.createFile(filePath)
    return { tree: fileWatcher.getFileTree(session.worktreePath) }
  })

  ipcMain.handle('files:create-dir', (_event, sessionId: string, dirPath: string, dirName: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolvedDir = resolve(session.worktreePath, dirPath)
    if (!isPathAllowed(resolvedDir, session)) {
      throw new Error('Path traversal denied: directory outside allowed directories')
    }
    const newDirPath = resolve(resolvedDir, dirName)
    if (!isPathAllowed(newDirPath, session)) {
      throw new Error('Path traversal denied: directory outside allowed directories')
    }
    fileWatcher.createDir(newDirPath)
    return { tree: fileWatcher.getFileTree(session.worktreePath) }
  })

  ipcMain.handle('files:import', (_event, sessionId: string, dirPath: string, sourcePaths: string[]) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolvedDir = resolve(session.worktreePath, dirPath)
    if (!isPathAllowed(resolvedDir, session)) {
      throw new Error('Path traversal denied: directory outside allowed directories')
    }

    fileWatcher.importPaths(sourcePaths, resolvedDir)

    const source = session.additionalDirs.find((additionalDir) => isUnderDir(resolvedDir, additionalDir))
    fileWatcher.notifyTreeChanged(sessionId, source)

    return { tree: fileWatcher.getFileTree(session.worktreePath) }
  })

  ipcMain.handle('files:reveal', (_event, sessionId: string, filePath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, filePath)
    if (!isPathAllowed(resolved, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    shell.showItemInFolder(resolved)
  })

  ipcMain.handle('files:open-terminal', (_event, sessionId: string, dirPath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, dirPath)
    if (!isPathAllowed(resolved, session)) {
      throw new Error('Path traversal denied: directory outside allowed directories')
    }
    spawn('open', ['-a', 'Terminal', resolved], { detached: true, stdio: 'ignore' })
  })

  ipcMain.handle('files:search-content', async (_event, sessionId: string, query: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    if (!query || query.trim().length === 0) return []

    try {
      const { stdout } = await execFileAsync('git', [
        'grep', '-n', '-I', '--heading', '--break',
        '--max-count=50',
        '--', query.trim(),
      ], {
        cwd: session.worktreePath,
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      })
      return parseGitGrepOutput(stdout, session.worktreePath)
    } catch (err: unknown) {
      // git grep exits with code 1 when no matches found
      if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 1) {
        return []
      }
      throw err
    }
  })
}

function readFileAsDataUrl(filePath: string): string {
  try {
    const data = fs.readFileSync(filePath)
    return `data:${mimeTypeForFile(filePath)};base64,${data.toString('base64')}`
  } catch (err) {
    throw new Error(`Failed to read file ${filePath}: ${(err as Error).message}`)
  }
}

function mimeTypeForFile(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.apng':
      return 'image/apng'
    case '.avif':
      return 'image/avif'
    case '.bmp':
      return 'image/bmp'
    case '.gif':
      return 'image/gif'
    case '.ico':
      return 'image/x-icon'
    case '.jpeg':
    case '.jpg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

interface SearchMatch {
  line: number
  text: string
}

interface SearchFileResult {
  file: string
  matches: SearchMatch[]
}

function parseGitGrepOutput(stdout: string, worktreePath: string): SearchFileResult[] {
  const results: SearchFileResult[] = []
  const blocks = stdout.split('\n\n')
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0)
    if (lines.length === 0) continue
    const filePath = lines[0]
    const matches: SearchMatch[] = []
    for (let i = 1; i < lines.length && matches.length < 50; i++) {
      const colonIdx = lines[i].indexOf(':')
      if (colonIdx === -1) continue
      const lineNum = parseInt(lines[i].substring(0, colonIdx), 10)
      if (isNaN(lineNum)) continue
      matches.push({ line: lineNum, text: lines[i].substring(colonIdx + 1) })
    }
    if (matches.length > 0) {
      results.push({ file: `${worktreePath}/${filePath}`, matches })
    }
  }
  return results
}
