import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'

export function registerPluginHandlers(deps: IpcDependencies): void {
  ipcMain.handle('plugins:list-contributions', () => deps.pluginManager.listViewContributions())
  ipcMain.handle('plugins:list', () => deps.pluginManager.listPlugins().map((p) => ({ ...p, enabled: deps.pluginManager.isEnabled(p.id) })))
  ipcMain.handle('plugins:set-enabled', (_e, pluginId: string, enabled: boolean) => {
    deps.pluginManager.setEnabled(pluginId, enabled)
    deps.send?.('plugins:contributions-changed')
    return true
  })
  ipcMain.handle('plugins:activate', (_e, id: string) => deps.pluginManager.activate(id))
  ipcMain.handle('plugins:execute-command', (_e, id: string, args: unknown[] = []) =>
    deps.pluginManager.executeContributedCommand(id, args))
  ipcMain.handle('plugins:open-view', (_e, viewId: string) => deps.pluginManager.openView(viewId))
  ipcMain.handle('dashboard:worktrees-summary', () => deps.pluginManager.getWorktreesSummary())
  ipcMain.handle('dashboard:verdicts-summary', () => deps.pluginManager.getVerdictsSummary())
  ipcMain.handle('plugins:webview-to-host', (_e, viewId: string, message: unknown) => {
    deps.pluginManager.deliverWebviewMessage(viewId, message); return true
  })
  ipcMain.handle('plugins:set-active-context', (_e, context: unknown) => {
    deps.pluginManager.setActiveContext((context ?? {}) as never); return true
  })
  ipcMain.handle('plugins:get-config', (_e, pluginId: string) => deps.pluginManager.getConfig(pluginId))
  ipcMain.handle('plugins:set-config', (_e, pluginId: string, key: string, value: unknown) => { deps.pluginManager.setConfig(pluginId, key, value); return true })
  ipcMain.handle('plugins:open-tree-view', (_e, viewId: string) => deps.pluginManager.openTreeView(viewId))
  ipcMain.handle('plugins:tree-get-children', (_e, viewId: string, parentNodeId: string | undefined) => deps.pluginManager.treeGetChildren(viewId, parentNodeId))
  ipcMain.handle('plugins:ui-response', (_e, requestId: string, value: unknown) => { deps.pluginManager.resolveUiResponse(requestId, value); return true })
}
