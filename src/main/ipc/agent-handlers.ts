import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { ipcMain } from 'electron'
import { SpawnAgentOptions } from '../../shared/types'
import { pickRandomNorwegianCityName } from '../../shared/norwegian-cities'
import { generateBranchName } from '../git/branch-namer'
import { acceptSuggestion, dismissSuggestion } from '../session/shell-suggestion'
import { debugLog } from '../app/debug-log'
import type { IpcDependencies } from './types'
import { isGitProject } from '../../shared/project-kind'

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

// Clear finished (dormant) no-worktree sessions for a project before a new spawn.
// A dormant in-place session leaves its branch checked out and would otherwise be
// resurrected by discovery. Active in-place agents are left running — multiple may
// run per project (warn-only); the New Agent form surfaces the heads-up.
async function clearDormantNoWorktreeSessions(
  deps: Pick<IpcDependencies, 'sessionManager' | 'fileWatcher'>,
  options: SpawnAgentOptions,
): Promise<void> {
  const sessions = deps.sessionManager.listSessions()
    .filter((session) => session.projectId === options.projectId && session.noWorktree)

  for (const session of sessions) {
    const internal = deps.sessionManager.getInternalSession(session.id)
    if (internal?.ptyId || internal?.devServerPtyId || internal?.status === 'running') continue
    await deps.fileWatcher.unwatch(session.worktreePath)
    await deps.sessionManager.killSession(session.id)
  }
}

export function registerAgentHandlers(deps: IpcDependencies): void {
  const { sessionManager, fileWatcher, viewStateStore, dockLayoutStore } = deps

  ipcMain.handle('branch:suggest', async (_event, projectId: string, taskDescription: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!isGitProject(project)) return project.name
    const branchHint = taskDescription?.trim() || pickRandomNorwegianCityName()
    return generateBranchName(project.path, branchHint)
  })

  ipcMain.handle('agent:spawn', async (_event, options: SpawnAgentOptions) => {
    const project = deps.projectRegistry.getProject(options.projectId)
    if (!project) throw new Error(`Project not found: ${options.projectId}`)
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

  ipcMain.handle('agent:rename', async (_event, sessionId: string, displayName: string) => {
    return sessionManager.renameSession(sessionId, displayName)
  })

  ipcMain.handle('agent:set-locked', async (_event, sessionId: string, locked: boolean) => {
    return sessionManager.setSessionLocked(sessionId, locked)
  })

  ipcMain.handle('agent:interrupt', (_event, sessionId: string) => {
    sessionManager.interruptSession(sessionId)
  })

  ipcMain.handle('agent:kill', async (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    debugLog(`[agent:kill] sessionId=${sessionId} found=${!!session} worktreePath=${session?.worktreePath ?? 'n/a'} noWorktree=${session?.noWorktree ?? 'n/a'}`)
    // A locked agent is protected from deletion until explicitly unlocked. The
    // renderer gates this too, but keep the hard guard here so no path (stale
    // UI state, direct IPC) can delete a locked agent. Internal lifecycle kills
    // (mode switch, respawn) call killSession directly and bypass this handler.
    if (session?.locked) throw new Error(`Refusing to delete locked agent: ${sessionId}`)
    // Deleting a noWorktree agent keeps the branch checked out, and discovery
    // would otherwise resurrect a dormant session from that branch state (#679).
    // Record the dismissal so the agent stays gone until explicitly recreated.
    // Internal lifecycle kills (mode switch, respawn) bypass this handler.
    if (session?.noWorktree) {
      deps.dismissedAgents.add(session.projectId, session.branchName)
    }
    // killSession → SessionKiller.cleanupSession unwatches the worktree, but only
    // when no surviving session still shares it. Unwatching here unconditionally
    // would kill file/git events for sibling sessions on the same worktree (#534).
    if (sessionManager.hasSession(sessionId)) {
      await sessionManager.killSession(sessionId)
    }
    viewStateStore.delete(sessionId)
    dockLayoutStore.delete(sessionId)
    debugLog(`[agent:kill] done sessionId=${sessionId}`)
  })

  ipcMain.handle('agent:kill-worktree', async (_event, worktreePath: string) => {
    debugLog(`[agent:kill-worktree] path=${worktreePath}`)
    const sessionsOnWorktree = Array.from(sessionManager.listSessions())
      .filter((s) => s.worktreePath === worktreePath)
    // Refuse the whole teardown if any agent sharing the worktree is locked.
    if (sessionsOnWorktree.some((s) => s.locked)) {
      throw new Error(`Refusing to delete worktree with a locked agent: ${worktreePath}`)
    }
    const idsBefore = sessionsOnWorktree.map((s) => s.id)
    if (worktreePath) {
      await fileWatcher.unwatch(worktreePath)
    }
    await sessionManager.killAllSessionsOnWorktree(worktreePath)
    for (const id of idsBefore) {
      viewStateStore.delete(id)
      dockLayoutStore.delete(id)
    }
    debugLog(`[agent:kill-worktree] done path=${worktreePath} killed=${idsBefore.length}`)
  })

  ipcMain.handle('agent:delete-app', async (_event, sessionId: string, projectId: string) => {
    // 1. Kill session (also removes worktree if applicable)
    const session = sessionManager.getSession(sessionId)
    if (session) {
      await fileWatcher.unwatch(session.worktreePath)
      await sessionManager.killSession(sessionId)
      viewStateStore.delete(sessionId)
      dockLayoutStore.delete(sessionId)
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

    // 3. Remove persisted chat history for every session in this project
    deps.chatStore.deleteByProject(projectId)

    // 3b. Remove memory data
    deps.memoryStore.deleteProject(projectId)

    // 3c. Remove persisted run verdicts for this project
    deps.verdictStore.deleteByProject(projectId)

    // 3d. Detach the project from every workspace that references it
    deps.workspaceManager.removeProjectFromAllWorkspaces(projectId)

    // 3e. Remove agent dismissals for this project
    deps.dismissedAgents.deleteProject(projectId)

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

  ipcMain.handle('shell:create', (_event, cwd: string, options?: { mode?: 'manifold' | 'system' }) => {
    const settings = deps.settingsStore.getSettings()
    const historyDir = resolveShellHistoryDir(cwd, settings.shellHistoryScope)
    const useManifoldShell = options?.mode !== 'system'
    return sessionManager.createShellSession(cwd, {
      shellPrompt: useManifoldShell,
      historyDir: useManifoldShell ? historyDir : undefined,
      promptSegments: settings.shellPromptSegments,
    })
  })

  ipcMain.handle('shell:kill', async (_event, sessionId: string) => {
    if (!sessionManager.hasSession(sessionId)) return
    await sessionManager.killSession(sessionId)
  })

  ipcMain.handle('shell:predict-suggestion', (_event, sessionId: string) => {
    sessionManager.triggerShellSuggestion(sessionId)
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
    if (!isGitProject(project)) throw new Error('This project is a plain folder, not a git repository')
    return deps.branchCheckout.listBranches(project.path)
  })

  ipcMain.handle('git:list-prs', async (_event, projectId: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!isGitProject(project)) throw new Error('This project is a plain folder, not a git repository')
    return deps.branchCheckout.listOpenPRs(project.path)
  })

  ipcMain.handle('git:fetch-pr-branch', async (_event, projectId: string, prIdentifier: string) => {
    const project = deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!isGitProject(project)) throw new Error('This project is a plain folder, not a git repository')
    const branch = await deps.branchCheckout.fetchPRBranch(project.path, prIdentifier)
    return { branch }
  })
}
