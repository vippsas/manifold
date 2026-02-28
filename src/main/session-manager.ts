import { v4 as uuidv4 } from 'uuid'
import { AgentSession, SpawnAgentOptions } from '../shared/types'
import { getRuntimeById } from './runtimes'
import { WorktreeManager } from './worktree-manager'
import { BranchCheckoutManager } from './branch-checkout-manager'
import { PtyPool } from './pty-pool'
import { ProjectRegistry } from './project-registry'
import { detectStatus } from './status-detector'
import { detectAddDir } from './add-dir-detector'
import { detectUrl } from './url-detector'
import { writeWorktreeMeta, readWorktreeMeta } from './worktree-meta'
import { FileWatcher } from './file-watcher'
import { gitExec } from './git-exec'
import { generateBranchName } from './branch-namer'
import type { ChatAdapter } from './chat-adapter'
import { debugLog } from './debug-log'
import type { BrowserWindow } from 'electron'

interface InternalSession extends AgentSession {
  ptyId: string
  outputBuffer: string
  taskDescription?: string
  ollamaModel?: string
  detectedUrl?: string
  nonInteractive?: boolean
  devServerPtyId?: string
  /** Buffer for accumulating partial NDJSON lines from stream-json output */
  streamJsonLineBuffer?: string
}


export class SessionManager {
  private sessions: Map<string, InternalSession> = new Map()
  private mainWindow: BrowserWindow | null = null
  private chatAdapter: ChatAdapter | null = null

  constructor(
    private worktreeManager: WorktreeManager,
    private ptyPool: PtyPool,
    private projectRegistry: ProjectRegistry,
    private branchCheckoutManager?: BranchCheckoutManager,
    private fileWatcher?: FileWatcher,
  ) {}

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
    const project = this.resolveProject(options.projectId)
    const runtime = this.resolveRuntime(options.runtimeId)

    let worktree: { branch: string; path: string }

    if (options.noWorktree) {
      await this.assertCleanWorkingTree(project.path)

      // Only one no-worktree session per project
      const existingNoWorktree = Array.from(this.sessions.values()).find(
        (s) => s.noWorktree && s.projectId === options.projectId
      )
      if (existingNoWorktree) {
        throw new Error(
          'A no-worktree agent is already running for this project. ' +
          'Only one no-worktree agent can run at a time per project.'
        )
      }

      // No-worktree mode: checkout branch directly in project directory
      if (options.existingBranch) {
        await gitExec(['checkout', options.existingBranch], project.path)
        worktree = { branch: options.existingBranch, path: project.path }
      } else if (options.prIdentifier && this.branchCheckoutManager) {
        const branch = await this.branchCheckoutManager.fetchPRBranch(
          project.path,
          options.prIdentifier
        )
        await gitExec(['checkout', branch], project.path)
        worktree = { branch, path: project.path }
      } else {
        // Create new branch from current HEAD
        const branch = options.branchName ?? (await generateBranchName(project.path, options.prompt ?? ''))
        await gitExec(['checkout', '-b', branch], project.path)
        worktree = { branch, path: project.path }
      }
    } else if (options.prIdentifier && this.branchCheckoutManager) {
      const branch = await this.branchCheckoutManager.fetchPRBranch(
        project.path,
        options.prIdentifier
      )
      worktree = await this.branchCheckoutManager.createWorktreeFromBranch(
        project.path,
        branch,
        project.name
      )
    } else if (options.existingBranch && this.branchCheckoutManager) {
      worktree = await this.branchCheckoutManager.createWorktreeFromBranch(
        project.path,
        options.existingBranch,
        project.name
      )
    } else {
      worktree = await this.worktreeManager.createWorktree(
        project.path,
        project.baseBranch,
        project.name,
        options.branchName,
        options.prompt
      )
    }

    const runtimeArgs = [...(runtime.args ?? [])]
    if (options.ollamaModel) {
      runtimeArgs.push('--model', options.ollamaModel)
    }
    if (options.nonInteractive && options.prompt) {
      // Print mode with streaming JSON: pass the prompt as a CLI argument.
      // --output-format stream-json gives us incremental NDJSON output
      // instead of buffering everything until exit.
      // --verbose is required by Claude Code when using stream-json.
      runtimeArgs.push('-p', options.prompt, '--output-format', 'stream-json', '--verbose')
    }

