import { ipcMain } from 'electron'
import { readSessionCost } from '../session/session-cost'
import { claudeProjectsDir } from '../session/transcript-usage-reader'
import type { IpcDependencies } from './types'

export function registerUsageHandlers(deps: IpcDependencies): void {
  const { sessionManager } = deps

  // Answers the agent tab's cost hover. Read on demand rather than pushed on a
  // timer: nobody pays for a tooltip nobody opens, and what you see is current.
  ipcMain.handle('agent:session-usage', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    // A hover can race a deletion — report "nothing to show", don't throw.
    if (!session) return null
    return readSessionCost({
      runtimeId: session.runtimeId,
      worktreePath: session.worktreePath,
      sessionId: session.id,
      claudeProjectsDir: claudeProjectsDir(),
    })
  })
}
