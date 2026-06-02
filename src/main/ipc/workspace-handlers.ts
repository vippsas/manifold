import { ipcMain } from 'electron'
import type { WorkspaceCreateOptions, WorkspaceSpawnAgentOptions } from '../../shared/workspace-types'
import type { IpcDependencies } from './types'

export function registerWorkspaceHandlers(deps: IpcDependencies): void {
  const { workspaceManager } = deps

  ipcMain.handle('workspace:list', () => workspaceManager.list())

  ipcMain.handle('workspace:create', (_e, options: WorkspaceCreateOptions) => workspaceManager.create(options))

  ipcMain.handle('workspace:remove', (_e, id: string) => workspaceManager.remove(id))

  ipcMain.handle('workspace:add-project', (_e, id: string, projectId: string) => {
    workspaceManager.addProject(id, projectId)
  })

  ipcMain.handle('workspace:remove-project', (_e, id: string, projectId: string) => {
    workspaceManager.removeProject(id, projectId)
  })

  ipcMain.handle('workspace:spawn-agent', (_e, id: string, options: WorkspaceSpawnAgentOptions) => {
    return workspaceManager.spawnAgent(id, options)
  })
}
