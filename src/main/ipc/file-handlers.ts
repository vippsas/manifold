import { ipcMain } from 'electron'
import { resolve } from 'node:path'
import type { IpcDependencies } from './types'

export function registerFileHandlers(deps: IpcDependencies): void {
  const { sessionManager, fileWatcher } = deps

  ipcMain.handle('files:tree', (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return fileWatcher.getFileTree(session.worktreePath)
  })

  ipcMain.handle('files:read', (_event, sessionId: string, filePath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, filePath)
    if (!resolved.startsWith(session.worktreePath)) {
      throw new Error('Path traversal denied: file outside worktree')
    }
    return fileWatcher.readFile(resolved)
  })

  ipcMain.handle('files:write', (_event, sessionId: string, filePath: string, content: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, filePath)
    if (!resolved.startsWith(session.worktreePath)) {
      throw new Error('Path traversal denied: file outside worktree')
    }
    fileWatcher.writeFile(resolved, content)
  })

  ipcMain.handle('files:delete', (_event, sessionId: string, filePath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, filePath)
    if (!resolved.startsWith(session.worktreePath)) {
      throw new Error('Path traversal denied: file outside worktree')
    }
    fileWatcher.deleteFile(resolved)
  })
}
