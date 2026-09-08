import { ipcMain } from 'electron'
import type { WorkspaceCreateOptions, WorkspaceSpawnAgentOptions } from '../../shared/workspace-types'
import type { IpcDependencies } from './types'

export function registerWorkspaceHandlers(deps: IpcDependencies): void {
  const { workspaceManager, activeWorkspaceStore, verdictStore } = deps

  ipcMain.handle('workspace:get-active', () => activeWorkspaceStore.get())

  ipcMain.handle('workspace:set-active', (_e, workspaceId: string | null) => {
    activeWorkspaceStore.set(workspaceId)
  })

  ipcMain.handle('workspace:list', () => workspaceManager.list())

  // Worktree workspaces whose branch a verdict recorded as merged, for the
  // sidebar's merged fold. Only the recorder's `merged` outcome counts: it is
  // gated on the session having produced work (verdict-recorder.ts), so an
  // empty branch — trivially an ancestor of its base — never folds a live
  // workspace. Matched on primary repo + branch, the two things a verdict and a
  // workspace both name.
  ipcMain.handle('workspace:list-merged', (): string[] => {
    const merged = new Set(
      verdictStore.listAll()
        .filter((r) => r.outcome === 'merged')
        .map((r) => `${r.projectId}\n${r.branch}`),
    )
    return workspaceManager.list()
      .filter((w) => w.branchName !== undefined && w.projectIds.length > 0 && merged.has(`${w.projectIds[0]}\n${w.branchName}`))
      .map((w) => w.id)
  })

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
