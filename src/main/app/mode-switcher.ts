import * as path from 'node:path'
import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import type { AgentSession } from '../../shared/types'
import type { PendingLaunchAction } from '../../shared/mode-switch-types'
import { debugLog } from './debug-log'
import { gitExec } from '../git/git-exec'
import type { SettingsStore } from '../store/settings-store'
import type { ChatStore } from '../store/chat-store'
import type { SessionManager } from '../session/session-manager'
import type { ProjectRegistry } from '../store/project-registry'

interface ModeSwitcherDeps {
  settingsStore: SettingsStore
  sessionManager: SessionManager
  projectRegistry: ProjectRegistry
  chatStore: ChatStore
}

interface SwitchContext {
  branchName?: string
  runtimeId?: string
  taskDescription?: string
  hadNoWorktree: boolean
}

export class ModeSwitcher {
  private pendingLaunch: PendingLaunchAction | null = null

  constructor(private deps: ModeSwitcherDeps) {}

  register(
    createWindow: () => void,
    getMainWindow: () => BrowserWindow | null,
    setMainWindow: (win: BrowserWindow | null) => void,
  ): void {
    this.registerThemeHandler(getMainWindow)
    this.registerPendingLaunchHandler()
    this.registerModeSwitchHandler(createWindow, getMainWindow, setMainWindow)
  }

  private registerThemeHandler(getMainWindow: () => BrowserWindow | null): void {
    ipcMain.on('theme:changed', (_event, payload: { type: string; background: string }) => {
      nativeTheme.themeSource = (payload.type === 'light' ? 'light' : 'dark') as 'dark' | 'light'
      getMainWindow()?.setBackgroundColor(payload.background)
    })
  }

  private registerPendingLaunchHandler(): void {
    ipcMain.handle('app:consume-pending-launch', () => {
      const pending = this.pendingLaunch
      this.pendingLaunch = null
      return pending
    })
  }

  private registerModeSwitchHandler(
    createWindow: () => void,
    getMainWindow: () => BrowserWindow | null,
    setMainWindow: (win: BrowserWindow | null) => void,
  ): void {
    ipcMain.handle(
      'app:switch-mode',
      async (_event, mode: 'developer' | 'simple', projectId?: string, sessionId?: string, runtimeId?: string) => {
        this.deps.settingsStore.updateSettings({ uiMode: mode })
        this.pendingLaunch = null

        if (projectId && mode === 'developer') {
          this.pendingLaunch = await this.prepareDeveloperLaunch(projectId, sessionId, runtimeId)
        }

        if (projectId && mode === 'simple' && this.isManagedSimpleProject(projectId)) {
          this.pendingLaunch = await this.prepareSimpleLaunch(projectId, sessionId, runtimeId)
        }

        const currentWin = getMainWindow()
        if (currentWin) {
          currentWin.destroy()
          setMainWindow(null)
        }
        createWindow()
      },
    )
  }

  private isManagedSimpleProject(projectId: string): boolean {
    const project = this.deps.projectRegistry.getProject(projectId)
    if (!project) return false
    const simpleBase = path.join(this.deps.settingsStore.getSettings().storagePath, 'projects')
    return project.path.startsWith(simpleBase)
  }

  private async prepareDeveloperLaunch(
    projectId: string,
    sessionId?: string,
    runtimeId?: string,
  ): Promise<PendingLaunchAction | null> {
    const context = await this.resetProjectState(projectId, sessionId)
    this.deps.chatStore.delete(projectId)
    const branchName = await this.resolveBranchName(projectId, context.branchName)
    if (!branchName) return null

    return {
      kind: 'developer',
      projectId,
      branchName,
      runtimeId: context.runtimeId || runtimeId || this.deps.settingsStore.getSettings().defaultRuntime,
    }
  }

  private async prepareSimpleLaunch(
    projectId: string,
    sessionId?: string,
    runtimeId?: string,
  ): Promise<PendingLaunchAction | null> {
    const project = this.deps.projectRegistry.getProject(projectId)
    if (!project) return null

    const context = await this.resetProjectState(projectId, sessionId)
    this.deps.chatStore.delete(projectId)
    const branchName = await this.resolveBranchName(projectId, context.branchName)
    if (!branchName) return null

    const nextRuntimeId = context.runtimeId || runtimeId || this.deps.settingsStore.getSettings().defaultRuntime
    const result = await this.deps.sessionManager.startDevServerSession(
      projectId,
      branchName,
      context.taskDescription,
      nextRuntimeId,
    )

    return {
      kind: 'simple',
      app: {
        sessionId: result.sessionId,
        projectId,
        runtimeId: nextRuntimeId,
        branchName,
        name: project.name,
        description: context.taskDescription ?? '',
        status: 'building',
        previewUrl: null,
        liveUrl: null,
        projectPath: project.path,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    }
  }

  private async resetProjectState(projectId: string, sessionId?: string): Promise<SwitchContext> {
    await this.deps.sessionManager.discoverSessionsForProject(projectId).catch(() => [])

    const sessions = this.deps.sessionManager.listSessions().filter((session) => session.projectId === projectId)
    const preferred = this.pickPreferredSession(sessionId, sessions)
    const targetBranch = preferred?.branchName
    const context: SwitchContext = {
      branchName: preferred?.branchName,
      runtimeId: preferred?.runtimeId,
      taskDescription: preferred?.taskDescription,
      hadNoWorktree: false,
    }

    if (sessions.some((session) => this.deps.sessionManager.getInternalSession(session.id)?.nonInteractive)) {
      const result = await this.deps.sessionManager.killNonInteractiveSessions(projectId)
      context.branchName ||= result.branchName
      context.hadNoWorktree = Boolean(result.noWorktree)
    }

    for (const session of sessions) {
      const internalSession = this.deps.sessionManager.getInternalSession(session.id)
      if (!internalSession || internalSession.nonInteractive) continue
      if (targetBranch && session.branchName !== targetBranch) continue
      context.branchName ||= session.branchName
      context.runtimeId ||= session.runtimeId
      context.taskDescription ||= session.taskDescription
      await this.deps.sessionManager.killInteractiveSession(session.id)
      debugLog(`[switch-mode] killed interactive session ${session.id} on ${session.branchName}`)
    }

    if (context.hadNoWorktree) {
      await this.restoreProjectBaseBranch(projectId)
    }

    return context
  }

  private pickPreferredSession(sessionId: string | undefined, sessions: AgentSession[]): AgentSession | undefined {
    if (sessionId) {
      return sessions.find((session) => session.id === sessionId) ?? this.deps.sessionManager.getSession(sessionId)
    }
    return sessions[0]
  }

  private async restoreProjectBaseBranch(projectId: string): Promise<void> {
    const project = this.deps.projectRegistry.getProject(projectId)
    if (!project) return

    try {
      await gitExec(['checkout', project.baseBranch], project.path)
      debugLog(`[switch-mode] restored ${project.path} to ${project.baseBranch}`)
    } catch (error) {
      debugLog(`[switch-mode] restore base branch failed: ${error}`)
    }
  }

  private async resolveBranchName(projectId: string, branchName?: string): Promise<string | undefined> {
    if (branchName) return branchName
    const project = this.deps.projectRegistry.getProject(projectId)
    if (!project) return undefined

    try {
      return (await gitExec(['branch', '--show-current'], project.path)).trim() || undefined
    } catch {
      return undefined
    }
  }
}
