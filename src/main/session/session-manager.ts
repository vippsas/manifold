import type { AgentSession, AgentSettingsUpdate, ShellPromptSegments, SpawnAgentOptions } from '../../shared/types'
import { PtyPool } from '../agent/pty-pool'
import { persistSessionMeta } from './session-meta-persister'
import { chatStorageKey, type ChatAdapter } from '../agent/chat-adapter'
import type { MemoryCapture } from '../memory/memory-capture'
import type { MemoryCompressor } from '../memory/memory-compressor'
import type { MemoryInjector } from '../memory/memory-injector'
import type { BrowserWindow } from 'electron'
import type { GitOperationsManager } from '../git/git-operations'
import type { InternalSession } from './session-types'
import type { SessionUsage } from './transcript-usage-reader'
import { toPublicSession } from './session-public'
import type { VerdictRecorder } from './verdict-recorder'
import type { DismissedAgentsStore } from '../store/dismissed-agents-store'
import { sendSessionManagerRendererEvent } from './session-manager-renderer'
import { getRuntimeById } from '../agent/runtimes'
import { SessionManagerContext } from './session-manager-context'

export interface ViolaHarnessController {
  send(sessionId: string, input: string): void
  interrupt(sessionId: string): void
  disposeSession(sessionId: string): void
}

export class SessionManager extends SessionManagerContext {
  private violaHarness: ViolaHarnessController | null = null

  setChatAdapter(adapter: ChatAdapter): void { this.chatAdapter = adapter }

  setMemoryCapture(capture: MemoryCapture): void { this.memoryCapture = capture }

  setMemoryCompressor(compressor: MemoryCompressor): void { this.memoryCompressor = compressor }

  setMemoryInjector(injector: MemoryInjector): void { this.memoryInjector = injector }

  setVerdictRecorder(recorder: VerdictRecorder): void {
    this.verdictRecorder = recorder
    this.killer.setVerdictRecorder(recorder)
    this.discovery.setVerdictRecorder(recorder)
  }

  setDismissedAgents(store: Pick<DismissedAgentsStore, 'has' | 'delete'>): void {
    this.dismissedAgents = store
    this.discovery.setDismissedAgents(store)
  }

  setGitOps(gitOps: GitOperationsManager): void {
    this.streamWirer.setGitOps(gitOps)
    this.shellController.setGitOps(gitOps)
  }

  setViolaHarness(harness: ViolaHarnessController): void {
    this.violaHarness = harness
  }

  setMainWindow(window: BrowserWindow): void { this.mainWindow = window }

  private statusListener: ((sessionId: string, status: string) => void) | null = null

  setStatusListener(listener: (sessionId: string, status: string) => void): void { this.statusListener = listener }

  private notificationService: { onStatus: (sessionId: string, status: string) => void } | null = null

  setNotificationService(service: { onStatus: (sessionId: string, status: string) => void }): void {
    this.notificationService = service
  }

  protected sendToRenderer(channel: string, ...args: unknown[]): void {
    sendSessionManagerRendererEvent({
      mainWindow: this.mainWindow,
      statusListener: this.statusListener,
      verdictRecorder: this.verdictRecorder,
      notificationService: this.notificationService,
    }, channel, args)
  }

  protected notifySessionsChanged(projectId: string): void {
    this.sendToRenderer('agent:sessions-changed', { projectId })
  }

  async createSession(options: SpawnAgentOptions): Promise<AgentSession> {
    const session = await this.lifecycle.createSession(options)
    this.watchCheckout(session)
    return session
  }

  /** Active sessions poll the folders they work in, on creation and resume. Doing this
   *  at the `agent:spawn` handler instead left workspace agents (created straight
   *  through the manager) unpolled, so their status bar kept the branch the
   *  session started on after the agent ran `git checkout -b`. */
  private watchCheckout(session: AgentSession): void {
    const internal = this.sessions.get(session.id)
    if (!internal) return
    this.fileWatcher?.watch(session.worktreePath, session.id)
    if (internal.checkoutWatched) return
    internal.checkoutWatched = true
    for (const dir of session.additionalDirs) this.fileWatcher?.watchAdditionalDir(dir, session.id)
  }

