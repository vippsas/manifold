import { clipboard, ipcMain, shell } from 'electron'
import * as fs from 'node:fs'
import { execFile } from 'node:child_process'
import { extname, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { IpcDependencies } from './types'
import type { AgentSession, FileTreeNode } from '../../shared/types'
import { listWorktreeFiles } from '../fs/list-files'
import { openTerminal } from './open-terminal'
import { debugLog } from '../app/debug-log'

const execFileAsync = promisify(execFile)

function isUnderDir(filePath: string, dir: string): boolean {
  const prefix = dir.endsWith('/') ? dir : dir + '/'
  return filePath === dir || filePath.startsWith(prefix)
}

function isPathAllowed(resolved: string, session: AgentSession): boolean {
  if (isUnderDir(resolved, session.worktreePath)) return true
  return session.additionalDirs.some((dir) => isUnderDir(resolved, dir))
}

/** Every folder the user has opened: each registered repository, each
 *  workspace's checkout of it, plus every session's worktree and extra dirs.
 *
 *  A workspace's checkout is listed in its own right, not only through the
 *  sessions working in it — its files are browsable before any agent exists. */
function workspaceRoots(deps: IpcDependencies): string[] {
  const roots = deps.projectRegistry.listProjects().map((project) => project.path)
  for (const workspace of deps.workspaceManager.list()) {
    roots.push(...Object.values(workspace.worktreePaths ?? {}))
  }
  for (const session of deps.sessionManager.listSessions()) {
    if (session.worktreePath) roots.push(session.worktreePath)
    roots.push(...session.additionalDirs)
  }
  return roots
}

/** Answers "may this session's request touch this path". */
type PathGuard = (resolved: string, session: AgentSession) => boolean

export function registerFileHandlers(deps: IpcDependencies): void {
  const { sessionManager, fileWatcher, projectRegistry, workspaceManager } = deps

  // The sidebar shows several repos and worktrees at once and opens a file from
  // any of them without first selecting it, so a path is authorized by "the user
  // opened this folder" rather than "this belongs to the selected session".
  // Anything outside those folders is still refused — that is what the check is
  // for; it was never meant to make one worktree private to one session.
  const isAllowed: PathGuard = (resolved, session) =>
    isPathAllowed(resolved, session)
    || workspaceRoots(deps).some((root) => isUnderDir(resolved, root))

  // Reading, saving and revealing a file need no session at all — a repo with no
  // agent still shows its files, and there would be no session id to name. The
  // session, when there is one, only supplies the base for a relative path.
  const authorize = (sessionId: string | null, filePath: string): string => {
    const session = sessionId ? sessionManager.getSession(sessionId) : undefined
    const resolved = session ? resolve(session.worktreePath, filePath) : resolve(filePath)
    if (session && isPathAllowed(resolved, session)) return resolved
    if (workspaceRoots(deps).some((root) => isUnderDir(resolved, root))) return resolved
    throw new Error('Path traversal denied: file outside allowed directories')
  }

  ipcMain.handle('files:tree', (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return fileWatcher.getFileTree(session.worktreePath)
  })

  // A repo can be open in several workspaces at once, each with its own checkout
  // of it, so the workspace (when given) decides which files these are.
  ipcMain.handle('files:tree-by-project', (_event, projectId: string, workspaceId?: string) => {
    const project = projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    const inWorkspace = workspaceId ? workspaceManager.get(workspaceId)?.worktreePaths?.[projectId] : undefined
    return fileWatcher.getFileTree(inWorkspace ?? project.path)
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
    const resolved = resolve(session.worktreePath, dirPath)
    if (!isAllowed(resolved, session)) {
      throw new Error(`Directory not in allowed paths: ${dirPath}`)
    }
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: resolved,
        timeout: 5000,
      })
      return stdout.trim() || null
    } catch {
      return null
    }
  })

  ipcMain.handle('files:read', (_event, sessionId: string | null, filePath: string) => {
    return fileWatcher.readFile(authorize(sessionId, filePath))
  })

  ipcMain.handle('files:read-data-url', (_event, sessionId: string | null, filePath: string) => {
    return readFileAsDataUrl(authorize(sessionId, filePath))
  })

  ipcMain.handle('files:write', (_event, sessionId: string | null, filePath: string, content: string) => {
    fileWatcher.writeFile(authorize(sessionId, filePath), content)
  })

  ipcMain.handle('files:delete', async (_event, sessionId: string, filePath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, filePath)
    if (!isAllowed(resolved, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    fileWatcher.deleteFile(resolved)
    return { tree: await fileWatcher.getFileTree(session.worktreePath) }
  })

  ipcMain.handle('files:rename', async (_event, sessionId: string, oldPath: string, newPath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolvedOld = resolve(session.worktreePath, oldPath)
    if (!isAllowed(resolvedOld, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    const resolvedNew = resolve(session.worktreePath, newPath)
    if (!isAllowed(resolvedNew, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    fileWatcher.renameFile(resolvedOld, resolvedNew)
    return { tree: await fileWatcher.getFileTree(session.worktreePath) }
  })

  // Creating needs no session either, for the same reason reading and saving
  // don't: a workspace shows its files before any agent works in it, and the
  // folders the user has open authorize the write. The selected session's tree
  // only rides along for the renderer that mirrors it.
  const sessionTree = async (sessionId: string | null): Promise<{ tree?: FileTreeNode }> => {
    const session = sessionId ? sessionManager.getSession(sessionId) : undefined
    return session ? { tree: await fileWatcher.getFileTree(session.worktreePath) } : {}
  }

  ipcMain.handle('files:create-file', (_event, sessionId: string | null, dirPath: string, fileName: string) => {
    const dir = authorize(sessionId, dirPath)
    fileWatcher.createFile(authorize(sessionId, resolve(dir, fileName)))
    return sessionTree(sessionId)
  })

  ipcMain.handle('files:create-dir', (_event, sessionId: string | null, dirPath: string, dirName: string) => {
    const dir = authorize(sessionId, dirPath)
    fileWatcher.createDir(authorize(sessionId, resolve(dir, dirName)))
    return sessionTree(sessionId)
  })

  ipcMain.handle('files:import', async (_event, sessionId: string, dirPath: string, sourcePaths: string[]) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolvedDir = resolve(session.worktreePath, dirPath)
    if (!isAllowed(resolvedDir, session)) {
      throw new Error('Path traversal denied: directory outside allowed directories')
    }

    fileWatcher.importPaths(sourcePaths, resolvedDir)

    const source = session.additionalDirs.find((additionalDir) => isUnderDir(resolvedDir, additionalDir))
    fileWatcher.notifyTreeChanged(sessionId, source)

    return { tree: await fileWatcher.getFileTree(session.worktreePath) }
  })

  ipcMain.handle('files:paste-image', async (_event, sessionId: string, dirPath: string, dataUrl: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolvedDir = resolvePasteTargetDir(session, dirPath, isAllowed)
    const { ext, buffer } = decodeImageDataUrl(dataUrl)
    const filePath = writePastedImage(session, resolvedDir, ext, buffer, isAllowed)

    const source = session.additionalDirs.find((additionalDir) => isUnderDir(resolvedDir, additionalDir))
    fileWatcher.notifyTreeChanged(sessionId, source)

    return { path: filePath, tree: await fileWatcher.getFileTree(session.worktreePath) }
  })

  ipcMain.handle('files:paste-clipboard-image', async (_event, sessionId: string, dirPath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const image = clipboard.readImage()
    if (image.isEmpty()) return { pasted: false }

    const resolvedDir = resolvePasteTargetDir(session, dirPath, isAllowed)
    const buffer = image.toPNG()
    if (buffer.byteLength === 0) return { pasted: false }
    const filePath = writePastedImage(session, resolvedDir, 'png', buffer, isAllowed)

    const source = session.additionalDirs.find((additionalDir) => isUnderDir(resolvedDir, additionalDir))
    fileWatcher.notifyTreeChanged(sessionId, source)

    return { pasted: true, path: filePath, tree: await fileWatcher.getFileTree(session.worktreePath) }
  })

  ipcMain.handle('files:reveal', (_event, sessionId: string | null, filePath: string) => {
    shell.showItemInFolder(authorize(sessionId, filePath))
  })

  ipcMain.handle('files:open-terminal', async (_event, sessionId: string | null, dirPath: string) => {
    const resolved = authorize(sessionId, dirPath)
    try {
      await openTerminal(resolved)
    } catch (error) {
      // The renderer discards this rejection, so log why the terminal failed
      // (e.g. no x-terminal-emulator installed) or it vanishes silently.
      const cause = (error as { cause?: unknown }).cause
      const detail = cause instanceof Error ? cause.message : error instanceof Error ? error.message : String(error)
      debugLog(`[open-terminal] failed for ${resolved}: ${detail}`)
      throw error
    }
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

  ipcMain.handle('files:list', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return listWorktreeFiles(session.worktreePath)
  })
}

function resolvePasteTargetDir(session: AgentSession, dirPath: string, isAllowed: PathGuard): string {
  const resolvedDir = resolve(session.worktreePath, dirPath || session.worktreePath)
  if (!isAllowed(resolvedDir, session)) {
    throw new Error('Path traversal denied: directory outside allowed directories')
  }
  if (!fs.statSync(resolvedDir).isDirectory()) {
    throw new Error(`Paste target is not a directory: ${resolvedDir}`)
  }
  return resolvedDir
}

function decodeImageDataUrl(dataUrl: string): { ext: string; buffer: Buffer } {
  const match = /^data:image\/([a-z0-9+]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) throw new Error('Invalid image data URL')
  const mimeSubtype = match[1].toLowerCase()
  const allowed: Record<string, string> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp' }
  const ext = allowed[mimeSubtype]
  if (!ext) throw new Error(`Unsupported image type: image/${mimeSubtype}`)
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.byteLength === 0) throw new Error('Empty image data')
  return { ext, buffer }
}

function nextPastedImagePath(dirPath: string, ext: string, session: AgentSession, isAllowed: PathGuard): string {
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`
    const filePath = resolve(dirPath, `pasted-image${suffix}.${ext}`)
    if (!isUnderDir(filePath, dirPath) || !isAllowed(filePath, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    if (!fs.existsSync(filePath)) return filePath
  }
  throw new Error(`Could not choose a unique pasted image name in ${dirPath}`)
}

function writePastedImage(session: AgentSession, dirPath: string, ext: string, buffer: Buffer, isAllowed: PathGuard): string {
  const filePath = nextPastedImagePath(dirPath, ext, session, isAllowed)
  fs.writeFileSync(filePath, buffer)
  return filePath
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
    case '.pdf':
      return 'application/pdf'
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
