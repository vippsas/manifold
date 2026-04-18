import { ipcMain } from 'electron'
import { resolve } from 'node:path'
import type { IpcDependencies } from './types'
import type { FileChange } from '../../shared/types'
import { gitStatus, parseStatusWithConflicts } from '../fs/file-watcher-utils'

function isUnderDir(filePath: string, dir: string): boolean {
  const prefix = dir.endsWith('/') ? dir : dir + '/'
  return filePath === dir || filePath.startsWith(prefix)
}

export function registerSuperagentFileHandlers(deps: IpcDependencies): void {
  const { fileWatcher, projectRegistry, superagentManager } = deps

  ipcMain.handle(
    'files:tree-for-superagent-project',
    (_event, superagentId: string, projectId: string) => {
      const superagent = superagentManager.list().find((s) => s.id === superagentId)
      if (!superagent) throw new Error(`Superagent not found: ${superagentId}`)
      if (!superagent.fleetProjectIds.includes(projectId)) {
        throw new Error(`Project ${projectId} is not in fleet of superagent ${superagentId}`)
      }
      const worktreePath = superagent.fleetWorktreePaths?.[projectId]
      if (!worktreePath) {
        const project = projectRegistry.getProject(projectId)
        if (!project) throw new Error(`Project not found: ${projectId}`)
        return fileWatcher.getFileTree(project.path)
      }
      return fileWatcher.getFileTree(worktreePath)
    },
  )

  ipcMain.handle(
    'files:fleet-changes',
    async (_event, superagentId: string): Promise<Record<string, FileChange[]>> => {
      const superagent = superagentManager.list().find((s) => s.id === superagentId)
      if (!superagent) throw new Error(`Superagent not found: ${superagentId}`)
      const entries = await Promise.all(
        superagent.fleetProjectIds.map(async (projectId) => {
          const worktreePath =
            superagent.fleetWorktreePaths?.[projectId] ??
            projectRegistry.getProject(projectId)?.path
          if (!worktreePath) return null
          try {
            const raw = await gitStatus(worktreePath)
            const { changes } = parseStatusWithConflicts(raw)
            return [worktreePath, changes] as const
          } catch {
            return [worktreePath, [] as FileChange[]] as const
          }
        }),
      )
      const result: Record<string, FileChange[]> = {}
      for (const entry of entries) {
        if (entry) result[entry[0]] = entry[1]
      }
      return result
    },
  )

  function resolveFleetPath(
    superagentId: string,
    projectId: string,
    filePath: string,
  ): string {
    const superagent = superagentManager.list().find((s) => s.id === superagentId)
    if (!superagent) throw new Error(`Superagent not found: ${superagentId}`)
    if (!superagent.fleetProjectIds.includes(projectId)) {
      throw new Error(`Project ${projectId} is not in fleet of superagent ${superagentId}`)
    }
    const worktreePath = superagent.fleetWorktreePaths?.[projectId]
    const rootPath = worktreePath ?? projectRegistry.getProject(projectId)?.path
    if (!rootPath) throw new Error(`No worktree or project path for ${projectId}`)
    const resolved = resolve(rootPath, filePath)
    if (!isUnderDir(resolved, rootPath)) {
      throw new Error('Path traversal denied: file outside fleet worktree')
    }
    return resolved
  }

  ipcMain.handle(
    'files:read-for-superagent-project',
    (_event, superagentId: string, projectId: string, filePath: string) => {
      const resolved = resolveFleetPath(superagentId, projectId, filePath)
      return fileWatcher.readFile(resolved)
    },
  )

  ipcMain.handle(
    'files:write-for-superagent-project',
    (_event, superagentId: string, projectId: string, filePath: string, content: string) => {
      const resolved = resolveFleetPath(superagentId, projectId, filePath)
      fileWatcher.writeFile(resolved, content)
    },
  )
}
