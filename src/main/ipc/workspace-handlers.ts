import { ipcMain } from 'electron'
import type { WorkspaceCreateOptions, WorkspaceSpawnAgentOptions } from '../../shared/workspace-types'
import type { IpcDependencies } from './types'

export function registerWorkspaceHandlers(deps: IpcDependencies): void {
  const { workspaceManager } = deps

  ipcMain.handle('workspace:list', () => workspaceManager.list())

  ipcMain.handle('workspace:create', (_e, options: WorkspaceCreateOptions) => workspaceManager.create(options))

  ipcMain.handle('workspace:rename', (_e, id: string, name: string) => workspaceManager.rename(id, name))

  ipcMain.handle('workspace:remove', (_e, id: string) => workspaceManager.remove(id))

  // Both await: attaching or detaching a folder cuts or removes that repo's
  // checkout in a worktree workspace, and the renderer must not repaint first.
  ipcMain.handle('workspace:add-project', async (_e, id: string, projectId: string) => {
    await workspaceManager.addProject(id, projectId)
  })

  ipcMain.handle('workspace:remove-project', async (_e, id: string, projectId: string) => {
    await workspaceManager.removeProject(id, projectId)
  })

  ipcMain.handle('workspace:spawn-agent', (_e, id: string, options: WorkspaceSpawnAgentOptions) => {
    return workspaceManager.spawnAgent(id, options)
  })
}
