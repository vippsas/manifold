import { v4 as uuidv4 } from 'uuid'
import { AgentSession, SpawnAgentOptions } from '../shared/types'
import { getRuntimeById } from './runtimes'
import { WorktreeManager } from './worktree-manager'
import { PtyPool } from './pty-pool'
import { ProjectRegistry } from './project-registry'
import { detectStatus } from './status-detector'
import type { BrowserWindow } from 'electron'

interface InternalSession extends AgentSession {
  ptyId: string
  outputBuffer: string
}

export class SessionManager {
  private sessions: Map<string, InternalSession> = new Map()
  private mainWindow: BrowserWindow | null = null

  constructor(
    private worktreeManager: WorktreeManager,
    private ptyPool: PtyPool,
    private projectRegistry: ProjectRegistry
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

    const worktree = await this.worktreeManager.createWorktree(
      project.path,
      project.baseBranch,
      options.branchName
    )

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
    this.sendInitialPrompt(ptyHandle.id, options.prompt)

    return this.toPublicSession(session)
  }

  private resolveProject(projectId: string): { path: string; baseBranch: string } {
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
      outputBuffer: ''
    }
  }

  sendInput(sessionId: string, input: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    this.ptyPool.write(session.ptyId, input)
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

    this.ptyPool.kill(session.ptyId)

    try {
      await this.worktreeManager.removeWorktree(
        this.projectRegistry.getProject(session.projectId)?.path ?? '',
        session.worktreePath
      )
    } catch {
      // Worktree cleanup is best-effort
    }

    this.sessions.delete(sessionId)
  }

  getSession(sessionId: string): AgentSession | undefined {
    const session = this.sessions.get(sessionId)
    return session ? this.toPublicSession(session) : undefined
  }

  listSessions(): AgentSession[] {
    return Array.from(this.sessions.values()).map((s) => this.toPublicSession(s))
  }

  killAllSessions(): void {
    for (const [id] of this.sessions) {
      try {
        const session = this.sessions.get(id)
        if (session) {
          this.ptyPool.kill(session.ptyId)
        }
      } catch {
        // Best effort cleanup
      }
    }
    this.sessions.clear()
  }

  private wireOutputStreaming(ptyId: string, session: InternalSession): void {
    this.ptyPool.onData(ptyId, (data: string) => {
      session.outputBuffer += data
      if (session.outputBuffer.length > 100_000) {
        session.outputBuffer = session.outputBuffer.slice(-50_000)
      }

      const newStatus = detectStatus(session.outputBuffer, session.runtimeId)
      if (newStatus !== session.status) {
        session.status = newStatus
        this.sendToRenderer('agent:status', { sessionId: session.id, status: newStatus })
      }

      this.sendToRenderer('agent:output', { sessionId: session.id, data })
    })
  }

  private wireExitHandling(ptyId: string, session: InternalSession): void {
    this.ptyPool.onExit(ptyId, () => {
      session.status = 'done'
      session.pid = null
      this.sendToRenderer('agent:status', { sessionId: session.id, status: 'done' })
    })
  }

  private sendInitialPrompt(ptyId: string, prompt: string): void {
    if (!prompt) return
    // Write immediately — PTY stdin buffers the data until Claude Code reads it.
    // This avoids the double-render that happens when the prompt arrives after
    // Claude Code has already drawn its startup UI.
    try {
      this.ptyPool.write(ptyId, prompt + '\n')
    } catch {
      // PTY may have already exited
    }
  }

  private toPublicSession(session: InternalSession): AgentSession {
    return {
      id: session.id,
      projectId: session.projectId,
      runtimeId: session.runtimeId,
      branchName: session.branchName,
      worktreePath: session.worktreePath,
      status: session.status,
      pid: session.pid
    }
  }
}
