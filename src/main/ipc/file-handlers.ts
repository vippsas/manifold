import { clipboard, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { resolveSessionForRead, type IpcDependencies } from './types'
import {
  decodeImageDataUrl, isUnderDir, parseGitGrepOutput, readFileAsDataUrl,
  resolvePasteTargetDir, writePastedImage, type PathGuard,
} from './file-handler-utils'
import type { AgentSession, FileTreeNode } from '../../shared/types'
import { listWorktreeFiles } from '../fs/list-files'
import { openTerminal } from './open-terminal'
import { debugLog } from '../app/debug-log'

const execFileAsync = promisify(execFile)

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

  ipcMain.handle('files:tree', async (_event, sessionId: string): Promise<FileTreeNode | null> => {
    const session = resolveSessionForRead(sessionManager, sessionId)
    if (!session) return null
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
