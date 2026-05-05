import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import { runWatch } from '../watch/runner'
import { detectWatchSetup, clearWatchSetupCache } from '../watch/setup-detector'
import { installWatchSkills } from '../watch/skill-installer'
import { getBundledWatchSkillPath } from '../watch/resource-path'

export function registerWatchHandlers(deps: IpcDependencies): void {
  const { sessionManager } = deps

  ipcMain.handle('watch:run', (_event, sessionId: string, url: string, question?: string) => {
    return runWatch(sessionManager, sessionId, url, question)
  })

  ipcMain.handle('watch:setup-status', () => {
    return detectWatchSetup()
  })

  ipcMain.handle('watch:install-skills', () => {
    clearWatchSetupCache()
    return installWatchSkills({ sourceDir: getBundledWatchSkillPath() })
  })
}
