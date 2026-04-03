import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { ipcMain } from 'electron'
import { SpawnAgentOptions } from '../../shared/types'
import { pickRandomNorwegianCityName } from '../../shared/norwegian-cities'
import { generateBranchName } from '../git/branch-namer'
import { acceptSuggestion, dismissSuggestion } from '../session/shell-suggestion'
import type { IpcDependencies } from './types'

const NO_WORKTREE_ERROR =
  'A no-worktree agent is already running for this project. ' +
  'Only one no-worktree agent can run at a time per project.'

/**
 * Resolve the shell history directory based on the scope setting.
 *
 * For 'project' scope: ~/.manifold/history/<projectName>/
 *   - Worktree paths: ~/.manifold/worktrees/<projectName>/manifold-<agent> → projectName
 *   - Other paths: uses path.basename(cwd) as fallback
 *
 * For 'global' scope: ~/.manifold/history/
 */
export function resolveShellHistoryDir(cwd: string, scope: 'project' | 'global'): string {
  const historyBase = path.join(os.homedir(), '.manifold', 'history')
  if (scope === 'global') {
    return historyBase
  }
  // Extract project name from worktree path: .../worktrees/<projectName>/manifold-<agent>
  const worktreeMatch = cwd.match(/worktrees\/([^/]+)\//)
  const projectName = worktreeMatch ? worktreeMatch[1] : path.basename(cwd)
  return path.join(historyBase, projectName)
}

async function clearDormantNoWorktreeSessions(
  deps: Pick<IpcDependencies, 'sessionManager' | 'fileWatcher'>,
  options: SpawnAgentOptions,
): Promise<void> {
  const sessions = deps.sessionManager.listSessions()
    .filter((session) => session.projectId === options.projectId && session.noWorktree)

  for (const session of sessions) {
    const internal = deps.sessionManager.getInternalSession(session.id)
    if (!options.noWorktree) continue
    if (internal?.ptyId || internal?.devServerPtyId || internal?.status === 'running') {
      throw new Error(NO_WORKTREE_ERROR)
    }
  }

  for (const session of sessions) {
    const internal = deps.sessionManager.getInternalSession(session.id)
    if (internal?.ptyId || internal?.devServerPtyId || internal?.status === 'running') continue
    await deps.fileWatcher.unwatch(session.worktreePath)
    await deps.sessionManager.killSession(session.id)
  }
}

export function registerAgentHandlers(deps: IpcDependencies): void {
  const { sessionManager, fileWatcher, viewStateStore } = deps

  ipcMain.handle('branch:suggest', async (_event, projectId: string, taskDescription: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    const branchHint = taskDescription?.trim() || pickRandomNorwegianCityName()
    return generateBranchName(project.path, branchHint)
  })

  ipcMain.handle('agent:spawn', async (_event, options: SpawnAgentOptions) => {
    await clearDormantNoWorktreeSessions(deps, options)
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

  ipcMain.handle('agent:interrupt', (_event, sessionId: string) => {
    sessionManager.interruptSession(sessionId)
  })

  ipcMain.handle('agent:kill', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (session) {
      await fileWatcher.unwatch(session.worktreePath)
    }
    await sessionManager.killSession(sessionId)
    viewStateStore.delete(sessionId)
  })

  ipcMain.handle('agent:delete-app', async (_event, sessionId: string, projectId: string) => {
    // 1. Kill session (also removes worktree if applicable)
    const session = sessionManager.getSession(sessionId)
    if (session) {
      await fileWatcher.unwatch(session.worktreePath)
      await sessionManager.killSession(sessionId)
      viewStateStore.delete(sessionId)
    }

    // 2. Remove the project directory from disk
    const project = deps.projectRegistry.getProject(projectId)
    if (project) {
      try {
        await fs.rm(project.path, { recursive: true, force: true })
      } catch {
        // Best-effort: directory may already be gone
      }
    }

    // 3. Remove persisted chat history
    deps.chatStore.delete(projectId)

    // 3b. Remove memory data
    deps.memoryStore.deleteProject(projectId)

    // 4. Remove project from registry
    deps.projectRegistry.removeProject(projectId)
  })

  ipcMain.handle(
    'agent:start-dev-server',
    (
      _event,
      projectId: string,
      branchName: string,
      description?: string,
      simpleTemplateTitle?: string,
      simplePromptInstructions?: string,
      runtimeId?: string,
    ) => {
      return sessionManager.startDevServerSession(
        projectId,
        branchName,
        description,
        simpleTemplateTitle,
        simplePromptInstructions,
        runtimeId,
      )
    },
  )

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
    const settings = deps.settingsStore.getSettings()
    const simpleProjectsBase = path.join(settings.storagePath, 'projects')
    return sessionManager.discoverAllSessions(simpleProjectsBase)
  })

  ipcMain.handle('shell:create', (_event, cwd: string) => {
    const settings = deps.settingsStore.getSettings()
    const historyDir = resolveShellHistoryDir(cwd, settings.shellHistoryScope)
    return sessionManager.createShellSession(cwd, {
      shellPrompt: settings.shellPrompt,
      historyDir,
    })
  })

  ipcMain.handle('shell:kill', async (_event, sessionId: string) => {
    if (!sessionManager.hasSession(sessionId)) return
    await sessionManager.killSession(sessionId)
  })

  ipcMain.handle('shell:accept-suggestion', (_event, sessionId: string) => {
    const session = sessionManager.getInternalSession(sessionId)
    if (!session) return false
    return acceptSuggestion(session, deps.sessionManager.getPtyPool())
  })

  ipcMain.handle('shell:dismiss-suggestion', (_event, sessionId: string) => {
    const session = sessionManager.getInternalSession(sessionId)
    if (!session) return
    dismissSuggestion(session, deps.sessionManager.getPtyPool())
  })

  ipcMain.handle('git:list-branches', async (_event, projectId: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    return deps.branchCheckout.listBranches(project.path)
  })

  ipcMain.handle('git:list-prs', async (_event, projectId: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    return deps.branchCheckout.listOpenPRs(project.path)
  })

  ipcMain.handle('git:fetch-pr-branch', async (_event, projectId: string, prIdentifier: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    const branch = await deps.branchCheckout.fetchPRBranch(project.path, prIdentifier)
    return { branch }
  })
}
