import { AgentSession, SpawnAgentOptions } from '../../shared/types'
import type { ShellPromptSegments } from '../../shared/types'
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
import { SessionDiscovery } from './session-discovery'
import { resumeAgentSession } from './session-resume'
import { ShellSessionController } from './shell-session-controller'
import { SessionKiller } from './session-killer'
import { toPublicSession } from './session-public'
import { SessionIoController } from './session-io-controller'
import type { VerdictRecorder } from './verdict-recorder'
import { isGitProject } from '../../shared/project-kind'

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
  /** Dedup concurrent resume calls for the same session id. */
  private resumeInFlight = new Map<string, Promise<AgentSession>>()
  /** Dedup concurrent noWorktree createSession calls for the same project id. */
  private createNoWorktreeInFlight = new Map<string, Promise<AgentSession>>()

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
    if (channel === 'agent:exit') {
      const payload = args[0] as { sessionId?: string } | undefined
      // Natural PTY exit needs to finalize the verdict (terminatedAt, durationMs,
      // final diff stats, merged check). killSession also triggers PTY exit, but
      // onSessionTerminated is idempotent — second call no-ops because this.active
      // is cleared after the first.
      if (payload?.sessionId) {
        void this.verdictRecorder?.onSessionTerminated(payload.sessionId)
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
    const project = this.projectRegistry.getProject(options.projectId)
    if (!project) throw new Error(`Project not found: ${options.projectId}`)
    const noWorktree = Boolean(options.noWorktree || !isGitProject(project))

    if (noWorktree) {
      // Serialize concurrent noWorktree spawns for the same project to prevent
      // two callers both passing the duplicate check before either has registered
      // its session (TOCTOU). The second caller awaits the first and then gets
      // the "already running" error on re-check.
      const inflight = this.createNoWorktreeInFlight.get(options.projectId)
      if (inflight) {
        return inflight
      }
      const promise = this.doCreateNoWorktreeSession(options)
      this.createNoWorktreeInFlight.set(options.projectId, promise)
      try {
        return await promise
      } finally {
        this.createNoWorktreeInFlight.delete(options.projectId)
      }
    }

    return this.doCreateSession(options)
  }

  private async doCreateNoWorktreeSession(options: SpawnAgentOptions): Promise<AgentSession> {
    const existingNoWorktree = Array.from(this.sessions.values()).find(
      (s) => s.noWorktree && s.projectId === options.projectId
    )
    if (existingNoWorktree) {
      throw new Error(
        'A no-worktree agent is already running for this project. ' +
        'Only one no-worktree agent can run at a time per project.'
      )
    }
    return this.doCreateSession(options)
  }

  private async doCreateSession(options: SpawnAgentOptions): Promise<AgentSession> {
    const project = this.projectRegistry.getProject(options.projectId)!

    const session = await this.sessionCreator.create(options)
    this.sessions.set(session.id, session)

    // Chat-mode (nonInteractive) agents show a `/` command autocomplete before
    // the first message is sent. Seed it from the project cache, and on a cache
    // miss probe for the list, so commands don't only appear from the 2nd message.
    if (session.nonInteractive) {
      if (project.slashCommands?.length) {
        session.slashCommands = project.slashCommands
      } else if (!session.ptyId) {
        // Deferred session (no first message yet) — probe before the user types.
        this.devServer.probeSlashCommands(session)
      }
    }

    this.memoryCapture?.startCapturing(session.id)
    this.notifySessionsChanged(session.projectId)
    if (this.verdictRecorder && !session.noWorktree && session.worktreePath) {
      this.verdictRecorder.onSessionCreated({
        sessionId: session.id,
        projectId: session.projectId,
        branch: session.branchName,
        runtime: session.runtimeId,
        taskPrompt: session.taskDescription ?? '',
        worktreePath: session.worktreePath,
        baseBranch: project.baseBranch || 'main',
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

    // Chat-mode sessions don't keep a long-running PTY — each message spawns
    // a fresh print-mode process via spawnPrintModeFollowUp. Spawning the
    // interactive runtime here would pollute the chat with TUI startup output.
    if (session.nonInteractive) {
      session.runtimeId = runtimeId
      return toPublicSession(session)
    }

    // Deduplicate concurrent resume calls for the same session to prevent two
    // callers both reading ptyId='' before either spawn completes, each spawning
    // a PTY and leaving the first one orphaned and unkillable.
    const inflight = this.resumeInFlight.get(sessionId)
    if (inflight) return inflight

    const promise = resumeAgentSession(session, runtimeId, this.ptyPool, this.streamWirer, this.memoryInjector ?? undefined)
      .then(() => {
        this.memoryCapture?.startCapturing(sessionId)
        this.notifySessionsChanged(session.projectId)
        return toPublicSession(session)
      })
      .finally(() => {
        this.resumeInFlight.delete(sessionId)
      })

    this.resumeInFlight.set(sessionId, promise)
    return promise
  }

  async renameSession(sessionId: string, displayName: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    const nextName = displayName.trim()
    if (!nextName) throw new Error('Agent name cannot be empty')

    session.displayName = nextName
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

  createShellSession(cwd: string, options?: { shellPrompt?: boolean; historyDir?: string; promptSegments?: ShellPromptSegments }): { sessionId: string } { return this.shellController.createShellSession(cwd, options) }

  triggerShellSuggestion(sessionId: string): void { this.shellController.triggerSuggestion(sessionId) }
}
