import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'

export function registerPluginHandlers(deps: IpcDependencies): void {
  ipcMain.handle('plugins:list-contributions', () => deps.pluginManager.listViewContributions())
  ipcMain.handle('plugins:list', () => deps.pluginManager.listPlugins())
}
