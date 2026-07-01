import type { AgentSession, ShellPromptSegments, SpawnAgentOptions } from '../../shared/types'
import { WorktreeManager } from '../git/worktree-manager'
import { BranchCheckoutManager } from '../git/branch-checkout-manager'
import { PtyPool } from '../agent/pty-pool'
import { ProjectRegistry } from '../store/project-registry'
import { DevServerManager } from '../app/dev-server-manager'
import { SessionCreator } from './session-creator'
import { SessionTeardown } from './session-teardown'
import { persistSessionMeta } from './session-meta-persister'
import { FileWatcher } from '../fs/file-watcher'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { MemoryCapture } from '../memory/memory-capture'
import type { MemoryCompressor } from '../memory/memory-compressor'
import type { MemoryInjector } from '../memory/memory-injector'
import type { BrowserWindow } from 'electron'
import type { GitOperationsManager } from '../git/git-operations'
import type { InternalSession } from './session-types'
import { SessionStreamWirer } from './session-stream-wirer'
import { SessionUsageAccumulator } from './session-usage-accumulator'
import type { SessionUsage } from './transcript-usage-reader'
import { SessionDiscovery } from './session-discovery'
import { ShellSessionController } from './shell-session-controller'
import { SessionKiller } from './session-killer'
import { SessionLifecycle } from './session-lifecycle'
import { toPublicSession } from './session-public'
import { SessionIoController } from './session-io-controller'
import type { VerdictRecorder } from './verdict-recorder'
import type { DismissedAgentsStore } from '../store/dismissed-agents-store'
import { sendSessionManagerRendererEvent } from './session-manager-renderer'

export class SessionManager {
  private sessions: Map<string, InternalSession> = new Map()
  private mainWindow: BrowserWindow | null = null
  private chatAdapter: ChatAdapter | null = null
  private memoryCapture: MemoryCapture | null = null
  private memoryCompressor: MemoryCompressor | null = null
  private memoryInjector: MemoryInjector | null = null
  private streamWirer: SessionStreamWirer
  private devServer: DevServerManager
  private discovery: SessionDiscovery
  private sessionCreator: SessionCreator
  private teardown: SessionTeardown
  private shellController: ShellSessionController
  private killer: SessionKiller
  private ioController: SessionIoController
  private lifecycle: SessionLifecycle
  private verdictRecorder: VerdictRecorder | null = null
  private dismissedAgents: Pick<DismissedAgentsStore, 'has' | 'delete'> | null = null
  private readonly usageAccumulator = new SessionUsageAccumulator()

  constructor(
    private worktreeManager: WorktreeManager,
    private ptyPool: PtyPool,
    private projectRegistry: ProjectRegistry,
    private branchCheckoutManager?: BranchCheckoutManager,
    private fileWatcher?: FileWatcher,
    private getThemeType?: () => 'light' | 'dark',
  ) {
    this.streamWirer = new SessionStreamWirer(
      this.ptyPool,
      () => this.chatAdapter,
      this.sendToRenderer.bind(this),
      this.fileWatcher,
      persistSessionMeta,
      (session) => this.devServer.startDevServer(session),
      (session, commands) => this.cacheSlashCommands(session.projectId, commands),
      (session, usage) => this.usageAccumulator.recordTurn(session.id, usage),
      (session, runId, usage, turns) => this.usageAccumulator.replaceRun(session.id, runId, usage, turns),
      persistSessionMeta,
    )
    this.devServer = new DevServerManager(
      this.ptyPool,
      () => this.chatAdapter,
      this.sessions,
      this.projectRegistry,
      this.sendToRenderer.bind(this),
      this.streamWirer,
      (id) => this.killSession(id),
    )
    this.discovery = new SessionDiscovery(
      this.sessions,
      this.worktreeManager,
      this.projectRegistry,
      this.fileWatcher,
    )
    this.sessionCreator = new SessionCreator(
      this.worktreeManager,
      this.ptyPool,
      this.projectRegistry,
      this.streamWirer,
      () => this.chatAdapter,
      this.branchCheckoutManager,
      () => this.memoryInjector,
      this.getThemeType,
    )
    this.teardown = new SessionTeardown(
      this.sessions,
      this.ptyPool,
      this.projectRegistry,
      (id) => this.killSession(id),
      () => this.memoryCompressor,
    )
    this.shellController = new ShellSessionController(
      this.ptyPool,
      this.streamWirer,
      this.sessions,
    )
    this.killer = new SessionKiller({
      sessions: this.sessions,
      ptyPool: this.ptyPool,
      worktreeManager: this.worktreeManager,
      projectRegistry: this.projectRegistry,
      getFileWatcher: () => this.fileWatcher,
      getMemoryCapture: () => this.memoryCapture,
      getChatAdapter: () => this.chatAdapter,
      notifySessionsChanged: (projectId) => this.notifySessionsChanged(projectId),
    })
    this.ioController = new SessionIoController({
      sessions: this.sessions,
      ptyPool: this.ptyPool,
      shellController: this.shellController,
      getMemoryCapture: () => this.memoryCapture,
      spawnPrintModeFollowUp: (session, input) => this.devServer.spawnPrintModeFollowUp(session, input),
      trackActivity: (session) => this.streamWirer.trackActivity(session),
    })
    this.lifecycle = new SessionLifecycle({
      sessions: this.sessions,
      projectRegistry: this.projectRegistry,
      sessionCreator: this.sessionCreator,
      ptyPool: this.ptyPool,
      streamWirer: this.streamWirer,
      probeSlashCommands: (session) => this.devServer.probeSlashCommands(session),
      getMemoryCapture: () => this.memoryCapture,
      getMemoryInjector: () => this.memoryInjector,
      getVerdictRecorder: () => this.verdictRecorder,
      getDismissedAgents: () => this.dismissedAgents,
      notifySessionsChanged: (projectId) => this.notifySessionsChanged(projectId),
    })
  }

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