  hasSession(sessionId: string): boolean { return this.sessions.has(sessionId) }

  /** Push a folder added to a workspace into the agents already running in it —
   *  their `--add-dir` flags were fixed when their processes started. */
  async addWorkingDir(workspaceId: string, projectId: string, dir: string): Promise<void> {
    await this.workingSet.addDirToWorkspace(workspaceId, projectId, dir)
  }

  interruptSession(sessionId: string): void {
    if (this.sessions.get(sessionId)?.runtimeId === 'viola') {
      this.violaHarness?.interrupt(sessionId)
      return
    }
    this.ioController.interruptSession(sessionId)
  }

  sendInput(sessionId: string, input: string): void {
    const session = this.sessions.get(sessionId)
    if (session?.nonInteractive && input.trim()) this.watchCheckout(session)
    if (session?.runtimeId === 'viola') {
      if (!this.violaHarness) throw new Error('Viola harness is not available')
      this.memoryCapture?.recordInput(sessionId, input)
      this.violaHarness.send(sessionId, input.trim())
      return
    }
    this.ioController.sendInput(sessionId, input)
  }

  resize(sessionId: string, cols: number, rows: number): void { this.ioController.resize(sessionId, cols, rows) }

  async killSession(sessionId: string): Promise<void> {
    if (this.sessions.get(sessionId)?.runtimeId === 'viola') {
      this.violaHarness?.disposeSession(sessionId)
    }
    await this.killer.killSession(sessionId)
  }

