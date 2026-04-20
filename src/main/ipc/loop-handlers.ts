import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import type { LoopConfig } from '../../shared/loop-types'

export function registerLoopHandlers(deps: IpcDependencies): void {
  const { loopRunner, sessionManager } = deps

  ipcMain.handle('loop:start', async (_event, config: LoopConfig) => {
    // Fire-and-forget: the runner publishes progress via push channels.
    void loopRunner.start(config).catch((err: Error) => {
      console.error('Loop run failed:', err)
    })
    return loopRunner.getStatus(config.sessionId) ?? {
      sessionId: config.sessionId,
      state: 'running',
      currentIteration: 0,
    }
  })

  ipcMain.handle('loop:stop', async (_event, sessionId: string) => {
    await loopRunner.stop(sessionId)
    return loopRunner.getStatus(sessionId)
  })

  ipcMain.handle('loop:status', (_event, sessionId: string) => {
    return loopRunner.getStatus(sessionId)
  })

  ipcMain.handle('loop:iterations', async (_event, sessionId: string) => {
    return loopRunner.getIterations(sessionId)
  })

  ipcMain.handle('loop:config', (_event, sessionId: string) => {
    return sessionManager.getInternalSession(sessionId)?.loopConfig ?? null
  })

  ipcMain.handle('loop:set-config', (_event, sessionId: string, config: LoopConfig) => {
    const internal = sessionManager.getInternalSession(sessionId)
    if (!internal) throw new Error(`Session not found: ${sessionId}`)
    internal.loopConfig = config
    return internal.loopConfig
  })

  ipcMain.handle('loop:restore-best', async (_event, sessionId: string) => {
    const status = loopRunner.getStatus(sessionId)
    if (!status?.bestCommitSha) throw new Error('No best commit recorded yet')
    if (status.bestCommitSha === status.baselineSha) throw new Error('No improvement to restore — best is still the baseline')
    const worktreePath = sessionManager.getSession(sessionId)?.worktreePath
    if (!worktreePath) throw new Error(`No worktree for session ${sessionId}`)
    await loopRunner.restoreToCommit(worktreePath, status.bestCommitSha)
    return { sha: status.bestCommitSha }
  })
}