  /** Runtime to assign restored sessions whose worktree meta lacks a runtimeId. */
  setDefaultRuntimeIdProvider(fn: () => string): void {
    this.discovery.setDefaultRuntimeIdProvider(fn)
  }

  setMainWindow(window: BrowserWindow): void { this.mainWindow = window }

  private statusListener: ((sessionId: string, status: string) => void) | null = null

  setStatusListener(listener: (sessionId: string, status: string) => void): void { this.statusListener = listener }

  private notificationService: { onStatus: (sessionId: string, status: string) => void } | null = null

  setNotificationService(service: { onStatus: (sessionId: string, status: string) => void }): void {
    this.notificationService = service
  }

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    sendSessionManagerRendererEvent({
      mainWindow: this.mainWindow,
      statusListener: this.statusListener,
      verdictRecorder: this.verdictRecorder,
      notificationService: this.notificationService,
    }, channel, args)
  }

  private notifySessionsChanged(projectId: string): void {
    this.sendToRenderer('agent:sessions-changed', { projectId })
  }

  async createSession(options: SpawnAgentOptions): Promise<AgentSession> { return this.lifecycle.createSession(options) }

  hasSession(sessionId: string): boolean { return this.sessions.has(sessionId) }

  interruptSession(sessionId: string): void { this.ioController.interruptSession(sessionId) }

  sendInput(sessionId: string, input: string): void { this.ioController.sendInput(sessionId, input) }

  resize(sessionId: string, cols: number, rows: number): void { this.ioController.resize(sessionId, cols, rows) }

  async killSession(sessionId: string): Promise<void> { await this.killer.killSession(sessionId) }

  async killAllSessionsOnWorktree(worktreePath: string): Promise<void> { await this.killer.killAllSessionsOnWorktree(worktreePath) }

  async resumeSession(sessionId: string, runtimeId: string): Promise<AgentSession> { return this.lifecycle.resumeSession(sessionId, runtimeId) }

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

  async setSessionLocked(sessionId: string, locked: boolean): Promise<AgentSession> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    session.locked = locked
    persistSessionMeta(session)
    this.notifySessionsChanged(session.projectId)

    return toPublicSession(session)
  }

  /**
   * Add a folder as an extra working root on a live session — VS Code's "Add
   * Folder to Workspace". Updates `additionalDirs` (so the file tree shows the
   * folder and `files:read` allows it via `isPathAllowed`), starts watching it,
   * persists, and notifies the renderer. For interactive agents it also sends the
   * runtime's `/add-dir` so the running conversation gains access. The PTY echo is
   * caught by `detectAddDir`, which stays idempotent since the dir is already
   * recorded here.
   */
  async addAdditionalDir(sessionId: string, dirPath: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    const normalized = dirPath.replace(/\/+$/, '')
    const worktree = (session.worktreePath ?? '').replace(/\/+$/, '')
    if (normalized && normalized !== worktree && !session.additionalDirs.includes(normalized)) {
      session.additionalDirs.push(normalized)
      this.fileWatcher?.watchAdditionalDir(normalized, sessionId)
      persistSessionMeta(session)
      this.sendToRenderer('agent:dirs-changed', { sessionId, additionalDirs: [...session.additionalDirs] })
      this.notifySessionsChanged(session.projectId)
      if (session.ptyId && !session.nonInteractive) {
        this.ioController.sendInput(sessionId, `/add-dir ${normalized}\n`)
      }
    }

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

  /** Persist the captured slash-command list on the project so future chat sessions have it before the first message. */
  private cacheSlashCommands(projectId: string, commands: string[]): void {
    const project = this.projectRegistry.getProject(projectId)
    if (project && JSON.stringify(project.slashCommands) !== JSON.stringify(commands)) {
      this.projectRegistry.updateProject(projectId, { slashCommands: commands })
    }
  }

  listSessions(): AgentSession[] { return Array.from(this.sessions.values()).map(toPublicSession) }

  async discoverSessionsForProject(projectId: string): Promise<AgentSession[]> {
    await this.discovery.discoverSessionsForProject(projectId)
    return Array.from(this.sessions.values()).filter((s) => s.projectId === projectId).map(toPublicSession)
  }

  async discoverAllSessions(simpleProjectsBase?: string): Promise<AgentSession[]> {
    await this.discovery.discoverAllSessions(simpleProjectsBase)
    return Array.from(this.sessions.values()).map(toPublicSession)
  }

  async killNonInteractiveSessions(projectId: string): Promise<{ killedIds: string[]; branchName?: string; noWorktree?: boolean }> { return this.teardown.killNonInteractiveSessions(projectId) }

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

  killAllSessions(): void { this.ioController.killAllSessions() }

  /** Synchronously finalize active sessions' verdicts on app quit, before PTYs are killed. */
  finalizeActiveVerdictsForQuit(): void { this.verdictRecorder?.finalizeAllForQuitSync() }

  createShellSession(cwd: string, options?: { shellPrompt?: boolean; historyDir?: string; promptSegments?: ShellPromptSegments }): { sessionId: string } { return this.shellController.createShellSession(cwd, options) }

  triggerShellSuggestion(sessionId: string): void { this.shellController.triggerSuggestion(sessionId) }
}