  setHarnessStatus(sessionId: string, status: AgentSession['status']): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.status = status
    this.sendToRenderer('agent:status', { sessionId, status })
  }

  async resumeSession(sessionId: string, runtimeId: string): Promise<AgentSession> {
    const session = await this.lifecycle.resumeSession(sessionId, runtimeId)
    const tracked = this.sessions.get(sessionId)
    if (tracked?.ptyId || tracked?.nonInteractive) this.watchCheckout(session)
    return session
  }

  async renameSession(sessionId: string, displayName: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const nextName = displayName.trim()
    if (!nextName) throw new Error('Agent name cannot be empty')

    session.displayName = nextName
    persistSessionMeta(session)
    this.verdictRecorder?.onSessionTitleChanged(sessionId, nextName)
    this.notifySessionsChanged(session.projectId)
    return toPublicSession(session)
  }

  async configureSession(sessionId: string, settings: AgentSettingsUpdate): Promise<AgentSession> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    const displayName = settings.displayName.trim()
    if (!displayName) throw new Error('Agent name cannot be empty')
    if (!getRuntimeById(settings.runtimeId)) throw new Error(`Runtime not found: ${settings.runtimeId}`)

    const nextRuntime = getRuntimeById(settings.runtimeId)!
    const nonInteractive = nextRuntime.kind === 'orchestrator' || settings.viewMode === 'chat'
    const mustRestart = session.runtimeId !== settings.runtimeId
      || Boolean(session.nonInteractive) !== nonInteractive

    if (!mustRestart) {
      session.displayName = displayName
      persistSessionMeta(session)
      this.verdictRecorder?.onSessionTitleChanged(sessionId, displayName)
      this.notifySessionsChanged(session.projectId)
      return toPublicSession(session)
    }

    const previous = { ...session }
    if (previous.runtimeId === 'viola') this.violaHarness?.disposeSession(sessionId)
    this.chatAdapter?.clearSession(sessionId, true, chatStorageKey(previous.worktreePath, sessionId))
    this.killer.retireSession(sessionId)

    const replacement = await this.lifecycle.createSession({
      projectId: previous.projectId,
      runtimeId: settings.runtimeId,
      prompt: '',
      existingWorktreePath: previous.worktreePath,
      noWorktree: previous.noWorktree,
      nonInteractive,
      simpleTemplateTitle: previous.simpleTemplateTitle,
      simplePromptInstructions: previous.simplePromptInstructions,
      additionalDirs: previous.additionalDirs,
      workspaceId: previous.workspaceId,
      workspaceWorktreePaths: previous.workspaceWorktreePaths,
      groupId: previous.groupId,
    })
    const next = this.sessions.get(replacement.id)!
    next.displayName = displayName
    next.taskDescription = undefined
    next.baseBranch = previous.baseBranch
    persistSessionMeta(next)
    this.verdictRecorder?.onSessionTitleChanged(next.id, displayName)
    this.watchCheckout(next)
    this.notifySessionsChanged(next.projectId)
    return toPublicSession(next)
  }

  async setSessionLocked(sessionId: string, locked: boolean): Promise<AgentSession> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    session.locked = locked
    persistSessionMeta(session)
    this.notifySessionsChanged(session.projectId)

    return toPublicSession(session)
  }

  getOutputBuffer(sessionId: string): string { return this.sessions.get(sessionId)?.outputBuffer ?? '' }

  getSession(sessionId: string): AgentSession | undefined {
    const s = this.sessions.get(sessionId)
    return s ? toPublicSession(s) : undefined
  }

  getInternalSession(sessionId: string): InternalSession | undefined { return this.sessions.get(sessionId) }

  /** Drain a session's accumulated chat-mode token usage (null when none was recorded). */
  takeLiveUsage(sessionId: string): SessionUsage | null { return this.usageAccumulator.take(sessionId) }

  getPtyPool(): PtyPool { return this.ptyPool }

  getDetectedUrl(sessionId: string): string | null { return this.sessions.get(sessionId)?.detectedUrl ?? null }

  getSessionStatus(sessionId: string): string | null { return this.sessions.get(sessionId)?.status ?? null }

  getSlashCommands(sessionId: string): string[] { return this.sessions.get(sessionId)?.slashCommands ?? [] }

  listSessions(): AgentSession[] { return Array.from(this.sessions.values()).map(toPublicSession) }

  async discoverSessionsForProject(projectId: string): Promise<AgentSession[]> {
    await this.discovery.discoverSessionsForProject(projectId)
    return Array.from(this.sessions.values()).filter((s) => s.projectId === projectId).map(toPublicSession)
  }

  async discoverAllSessions(simpleProjectsBase?: string): Promise<AgentSession[]> {
    await this.discovery.discoverAllSessions(simpleProjectsBase)
    return Array.from(this.sessions.values()).map(toPublicSession)
  }

  async killNonInteractiveSessions(projectId: string): Promise<{ killedIds: string[]; branchName?: string; noWorktree?: boolean }> {
    for (const session of this.sessions.values()) {
      if (session.projectId === projectId && session.runtimeId === 'viola') {
        this.violaHarness?.disposeSession(session.id)
      }
    }
    return this.teardown.killNonInteractiveSessions(projectId)
  }

  async killInteractiveSession(sessionId: string): Promise<{ projectPath: string; branchName: string; taskDescription?: string }> { return this.teardown.killInteractiveSession(sessionId) }

  async startDevServerSession(
    projectId: string,
    branchName: string,
    taskDescription?: string,
    simpleTemplateTitle?: string,
    simplePromptInstructions?: string,
    runtimeId?: string,
  ): Promise<{ sessionId: string }> {
    return this.devServer.startDevServerSession(
      projectId,
      branchName,
      taskDescription,
      simpleTemplateTitle,
      simplePromptInstructions,
      runtimeId,
    )
  }

  killAllSessions(): void {
    for (const session of this.sessions.values()) {
      if (session.runtimeId === 'viola') this.violaHarness?.disposeSession(session.id)
    }
    this.ioController.killAllSessions()
  }

  /** Synchronously finalize active sessions' verdicts on app quit, before PTYs are killed. */
  finalizeActiveVerdictsForQuit(): void { this.verdictRecorder?.finalizeAllForQuitSync() }

  createShellSession(cwd: string, options?: { shellPrompt?: boolean; historyDir?: string; promptSegments?: ShellPromptSegments }): { sessionId: string } { return this.shellController.createShellSession(cwd, options) }

  triggerShellSuggestion(sessionId: string): void { this.shellController.triggerSuggestion(sessionId) }
}
