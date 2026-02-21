import { ipcMain, shell } from 'electron'
import { registerProjectHandlers } from './ipc/project-handlers'
import { registerAgentHandlers } from './ipc/agent-handlers'
import { registerFileHandlers } from './ipc/file-handlers'
import { registerDiffHandler, registerPrHandler, registerGitHandlers } from './ipc/git-handlers'
import { registerSettingsHandlers, registerRuntimesHandler, registerViewStateHandlers, registerShellTabHandlers } from './ipc/settings-handlers'
export type { IpcDependencies } from './ipc/types'
import type { IpcDependencies } from './ipc/types'

export function registerIpcHandlers(deps: IpcDependencies): void {
  registerProjectHandlers(deps)
  registerAgentHandlers(deps)
  registerFileHandlers(deps)
  registerDiffHandler(deps)
  registerPrHandler(deps)
  registerSettingsHandlers(deps)
  registerRuntimesHandler()
  registerViewStateHandlers(deps)
  registerShellTabHandlers(deps)
  registerGitHandlers(deps)

  ipcMain.handle('app:beep', () => {
    shell.beep()
  })
}
