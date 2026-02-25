import { v4 as uuidv4 } from 'uuid'
import { AgentSession, SpawnAgentOptions } from '../shared/types'
import { getRuntimeById } from './runtimes'
import { WorktreeManager } from './worktree-manager'
import { BranchCheckoutManager } from './branch-checkout-manager'
import { PtyPool } from './pty-pool'
import { ProjectRegistry } from './project-registry'
import { detectStatus } from './status-detector'
import { detectAddDir } from './add-dir-detector'
import { writeWorktreeMeta, readWorktreeMeta } from './worktree-meta'
import { FileWatcher } from './file-watcher'
import { gitExec } from './git-exec'
import { generateBranchName } from './branch-namer'
import type { BrowserWindow } from 'electron'

interface InternalSession extends AgentSession {
  ptyId: string
  outputBuffer: string
  taskDescription?: string
}

export class SessionManager {
  private sessions: Map<string, InternalSession> = new Map()
  private mainWindow: BrowserWindow | null = null

  constructor(
    private worktreeManager: WorktreeManager,
    private ptyPool: PtyPool,
    private projectRegistry: ProjectRegistry,
    private branchCheckoutManager?: BranchCheckoutManager,
    private fileWatcher?: FileWatcher,
  ) {}

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

    const ptyHandle = this.ptyPool.spawn(runtime.binary, [...(runtime.args ?? [])], {
      cwd: worktree.path,
      env: runtime.env,
      cols: options.cols,
      rows: options.rows
    })

    const session = this.buildSession(options, worktree, ptyHandle)
    this.sessions.set(session.id, session)

    this.wireOutputStreaming(ptyHandle.id, session)
    this.wireExitHandling(ptyHandle.id, session)

    // Persist runtime and task description so they survive app restarts
    writeWorktreeMeta(worktree.path, {
      runtimeId: options.runtimeId,
      taskDescription: options.prompt || undefined,
    }).catch(() => {})

    return this.toPublicSession(session)
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
      additionalDirs: [],
      noWorktree: options.noWorktree,
    }
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  sendInput(sessionId: string, input: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
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

    if (session.ptyId) {
      this.ptyPool.kill(session.ptyId)
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

    const runtime = this.resolveRuntime(runtimeId)

    const ptyHandle = this.ptyPool.spawn(runtime.binary, [...(runtime.args ?? [])], {
      cwd: session.worktreePath,
      env: runtime.env,
    })

    session.ptyId = ptyHandle.id
    session.pid = ptyHandle.pid
    session.runtimeId = runtimeId
    session.status = 'running'
    session.outputBuffer = ''

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
      }

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

  private persistAdditionalDirs(session: InternalSession): void {
    writeWorktreeMeta(session.worktreePath, {
      runtimeId: session.runtimeId,
      taskDescription: session.taskDescription,
      additionalDirs: session.additionalDirs,
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
