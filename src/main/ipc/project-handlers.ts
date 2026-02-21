import { ipcMain, dialog, BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import os from 'node:os'
import { existsSync } from 'node:fs'
import type { IpcDependencies } from './types'

const execFileAsync = promisify(execFile)

function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\/+$/, '').replace(/\.git$/, '')
  const lastSegment = cleaned.split('/').pop() || 'repo'
  return lastSegment
}

export function registerProjectHandlers(deps: IpcDependencies): void {
  const { projectRegistry } = deps

  ipcMain.handle('projects:list', () => {
    return projectRegistry.listProjects()
  })

  ipcMain.handle('projects:add', async (_event, projectPath: string) => {
    return projectRegistry.addProject(projectPath)
  })

  ipcMain.handle(
    'projects:clone',
    async (_event, repoUrl: string, targetDir?: string) => {
      if (typeof repoUrl !== 'string') {
        throw new Error('Invalid clone arguments')
      }
      if (repoUrl.startsWith('-')) {
        throw new Error('Invalid repository URL')
      }

      let cloneDir = targetDir
      if (typeof cloneDir !== 'string') {
        const repoName = repoNameFromUrl(repoUrl)
        cloneDir = path.join(os.homedir(), repoName)
        // Avoid overwriting an existing directory
        if (existsSync(cloneDir)) {
          throw new Error(`Directory already exists: ${cloneDir}`)
        }
      }

      await execFileAsync('git', ['clone', '--', repoUrl, cloneDir])
      return projectRegistry.addProject(cloneDir)
    }
  )

  ipcMain.handle('projects:remove', (_event, projectId: string) => {
    return projectRegistry.removeProject(projectId)
  })

  ipcMain.handle('projects:update', (_event, projectId: string, partial: Record<string, unknown>) => {
    return projectRegistry.updateProject(projectId, partial)
  })

  ipcMain.handle('projects:open-dialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('No BrowserWindow found for event sender')
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return undefined
    return result.filePaths[0]
  })

  ipcMain.handle('storage:open-dialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('No BrowserWindow found for event sender')
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return undefined
    return result.filePaths[0]
  })
}
