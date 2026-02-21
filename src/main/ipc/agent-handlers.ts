import { ipcMain } from 'electron'
import { SpawnAgentOptions } from '../../shared/types'
import { generateBranchName } from '../branch-namer'
import type { IpcDependencies } from './types'

export function registerAgentHandlers(deps: IpcDependencies): void {
  const { sessionManager, fileWatcher, viewStateStore } = deps

  ipcMain.handle('branch:suggest', async (_event, projectId: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    return generateBranchName(project.path)
  })

  ipcMain.handle('agent:spawn', async (_event, options: SpawnAgentOptions) => {
    const session = await sessionManager.createSession(options)
    fileWatcher.watch(session.worktreePath, session.id)
    return session
  })

  ipcMain.handle('agent:input', (_event, sessionId: string, input: string) => {
    sessionManager.sendInput(sessionId, input)
  })

  ipcMain.handle('agent:resize', (_event, sessionId: string, cols: number, rows: number) => {
    sessionManager.resize(sessionId, cols, rows)
  })

  ipcMain.handle('agent:kill', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (session) {
      await fileWatcher.unwatch(session.worktreePath)
    }
    await sessionManager.killSession(sessionId)
    viewStateStore.delete(sessionId)
  })

  ipcMain.handle('agent:resume', async (_event, sessionId: string, runtimeId: string) => {
    const session = await sessionManager.resumeSession(sessionId, runtimeId)
    fileWatcher.watch(session.worktreePath, session.id)
    return session
  })

  ipcMain.handle('agent:replay', (_event, sessionId: string) => {
    return sessionManager.getOutputBuffer(sessionId)
  })

  ipcMain.handle('agent:sessions', async (_event, projectId?: string) => {
    if (projectId) {
      return sessionManager.discoverSessionsForProject(projectId)
    }
    return sessionManager.listSessions()
  })

  ipcMain.handle('shell:create', (_event, cwd: string) => {
    return sessionManager.createShellSession(cwd)
  })

  ipcMain.handle('shell:kill', async (_event, sessionId: string) => {
    await sessionManager.killSession(sessionId)
  })
}
