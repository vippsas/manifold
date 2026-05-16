import { AgentSession, SpawnAgentOptions } from '../../shared/types'
import { WorktreeManager } from '../git/worktree-manager'
import { BranchCheckoutManager } from '../git/branch-checkout-manager'
import { PtyPool } from '../agent/pty-pool'
import { ProjectRegistry } from '../store/project-registry'
import { DevServerManager } from '../app/dev-server-manager'
import { SessionCreator } from './session-creator'
import { SessionTeardown } from './session-teardown'
import { writeWorktreeMeta } from '../git/worktree-meta'
import { FileWatcher } from '../fs/file-watcher'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { MemoryCapture } from '../memory/memory-capture'
import type { MemoryCompressor } from '../memory/memory-compressor'
import type { MemoryInjector } from '../memory/memory-injector'
import type { BrowserWindow } from 'electron'
import type { GitOperationsManager } from '../git/git-operations'
import type { InternalSession } from './session-types'
import { SessionStreamWirer } from './session-stream-wirer'
import { SessionDiscovery } from './session-discovery'
import { resumeAgentSession } from './session-resume'
import { ShellSessionController } from './shell-session-controller'
import { SessionKiller } from './session-killer'
import { toPublicSession } from './session-public'
import { SessionIoController } from './session-io-controller'
import type { VerdictRecorder } from './verdict-recorder'


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
  private verdictRecorder: VerdictRecorder | null = null

  constructor(
    private worktreeManager: WorktreeManager,
    private ptyPool: PtyPool,
    private projectRegistry: ProjectRegistry,
    private branchCheckoutManager?: BranchCheckoutManager,
    private fileWatcher?: FileWatcher,
  ) {
    this.streamWirer = new SessionStreamWirer(
      this.ptyPool,
      () => this.chatAdapter,
      this.sendToRenderer.bind(this),
      this.fileWatcher,
      (session) => this.persistAdditionalDirs(session),
      (session) => this.devServer.startDevServer(session),
    )
    this.devServer = new DevServerManager(
      this.ptyPool,
      () => this.chatAdapter,
      this.sessions,
      this.projectRegistry,
      this.sendToRenderer.bind(this),
      this.streamWirer,
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
  }

  setChatAdapter(adapter: ChatAdapter): void { this.chatAdapter = adapter }

  setMemoryCapture(capture: MemoryCapture): void { this.memoryCapture = capture }

  setMemoryCompressor(compressor: MemoryCompressor): void { this.memoryCompressor = compressor }

  setMemoryInjector(injector: MemoryInjector): void { this.memoryInjector = injector }

  setVerdictRecorder(recorder: VerdictRecorder): void {
    this.verdictRecorder = recorder
    this.killer.setVerdictRecorder(recorder)
  }

  setGitOps(gitOps: GitOperationsManager): void {
    this.streamWirer.setGitOps(gitOps)
    this.shellController.setGitOps(gitOps)
  }

  setMainWindow(window: BrowserWindow): void { this.mainWindow = window }

  private statusListener: ((sessionId: string, status: string) => void) | null = null

  setStatusListener(listener: (sessionId: string, status: string) => void): void { this.statusListener = listener }

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (channel === 'agent:status') {
      const payload = args[0] as { sessionId?: string; status?: string } | undefined
      if (payload?.sessionId && payload.status) {
        this.statusListener?.(payload.sessionId, payload.status)
        this.verdictRecorder?.onStatus(payload.sessionId, payload.status)
      }
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args)
    }
  }

  private notifySessionsChanged(projectId: string): void {
    this.sendToRenderer('agent:sessions-changed', { projectId })
  }

  async createSession(options: SpawnAgentOptions): Promise<AgentSession> {
    if (options.noWorktree) {
      const existingNoWorktree = Array.from(this.sessions.values()).find(
        (s) => s.noWorktree && s.projectId === options.projectId
      )
      if (existingNoWorktree) {
        throw new Error(
          'A no-worktree agent is already running for this project. ' +
          'Only one no-worktree agent can run at a time per project.'
        )
      }
    }

    const session = await this.sessionCreator.create(options)
    this.sessions.set(session.id, session)
    this.memoryCapture?.startCapturing(session.id)
    this.notifySessionsChanged(session.projectId)
    if (this.verdictRecorder && !session.noWorktree && session.worktreePath) {
      const baseBranch = this.projectRegistry.getProject(session.projectId)?.baseBranch ?? 'main'
      this.verdictRecorder.onSessionCreated({
        sessionId: session.id,
        projectId: session.projectId,
        branch: session.branchName,
        runtime: session.runtimeId,
        taskPrompt: session.taskDescription ?? '',
        worktreePath: session.worktreePath,
        baseBranch,
      })
    }
    return toPublicSession(session)
  }

  hasSession(sessionId: string): boolean { return this.sessions.has(sessionId) }

  interruptSession(sessionId: string): void { this.ioController.interruptSession(sessionId) }

  sendInput(sessionId: string, input: string): void { this.ioController.sendInput(sessionId, input) }

  resize(sessionId: string, cols: number, rows: number): void { this.ioController.resize(sessionId, cols, rows) }

  async killSession(sessionId: string): Promise<void> { await this.killer.killSession(sessionId) }

  async killAllSessionsOnWorktree(worktreePath: string): Promise<void> { await this.killer.killAllSessionsOnWorktree(worktreePath) }

  async resumeSession(sessionId: string, runtimeId: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    if (session.ptyId) return toPublicSession(session)

    await resumeAgentSession(session, runtimeId, this.ptyPool, this.streamWirer, this.memoryInjector ?? undefined)
    this.memoryCapture?.startCapturing(sessionId)
    this.notifySessionsChanged(session.projectId)

    return toPublicSession(session)
  }

  getOutputBuffer(sessionId: string): string { return this.sessions.get(sessionId)?.outputBuffer ?? '' }

  getSession(sessionId: string): AgentSession | undefined {
    const session = this.sessions.get(sessionId)
    return session ? toPublicSession(session) : undefined
  }

  getInternalSession(sessionId: string): InternalSession | undefined { return this.sessions.get(sessionId) }

  getPtyPool(): PtyPool { return this.ptyPool }

  getDetectedUrl(sessionId: string): string | null { return this.sessions.get(sessionId)?.detectedUrl ?? null }

  getSessionStatus(sessionId: string): string | null { return this.sessions.get(sessionId)?.status ?? null }

  listSessions(): AgentSession[] { return Array.from(this.sessions.values()).map(toPublicSession) }

  async discoverSessionsForProject(projectId: string): Promise<AgentSession[]> {
    await this.discovery.discoverSessionsForProject(projectId)
    return Array.from(this.sessions.values())
      .filter((s) => s.projectId === projectId)
      .map(toPublicSession)
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

  createShellSession(cwd: string, options?: { shellPrompt?: boolean; historyDir?: string }): { sessionId: string } {
    return this.shellController.createShellSession(cwd, options)
  }

  triggerShellSuggestion(sessionId: string): void { this.shellController.triggerSuggestion(sessionId) }

  private persistAdditionalDirs(session: InternalSession): void {
    writeWorktreeMeta(session.worktreePath, {
      runtimeId: session.runtimeId,
      taskDescription: session.taskDescription,
      simpleTemplateTitle: session.simpleTemplateTitle,
      simplePromptInstructions: session.simplePromptInstructions,
      additionalDirs: session.additionalDirs,
      ollamaModel: session.ollamaModel,
    }).catch(() => {})
  }

}
