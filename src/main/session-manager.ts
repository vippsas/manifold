import { v4 as uuidv4 } from 'uuid'
import { AgentSession, SpawnAgentOptions } from '../shared/types'
import { getRuntimeById } from './runtimes'
import { WorktreeManager } from './worktree-manager'
import { BranchCheckoutManager } from './branch-checkout-manager'
import { PtyPool } from './pty-pool'
import { ProjectRegistry } from './project-registry'
import { DevServerManager } from './dev-server-manager'
import { SessionCreator } from './session-creator'
import { SessionTeardown } from './session-teardown'
import { writeWorktreeMeta, readWorktreeMeta } from './worktree-meta'
import { FileWatcher } from './file-watcher'
import type { ChatAdapter } from './chat-adapter'
import type { BrowserWindow } from 'electron'
import type { InternalSession } from './session-types'
import { SessionStreamWirer } from './session-stream-wirer'
import { SessionDiscovery } from './session-discovery'


export class SessionManager {
  private sessions: Map<string, InternalSession> = new Map()
  private mainWindow: BrowserWindow | null = null
  private chatAdapter: ChatAdapter | null = null
  private streamWirer: SessionStreamWirer
  private devServer: DevServerManager
  private discovery: SessionDiscovery
  private sessionCreator: SessionCreator
  private teardown: SessionTeardown

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
    )
    this.teardown = new SessionTeardown(
      this.sessions,
      this.ptyPool,
      this.projectRegistry,
      (id) => this.killSession(id),
    )
  }

  setChatAdapter(adapter: ChatAdapter): void {
    this.chatAdapter = adapter
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args)
    }
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
    return this.toPublicSession(session)
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  sendInput(sessionId: string, input: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    if (session.nonInteractive) {
      // Print mode: spawn a new process that continues the previous conversation
      this.devServer.spawnPrintModeFollowUp(session, input.trim())
      return
    }

    if (!session.ptyId) return
    try {
      this.ptyPool.write(session.ptyId, input)
    } catch {
      // PTY may have already exited
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    try {
      this.ptyPool.resize(session.ptyId, cols, rows)
    } catch {
      // PTY may have already exited
    }
  }

  async killSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    // Remove from Map first so concurrent IPC handlers (e.g. diff:get)
    // won't try to use a worktree path that's being deleted.
    this.sessions.delete(sessionId)

    // Clean up additional dir watchers
    if (this.fileWatcher) {
      for (const dir of session.additionalDirs) {
        this.fileWatcher.unwatchAdditionalDir(dir, sessionId)
      }
    }

    this.chatAdapter?.clearSession(sessionId)

    if (session.ptyId) {
      this.ptyPool.kill(session.ptyId)
    }
    if (session.devServerPtyId) {
      try { this.ptyPool.kill(session.devServerPtyId) } catch { /* already exited */ }
    }

    if (session.projectId && !session.noWorktree) {
      try {
        await this.worktreeManager.removeWorktree(
          this.projectRegistry.getProject(session.projectId)?.path ?? '',
          session.worktreePath
        )
      } catch {
        // Worktree cleanup is best-effort
      }
    }
  }

  async resumeSession(sessionId: string, runtimeId: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    if (session.ptyId) return this.toPublicSession(session)

    if (!session.ollamaModel) {
      const meta = await readWorktreeMeta(session.worktreePath)
      if (meta?.ollamaModel) {
        session.ollamaModel = meta.ollamaModel
      }
    }

    const runtime = getRuntimeById(runtimeId)
    if (!runtime) throw new Error(`Runtime not found: ${runtimeId}`)

    const runtimeArgs = [...(runtime.args ?? [])]
    if (session.ollamaModel) {
      runtimeArgs.push('--model', session.ollamaModel)
    }

    const ptyHandle = this.ptyPool.spawn(runtime.binary, runtimeArgs, {
      cwd: session.worktreePath,
      env: runtime.env,
    })

    session.ptyId = ptyHandle.id
    session.pid = ptyHandle.pid
    session.runtimeId = runtimeId
    session.status = 'running'
    session.outputBuffer = ''
    session.detectedUrl = undefined

    this.streamWirer.wireOutputStreaming(ptyHandle.id, session)
    this.streamWirer.wireExitHandling(ptyHandle.id, session)

    return this.toPublicSession(session)
  }

  getOutputBuffer(sessionId: string): string {
    const session = this.sessions.get(sessionId)
    return session ? session.outputBuffer : ''
  }

  getSession(sessionId: string): AgentSession | undefined {
    const session = this.sessions.get(sessionId)
    return session ? this.toPublicSession(session) : undefined
  }

  getDetectedUrl(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.detectedUrl ?? null
  }

  getSessionStatus(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.status ?? null
  }

  listSessions(): AgentSession[] {
    return Array.from(this.sessions.values()).map((s) => this.toPublicSession(s))
  }

  async discoverSessionsForProject(projectId: string): Promise<AgentSession[]> {
    await this.discovery.discoverSessionsForProject(projectId)
    return Array.from(this.sessions.values())
      .filter((s) => s.projectId === projectId)
      .map((s) => this.toPublicSession(s))
  }

  async discoverAllSessions(simpleProjectsBase?: string): Promise<AgentSession[]> {
    await this.discovery.discoverAllSessions(simpleProjectsBase)
    return Array.from(this.sessions.values()).map((s) => this.toPublicSession(s))
  }

  async killNonInteractiveSessions(projectId: string): Promise<{ killedIds: string[]; branchName?: string }> {
    return this.teardown.killNonInteractiveSessions(projectId)
  }

  async killInteractiveSession(sessionId: string): Promise<{ projectPath: string; branchName: string; taskDescription?: string }> {
    return this.teardown.killInteractiveSession(sessionId)
  }

  async startDevServerSession(projectId: string, branchName: string, taskDescription?: string): Promise<{ sessionId: string }> {
    return this.devServer.startDevServerSession(projectId, branchName, taskDescription)
  }

  killAllSessions(): void {
    for (const session of this.sessions.values()) {
      try { this.ptyPool.kill(session.ptyId) } catch { /* best effort */ }
    }
    this.sessions.clear()
  }

  createShellSession(cwd: string): { sessionId: string } {
    const shell = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/zsh')
    const ptyHandle = this.ptyPool.spawn(shell, [], { cwd })
    const id = uuidv4()

    const session: InternalSession = {
      id,
      projectId: '',
      runtimeId: '__shell__',
      branchName: '',
      worktreePath: cwd,
      status: 'running',
      pid: ptyHandle.pid,
      ptyId: ptyHandle.id,
      outputBuffer: '',
      additionalDirs: [],
    }

    this.sessions.set(id, session)
    this.streamWirer.wireOutputStreaming(ptyHandle.id, session)
    this.streamWirer.wireExitHandling(ptyHandle.id, session)

    return { sessionId: id }
  }

  private persistAdditionalDirs(session: InternalSession): void {
    writeWorktreeMeta(session.worktreePath, {
      runtimeId: session.runtimeId,
      taskDescription: session.taskDescription,
      additionalDirs: session.additionalDirs,
      ollamaModel: session.ollamaModel,
    }).catch(() => {})
  }

  private toPublicSession(session: InternalSession): AgentSession {
    return {
      id: session.id,
      projectId: session.projectId,
      runtimeId: session.runtimeId,
      branchName: session.branchName,
      worktreePath: session.worktreePath,
      status: session.status,
      pid: session.pid,
      taskDescription: session.taskDescription,
      additionalDirs: session.additionalDirs,
      noWorktree: session.noWorktree,
    }
  }
}
