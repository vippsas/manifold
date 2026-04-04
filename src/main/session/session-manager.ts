import { AgentSession, SpawnAgentOptions } from '../../shared/types'
import { WorktreeManager } from '../git/worktree-manager'
import { BranchCheckoutManager } from '../git/branch-checkout-manager'
import { PtyPool } from '../agent/pty-pool'
import { ProjectRegistry } from '../store/project-registry'
import { DevServerManager } from '../app/dev-server-manager'
import { SessionCreator } from './session-creator'
import { SessionTeardown } from './session-teardown'
import { writeWorktreeMeta } from '../git/worktree-meta'
import { debugLog } from '../app/debug-log'
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
import { resumeAgentSession, createShellPtySession } from './session-resume'
import { NlInputBuffer, RollingOutputBuffer, buildNlTranslationPrompt } from './nl-command-translator'
import { getRuntimeById } from '../agent/runtimes'
import { injectGhostText, clearGhostText, gatherGitStatus } from './shell-suggestion'


export class SessionManager {
  private sessions: Map<string, InternalSession> = new Map()
  private mainWindow: BrowserWindow | null = null
  private chatAdapter: ChatAdapter | null = null
  private memoryCapture: MemoryCapture | null = null
  private memoryCompressor: MemoryCompressor | null = null
  private memoryInjector: MemoryInjector | null = null
  private gitOps: GitOperationsManager | null = null
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
      () => this.memoryInjector,
    )
    this.teardown = new SessionTeardown(
      this.sessions,
      this.ptyPool,
      this.projectRegistry,
      (id) => this.killSession(id),
      () => this.memoryCompressor,
    )
  }

  setChatAdapter(adapter: ChatAdapter): void {
    this.chatAdapter = adapter
  }

  setMemoryCapture(capture: MemoryCapture): void {
    this.memoryCapture = capture
  }

  setMemoryCompressor(compressor: MemoryCompressor): void {
    this.memoryCompressor = compressor
  }

  setMemoryInjector(injector: MemoryInjector): void {
    this.memoryInjector = injector
  }

  setGitOps(gitOps: GitOperationsManager): void {
    this.gitOps = gitOps
    this.streamWirer.setGitOps(gitOps)
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  private sendToRenderer(channel: string, ...args: unknown[]): void {
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
    return this.toPublicSession(session)
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  interruptSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    if (!session.ptyId) return
    try {
      this.ptyPool.kill(session.ptyId)
    } catch {
      // PTY may have already exited
    }
  }

  sendInput(sessionId: string, input: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    this.memoryCapture?.recordInput(sessionId, input)

    if (session.nonInteractive) {
      // Print mode: spawn a new process that continues the previous conversation
      this.devServer.spawnPrintModeFollowUp(session, input.trim())
      return
    }

    if (!session.ptyId) return

    // Clear first-prompt hint ghost text on any keystroke
    if (session.nlHintActive) {
      session.nlHintActive = false
      clearGhostText(this.ptyPool, session.ptyId)
    }

    // NL command translator: buffer keystrokes for shell sessions
    if (session.nlInputBuffer) {
      const result = session.nlInputBuffer.feed(input)
      if (result.type === 'nl-query') {
        void this.translateNlCommand(session, result.query, result.pasted)
        return
      }
      // 'accumulate' and 'passthrough' both forward to PTY
    }

    try {
      this.ptyPool.write(session.ptyId, input)
      // Trigger activity on user input so the dot blinks immediately
      // when the user presses Enter, even before the agent produces output.
      if (input.includes('\r') || input.includes('\n')) {
        this.streamWirer.trackActivity(session)
      }
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
    const { projectId } = session

    // Remove from Map first so concurrent IPC handlers (e.g. diff:get)
    // won't try to use a worktree path that's being deleted.
    this.sessions.delete(sessionId)

    // Clean up additional dir watchers
    if (this.fileWatcher) {
      for (const dir of session.additionalDirs) {
        this.fileWatcher.unwatchAdditionalDir(dir, sessionId)
      }
    }

    this.memoryCapture?.stopCapturing(sessionId)
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

    this.notifySessionsChanged(projectId)
  }

  async resumeSession(sessionId: string, runtimeId: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    if (session.ptyId) return this.toPublicSession(session)

    await resumeAgentSession(session, runtimeId, this.ptyPool, this.streamWirer, this.memoryInjector ?? undefined)
    this.memoryCapture?.startCapturing(sessionId)
    this.notifySessionsChanged(session.projectId)

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

  getInternalSession(sessionId: string): InternalSession | undefined {
    return this.sessions.get(sessionId)
  }

  getPtyPool(): PtyPool {
    return this.ptyPool
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

  async killNonInteractiveSessions(projectId: string): Promise<{ killedIds: string[]; branchName?: string; noWorktree?: boolean }> {
    return this.teardown.killNonInteractiveSessions(projectId)
  }

  async killInteractiveSession(sessionId: string): Promise<{ projectPath: string; branchName: string; taskDescription?: string }> {
    return this.teardown.killInteractiveSession(sessionId)
  }

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
      try { this.ptyPool.kill(session.ptyId) } catch { /* best effort */ }
    }
    this.sessions.clear()
  }

  createShellSession(cwd: string, options?: { shellPrompt?: boolean; historyDir?: string }): { sessionId: string } {
    const result = createShellPtySession(cwd, this.ptyPool, this.streamWirer, this.sessions, options)
    const session = this.sessions.get(result.sessionId)
    if (session) {
      session.nlInputBuffer = new NlInputBuffer()
      session.nlOutputBuffer = new RollingOutputBuffer()
    }
    return result
  }

  private async translateNlCommand(session: InternalSession, query: string, pasted: boolean): Promise<void> {
    if (!session.ptyId || !this.gitOps || session.nlPending) return

    session.nlPending = true

    // Cancel any in-flight auto-suggestion to prevent ghost text collision
    if (session.shellSuggestion) {
      session.shellSuggestion.pending = false
      session.shellSuggestion.activeSuggestion = null
    }

    const ptyId = session.ptyId
    // When pasted, the text was never forwarded to the PTY — write it now.
    // When typed character-by-character, it's already on the prompt — just send Enter.
    this.ptyPool.write(ptyId, pasted ? `# ${query}\r` : '\r')

    // Wait briefly for the prompt to render, then show loading ghost text
    setTimeout(() => {
      if (!session.nlPending || session.ptyId !== ptyId) return
      injectGhostText(this.ptyPool, ptyId, '⏳ ...')
    }, 200)

    try {
      const terminalOutput = session.nlOutputBuffer?.getText() ?? ''
      const gitStatus = await gatherGitStatus(session.worktreePath)

      const prompt = buildNlTranslationPrompt({
        query,
        terminalOutput,
        cwd: session.worktreePath,
        gitStatus,
        os: process.platform,
        shell: 'zsh',
      })

      const runtime = getRuntimeById('claude')
      if (!runtime) return

      const result = await this.gitOps.aiGenerate(
        runtime,
        prompt,
        session.worktreePath,
        runtime.aiModelArgs ?? [],
        { timeoutMs: 60_000 },
      )

      if (session.ptyId !== ptyId) return

      const command = result.trim().split('\n')[0].trim()
      if (!command) return

      this.ptyPool.write(ptyId, command)
    } catch {
      // Error silently — user sees empty prompt
    } finally {
      // Always clear ghost text and reset state
      if (session.ptyId === ptyId) {
        clearGhostText(this.ptyPool, ptyId)
      }
      session.nlPending = false
    }
  }

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
      simpleTemplateTitle: session.simpleTemplateTitle,
      simplePromptInstructions: session.simplePromptInstructions,
      additionalDirs: session.additionalDirs,
      noWorktree: session.noWorktree,
    }
  }
}
