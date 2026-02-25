import { ipcMain } from 'electron'
import { resolve } from 'node:path'
import type { IpcDependencies } from './types'
import type { AgentSession } from '../../shared/types'

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

  ipcMain.handle('files:read', (_event, sessionId: string, filePath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, filePath)
    if (!isPathAllowed(resolved, session)) {
      throw new Error('Path traversal denied: file outside allowed directories')
    }
    return fileWatcher.readFile(resolved)
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
  })
}