    debugLog(`[session] nonInteractive=${options.nonInteractive}, runtimeArgs=${JSON.stringify(runtimeArgs)}`)

    const ptyHandle = this.ptyPool.spawn(runtime.binary, runtimeArgs, {
      cwd: worktree.path,
      env: runtime.env,
      cols: options.cols,
      rows: options.rows
    })

    const session = this.buildSession(options, worktree, ptyHandle)
    this.sessions.set(session.id, session)

    if (options.nonInteractive) {
      this.wireStreamJsonOutput(ptyHandle.id, session)
      this.wirePrintModeInitialExitHandling(ptyHandle.id, session)
      this.chatAdapter?.addUserMessage(session.id, options.userMessage || options.prompt)
    } else {
      this.wireOutputStreaming(ptyHandle.id, session)
      this.wireExitHandling(ptyHandle.id, session)
    }

    // Persist runtime and task description so they survive app restarts.
    // Skip for no-worktree sessions — meta files are keyed by worktree path,
    // and writing one next to the project root would pollute the filesystem.
    if (!options.noWorktree) {
      writeWorktreeMeta(worktree.path, {
        runtimeId: options.runtimeId,
        taskDescription: options.prompt || undefined,
        ollamaModel: options.ollamaModel,
      }).catch(() => {})
    }

