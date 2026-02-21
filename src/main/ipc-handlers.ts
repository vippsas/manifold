import { ipcMain, dialog, BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { SpawnAgentOptions, CreatePROptions, ManifoldSettings, SessionViewState } from '../shared/types'
import { SettingsStore } from './settings-store'
import { ProjectRegistry } from './project-registry'
import { SessionManager } from './session-manager'
import { FileWatcher } from './file-watcher'
import { DiffProvider } from './diff-provider'
import { PrCreator } from './pr-creator'
import { ViewStateStore } from './view-state-store'
import { ShellTabStore, SavedShellState } from './shell-tab-store'
import { listRuntimes } from './runtimes'
import { generateBranchName } from './branch-namer'

const execFileAsync = promisify(execFile)

export interface IpcDependencies {
  settingsStore: SettingsStore
  projectRegistry: ProjectRegistry
  sessionManager: SessionManager
  fileWatcher: FileWatcher
  diffProvider: DiffProvider
  prCreator: PrCreator
  viewStateStore: ViewStateStore
  shellTabStore: ShellTabStore
}

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
}

function registerProjectHandlers(deps: IpcDependencies): void {
  const { projectRegistry } = deps

  ipcMain.handle('projects:list', () => {
    return projectRegistry.listProjects()
  })

  ipcMain.handle('projects:add', async (_event, projectPath: string) => {
    return projectRegistry.addProject(projectPath)
  })

  ipcMain.handle(
    'projects:clone',
    async (_event, repoUrl: string, targetDir: string) => {
      if (typeof repoUrl !== 'string' || typeof targetDir !== 'string') {
        throw new Error('Invalid clone arguments')
      }
      if (repoUrl.startsWith('-')) {
        throw new Error('Invalid repository URL')
      }
      await execFileAsync('git', ['clone', '--', repoUrl, targetDir])
      return projectRegistry.addProject(targetDir)
    }
  )

  ipcMain.handle('projects:remove', (_event, projectId: string) => {
    return projectRegistry.removeProject(projectId)
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

function registerAgentHandlers(deps: IpcDependencies): void {
  const { sessionManager, fileWatcher, viewStateStore } = deps

  ipcMain.handle('branch:suggest', async (_event, projectId: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    return generateBranchName(project.path)
  })

  ipcMain.handle('agent:spawn', async (_event, options: SpawnAgentOptions) => {
    const session = await sessionManager.createSession(options)
    fileWatcher.watch(session.worktreePath, session.id)
    return session
  })

  ipcMain.handle('agent:input', (_event, sessionId: string, input: string) => {
    sessionManager.sendInput(sessionId, input)
  })

  ipcMain.handle('agent:resize', (_event, sessionId: string, cols: number, rows: number) => {
    sessionManager.resize(sessionId, cols, rows)
  })

  ipcMain.handle('agent:kill', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (session) {
      await fileWatcher.unwatch(session.worktreePath)
    }
    await sessionManager.killSession(sessionId)
    viewStateStore.delete(sessionId)
  })

  ipcMain.handle('agent:resume', async (_event, sessionId: string, runtimeId: string) => {
    const session = await sessionManager.resumeSession(sessionId, runtimeId)
    fileWatcher.watch(session.worktreePath, session.id)
    return session
  })

  ipcMain.handle('agent:replay', (_event, sessionId: string) => {
    return sessionManager.getOutputBuffer(sessionId)
  })

  ipcMain.handle('agent:sessions', async (_event, projectId?: string) => {
    if (projectId) {
      return sessionManager.discoverSessionsForProject(projectId)
    }
    return sessionManager.listSessions()
  })

  ipcMain.handle('shell:create', (_event, cwd: string) => {
    return sessionManager.createShellSession(cwd)
  })

  ipcMain.handle('shell:kill', async (_event, sessionId: string) => {
    await sessionManager.killSession(sessionId)
  })
}

function registerFileHandlers(deps: IpcDependencies): void {
  const { sessionManager, fileWatcher } = deps

  ipcMain.handle('files:tree', (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return fileWatcher.getFileTree(session.worktreePath)
  })

  ipcMain.handle('files:read', (_event, sessionId: string, filePath: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, filePath)
    if (!resolved.startsWith(session.worktreePath)) {
      throw new Error('Path traversal denied: file outside worktree')
    }
    return fileWatcher.readFile(resolved)
  })

  ipcMain.handle('files:write', (_event, sessionId: string, filePath: string, content: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const resolved = resolve(session.worktreePath, filePath)
    if (!resolved.startsWith(session.worktreePath)) {
      throw new Error('Path traversal denied: file outside worktree')
    }
    fileWatcher.writeFile(resolved, content)
  })
}

function registerDiffHandler(deps: IpcDependencies): void {
  const { sessionManager, projectRegistry, diffProvider } = deps

  ipcMain.handle('diff:get', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)

    const [diff, changedFiles] = await Promise.all([
      diffProvider.getDiff(session.worktreePath, project.baseBranch),
      diffProvider.getChangedFiles(session.worktreePath, project.baseBranch)
    ])

    return { diff, changedFiles }
  })
}

function registerPrHandler(deps: IpcDependencies): void {
  const { sessionManager, projectRegistry, prCreator } = deps

  ipcMain.handle('pr:create', async (_event, options: CreatePROptions) => {
    const session = sessionManager.getSession(options.sessionId)
    if (!session) throw new Error(`Session not found: ${options.sessionId}`)
    const project = projectRegistry.getProject(session.projectId)
    if (!project) throw new Error(`Project not found: ${session.projectId}`)

    const url = await prCreator.createPR(session.worktreePath, session.branchName, {
      title: options.title,
      body: options.body,
      baseBranch: project.baseBranch
    })

    return url
  })
}

function registerSettingsHandlers(deps: IpcDependencies): void {
  const { settingsStore } = deps

  ipcMain.handle('settings:get', () => {
    return settingsStore.getSettings()
  })

  ipcMain.handle('settings:update', (_event, partial: Partial<ManifoldSettings>) => {
    if (partial.storagePath) {
      mkdirSync(partial.storagePath, { recursive: true })
    }
    return settingsStore.updateSettings(partial)
  })
}

function registerRuntimesHandler(): void {
  ipcMain.handle('runtimes:list', () => {
    return listRuntimes()
  })
}

function registerViewStateHandlers(deps: IpcDependencies): void {
  const { viewStateStore } = deps

  ipcMain.handle('view-state:get', (_event, sessionId: string) => {
    return viewStateStore.get(sessionId)
  })

  ipcMain.handle('view-state:set', (_event, sessionId: string, state: SessionViewState) => {
    viewStateStore.set(sessionId, state)
  })

  ipcMain.handle('view-state:delete', (_event, sessionId: string) => {
    viewStateStore.delete(sessionId)
  })
}

function registerShellTabHandlers(deps: IpcDependencies): void {
  const { shellTabStore } = deps

  ipcMain.handle('shell-tabs:get', (_event, agentKey: string) => {
    return shellTabStore.get(agentKey)
  })

  ipcMain.handle('shell-tabs:set', (_event, agentKey: string, state: SavedShellState) => {
    shellTabStore.set(agentKey, state)
  })
}
