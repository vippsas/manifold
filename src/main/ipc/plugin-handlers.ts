import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'

export function registerPluginHandlers(deps: IpcDependencies): void {
  ipcMain.handle('plugins:list-contributions', () => deps.pluginManager.listViewContributions())
  ipcMain.handle('plugins:list', () => deps.pluginManager.listPlugins())
  ipcMain.handle('plugins:activate', (_e, id: string) => deps.pluginManager.activate(id))
  ipcMain.handle('plugins:execute-command', (_e, id: string, args: unknown[] = []) =>
    deps.pluginManager.executeContributedCommand(id, args))
  ipcMain.handle('plugins:open-view', (_e, viewId: string) => deps.pluginManager.openView(viewId))
  ipcMain.handle('plugins:webview-to-host', (_e, viewId: string, message: unknown) => {
    deps.pluginManager.deliverWebviewMessage(viewId, message); return true
  })
  ipcMain.handle('plugins:set-active-context', (_e, context: unknown) => {
    deps.pluginManager.setActiveContext((context ?? {}) as never); return true
  })
}