    return this.toPublicSession(session)
  }

  private async assertCleanWorkingTree(projectPath: string): Promise<void> {
    const status = await gitExec(['status', '--porcelain'], projectPath)
    if (status.trim().length > 0) {
      throw new Error(
        'Cannot switch branches: your working tree has uncommitted changes. ' +
        'Please commit or stash them before starting a no-worktree agent.'
      )
    }
  }

  private resolveProject(projectId: string): { name: string; path: string; baseBranch: string } {
    const project = this.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    return project
  }

  private resolveRuntime(runtimeId: string): { binary: string; args?: string[]; env?: Record<string, string> } {
    const runtime = getRuntimeById(runtimeId)
    if (!runtime) throw new Error(`Runtime not found: ${runtimeId}`)
    return runtime
  }

  private buildSession(
    options: SpawnAgentOptions,
    worktree: { branch: string; path: string },
    ptyHandle: { id: string; pid: number }
  ): InternalSession {
    return {
      id: uuidv4(),
      projectId: options.projectId,
      runtimeId: options.runtimeId,
      branchName: worktree.branch,
      worktreePath: worktree.path,
      status: 'running',
      pid: ptyHandle.pid,
      ptyId: ptyHandle.id,
      outputBuffer: '',
      taskDescription: options.prompt || undefined,
      ollamaModel: options.ollamaModel,
      additionalDirs: [],
      noWorktree: options.noWorktree,
      nonInteractive: options.nonInteractive,
    }
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  sendInput(sessionId: string, input: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    if (session.nonInteractive) {
      // Print mode: spawn a new process that continues the previous conversation
      this.spawnPrintModeFollowUp(session, input.trim())
      return
    }

    if (!session.ptyId) return
    try {
      this.ptyPool.write(session.ptyId, input)
    } catch {
      // PTY may have already exited
    }
  }

  /**
   * For print-mode sessions, each follow-up message spawns a fresh
   * `claude -c -p "message"` process that continues the previous conversation.
   */
  private spawnPrintModeFollowUp(session: InternalSession, prompt: string): void {
    if (!prompt) return

    // Kill any still-running process to prevent race conditions where
    // an old exit handler overwrites the session's ptyId.
    if (session.ptyId) {
      try { this.ptyPool.kill(session.ptyId) } catch { /* already exited */ }
      session.ptyId = ''
    }

    const runtime = this.resolveRuntime(session.runtimeId)
    const runtimeArgs = [...(runtime.args ?? []), '-c', '-p', prompt, '--output-format', 'stream-json', '--verbose']

    debugLog(`[session] print-mode follow-up: ${JSON.stringify(runtimeArgs)}`)

    const ptyHandle = this.ptyPool.spawn(runtime.binary, runtimeArgs, {
      cwd: session.worktreePath,
      env: runtime.env,
    })

    session.ptyId = ptyHandle.id
    session.pid = ptyHandle.pid
    session.status = 'running'
    session.outputBuffer = ''
    session.streamJsonLineBuffer = ''
    this.sendToRenderer('agent:status', { sessionId: session.id, status: 'running' })

    this.wireStreamJsonOutput(ptyHandle.id, session)
    this.wirePrintModeExitHandling(ptyHandle.id, session)
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

    const runtime = this.resolveRuntime(runtimeId)

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

    this.wireOutputStreaming(ptyHandle.id, session)
    this.wireExitHandling(ptyHandle.id, session)

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

  listSessions(): AgentSession[] {
    return Array.from(this.sessions.values()).map((s) => this.toPublicSession(s))
  }

  async discoverSessionsForProject(projectId: string): Promise<AgentSession[]> {
    const project = this.resolveProject(projectId)
    const worktrees = await this.worktreeManager.listWorktrees(project.path)

    const trackedPaths = new Set(
      Array.from(this.sessions.values())
        .filter((s) => s.projectId === projectId)
        .map((s) => s.worktreePath)
    )

    for (const wt of worktrees) {
      if (!trackedPaths.has(wt.path)) {
        const meta = await readWorktreeMeta(wt.path)
        const session: InternalSession = {
          id: uuidv4(),
          projectId,
          runtimeId: meta?.runtimeId ?? '',
          branchName: wt.branch,
          worktreePath: wt.path,
          status: 'done',
          pid: null,
          ptyId: '',
          outputBuffer: '',
          taskDescription: meta?.taskDescription,
          additionalDirs: meta?.additionalDirs ?? [],
          ollamaModel: meta?.ollamaModel,
        }
        this.sessions.set(session.id, session)

        if (meta?.additionalDirs) {
          for (const dir of meta.additionalDirs) {
            this.fileWatcher?.watchAdditionalDir(dir, session.id)
          }
        }
      }
    }

    return Array.from(this.sessions.values())
      .filter((s) => s.projectId === projectId)
      .map((s) => this.toPublicSession(s))
  }

  async discoverAllSessions(simpleProjectsBase?: string): Promise<AgentSession[]> {
    const projects = this.projectRegistry.listProjects()

    for (const project of projects) {
      // Already have sessions for this project — skip
      if (Array.from(this.sessions.values()).some((s) => s.projectId === project.id)) {
        continue
      }

      // Discover worktree-based sessions
      try {
        await this.discoverSessionsForProject(project.id)
      } catch {
        // Project path may no longer exist
      }

      // If still no sessions and project is a simple-mode project (lives under
      // the managed projects directory), create a dormant noWorktree stub.
      if (simpleProjectsBase &&
          project.path.startsWith(simpleProjectsBase) &&
          !Array.from(this.sessions.values()).some((s) => s.projectId === project.id)) {
        try {
          const branchOutput = await gitExec(['branch', '--show-current'], project.path)
          const branch = branchOutput.trim()
          if (branch) {
            const session: InternalSession = {
              id: uuidv4(),
              projectId: project.id,
              runtimeId: '',
              branchName: branch,
              worktreePath: project.path,
              status: 'done',
              pid: null,
              ptyId: '',
              outputBuffer: '',
              taskDescription: undefined,
              additionalDirs: [],
              noWorktree: true,
              nonInteractive: true,
            }
            this.sessions.set(session.id, session)
          }
        } catch {
          // Git command failed — project directory may be gone
        }
      }
    }

    return Array.from(this.sessions.values()).map((s) => this.toPublicSession(s))
  }

  async killNonInteractiveSessions(projectId: string): Promise<{ killedIds: string[]; branchName?: string }> {
    const toKill = Array.from(this.sessions.values())
      .filter(s => s.projectId === projectId && s.nonInteractive)
    const killedIds: string[] = []
    let branchName: string | undefined

    for (const session of toKill) {
      branchName = session.branchName

      // Stop running processes so file system is stable before committing
      if (session.ptyId) {
        try { this.ptyPool.kill(session.ptyId) } catch { /* already exited */ }
        session.ptyId = ''
      }
      if (session.devServerPtyId) {
        try { this.ptyPool.kill(session.devServerPtyId) } catch { /* already exited */ }
        session.devServerPtyId = undefined
      }

      // Commit any uncommitted work so it survives the mode switch
      try {
        const status = await gitExec(['status', '--porcelain'], session.worktreePath)
        if (status.trim().length > 0) {
          await gitExec(['add', '-A'], session.worktreePath)
          await gitExec(['commit', '-m', 'Auto-commit: work from simple mode'], session.worktreePath)
          debugLog(`[session] auto-committed changes on branch ${branchName}`)
        }
      } catch (err) {
        debugLog(`[session] auto-commit failed: ${err}`)
      }

      await this.killSession(session.id)
      killedIds.push(session.id)
    }

    // Switch project directory back to base branch so new worktrees can be created
    if (branchName) {
      const project = this.projectRegistry.getProject(projectId)
      if (project) {
        try {
          await gitExec(['checkout', project.baseBranch], project.path)
          debugLog(`[session] switched project back to ${project.baseBranch}`)
        } catch (err) {
          debugLog(`[session] checkout base branch failed: ${err}`)
        }
      }
    }

    return { killedIds, branchName }
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
    this.wireOutputStreaming(ptyHandle.id, session)
    this.wireExitHandling(ptyHandle.id, session)

    return { sessionId: id }
  }

  /**
   * Parse NDJSON stream from `claude -p --output-format stream-json`.
   * Each line is a JSON object. We extract assistant text content and
   * stream it to the chat in real time.
   */
  private wireStreamJsonOutput(ptyId: string, session: InternalSession): void {
    session.streamJsonLineBuffer = ''

    this.ptyPool.onData(ptyId, (data: string) => {
      debugLog(`[stream-json] raw data (${data.length} bytes): ${data.slice(0, 500)}`)
      session.streamJsonLineBuffer = (session.streamJsonLineBuffer ?? '') + data

      // Process complete lines
      const lines = session.streamJsonLineBuffer.split('\n')
      // Keep the last (potentially incomplete) line in the buffer
      session.streamJsonLineBuffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
          const event = JSON.parse(trimmed)
          debugLog(`[stream-json] event type=${event.type}`)
          this.handleStreamJsonEvent(session, event)
        } catch {
          debugLog(`[stream-json] non-JSON line: ${trimmed.slice(0, 200)}`)
        }
      }
    })
  }

  private handleStreamJsonEvent(session: InternalSession, event: Record<string, unknown>): void {
    const type = event.type as string | undefined

    if (type === 'assistant') {
      // Each assistant turn emits an event with the full message content.
      // Extract text blocks and send them to chat.
      const message = event.message as { content?: Array<{ type: string; text?: string }> } | undefined
      if (message?.content) {
        const textParts = message.content
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text!)
        if (textParts.length > 0) {
          const text = textParts.join('\n')
          this.chatAdapter?.addAgentMessage(session.id, text)
          this.detectUrlInText(session, text)
        }
      }
    } else if (type === 'result') {
      // Final result — only emit if no agent messages were sent (fallback)
      const result = event.result as string | undefined
      const subtype = event.subtype as string | undefined
      if (result && subtype === 'success') {
        const existing = this.chatAdapter?.getMessages(session.id) ?? []
        const hasAgentMsg = existing.some(m => m.role === 'agent')
        if (!hasAgentMsg) {
          this.chatAdapter?.addAgentMessage(session.id, result)
        }
        this.detectUrlInText(session, result)
      }
      // The result event signals the agent is done. Transition to 'waiting'
      // immediately rather than waiting for the process to exit (which can
      // linger for over a minute after the result is emitted).
      session.status = 'waiting'
      this.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
    }
  }

  private detectUrlInText(session: InternalSession, text: string): void {
    if (session.detectedUrl) return
    const urlResult = detectUrl(text)
    if (urlResult) {
      session.detectedUrl = urlResult.url
      debugLog(`[session] URL detected in agent text: ${urlResult.url}`)
      this.sendToRenderer('preview:url-detected', {
        sessionId: session.id,
        url: urlResult.url,
      })
    }
  }

  private wireOutputStreaming(ptyId: string, session: InternalSession): void {
    this.ptyPool.onData(ptyId, (data: string) => {
      session.outputBuffer += data
      if (session.outputBuffer.length > 100_000) {
        session.outputBuffer = session.outputBuffer.slice(-50_000)
      }

      if (session.runtimeId !== '__shell__') {
        const newStatus = detectStatus(session.outputBuffer, session.runtimeId)
        if (newStatus !== session.status) {
          session.status = newStatus
          this.sendToRenderer('agent:status', { sessionId: session.id, status: newStatus })
        }

        const addedDir = detectAddDir(session.outputBuffer.slice(-2000))
        if (addedDir && !session.additionalDirs.includes(addedDir)) {
          session.additionalDirs.push(addedDir)
          this.sendToRenderer('agent:dirs-changed', {
            sessionId: session.id,
            additionalDirs: [...session.additionalDirs],
          })
          this.persistAdditionalDirs(session)
          this.fileWatcher?.watchAdditionalDir(addedDir, session.id)
        }

        const urlResult = detectUrl(session.outputBuffer.slice(-2000))
        if (urlResult && !session.detectedUrl) {
          session.detectedUrl = urlResult.url
          this.sendToRenderer('preview:url-detected', {
            sessionId: session.id,
            url: urlResult.url,
          })
        }
      }

      this.chatAdapter?.processPtyOutput(session.id, data)
      this.sendToRenderer('agent:output', { sessionId: session.id, data })
    })
  }

  private wireExitHandling(ptyId: string, session: InternalSession): void {
    this.ptyPool.onExit(ptyId, (exitCode: number) => {
      session.status = 'done'
      session.pid = null
      session.ptyId = ''
      this.sendToRenderer('agent:status', { sessionId: session.id, status: 'done' })
      this.sendToRenderer('agent:exit', { sessionId: session.id, code: exitCode })
    })
  }

  /**
   * Print-mode processes exit after each prompt. The session stays alive
   * in 'waiting' state, ready for follow-up messages via spawnPrintModeFollowUp.
   */
  private wirePrintModeExitHandling(ptyId: string, session: InternalSession): void {
    this.ptyPool.onExit(ptyId, () => {
      session.status = 'waiting'
      session.pid = null
      session.ptyId = ''
      this.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
    })
  }

  /**
   * After the initial print-mode build finishes, auto-start the dev server
   * so the preview pane can show the app.
   */
  private wirePrintModeInitialExitHandling(ptyId: string, session: InternalSession): void {
    this.ptyPool.onExit(ptyId, () => {
      session.pid = null
      session.ptyId = ''

      if (session.detectedUrl) {
        // The agent already started the dev server and we detected its URL
        // from the stream-json output — no need to start another one.
        debugLog(`[session] initial build finished, URL already detected: ${session.detectedUrl}`)
        session.status = 'waiting'
        this.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
      } else {
        debugLog(`[session] initial build finished, starting dev server in ${session.worktreePath}`)
        this.startDevServer(session)
      }
    })
  }

  /**
   * Spawn `npm run dev` in the project directory. Its output is wired
   * through wireOutputStreaming so URL detection picks up the dev server URL.
   */
  private startDevServer(session: InternalSession): void {
    const ptyHandle = this.ptyPool.spawn('npm', ['run', 'dev'], {
      cwd: session.worktreePath,
    })

    session.devServerPtyId = ptyHandle.id
    session.status = 'running'
    session.outputBuffer = ''
    this.sendToRenderer('agent:status', { sessionId: session.id, status: 'running' })

    // Wire output so URL detection and chat adapter pick up the dev server URL
    this.ptyPool.onData(ptyHandle.id, (data: string) => {
      session.outputBuffer += data
      if (session.outputBuffer.length > 100_000) {
        session.outputBuffer = session.outputBuffer.slice(-50_000)
      }

      const urlResult = detectUrl(session.outputBuffer.slice(-2000))
      if (urlResult && !session.detectedUrl) {
        session.detectedUrl = urlResult.url
        debugLog(`[session] dev server URL detected: ${urlResult.url}`)
        this.sendToRenderer('preview:url-detected', {
          sessionId: session.id,
          url: urlResult.url,
        })
        // Once we have the URL, set status to waiting (ready for follow-ups)
        session.status = 'waiting'
        this.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
      }
    })

    this.ptyPool.onExit(ptyHandle.id, () => {
      session.devServerPtyId = undefined
      debugLog(`[session] dev server exited for ${session.id}`)
      // If no URL was ever detected, go to waiting state anyway
      if (session.status === 'running') {
        session.status = 'waiting'
        this.sendToRenderer('agent:status', { sessionId: session.id, status: 'waiting' })
      }
    })
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
