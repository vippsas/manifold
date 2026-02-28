import { v4 as uuidv4 } from 'uuid'
import { PtyPool } from './pty-pool'
import { ProjectRegistry } from './project-registry'
import { getRuntimeById } from './runtimes'
import { detectUrl } from './url-detector'
import { gitExec } from './git-exec'
import type { ChatAdapter } from './chat-adapter'
import { debugLog } from './debug-log'
import type { InternalSession } from './session-types'
import type { SessionStreamWirer } from './session-stream-wirer'

export class DevServerManager {
  constructor(
    private ptyPool: PtyPool,
    private getChatAdapter: () => ChatAdapter | null,
    private sessions: Map<string, InternalSession>,
    private projectRegistry: ProjectRegistry,
    private sendToRenderer: (channel: string, ...args: unknown[]) => void,
    private streamWirer: SessionStreamWirer,
  ) {}

  async startDevServerSession(projectId: string, branchName: string, taskDescription?: string): Promise<{ sessionId: string }> {
    const project = this.projectRegistry.getProject(projectId)
    if (!project) throw new Error('Project not found: ' + projectId)

    // Clean up any existing sessions for this project so we don't accumulate
    // duplicate app cards every time the user opens the same app.
    for (const existing of Array.from(this.sessions.values())) {
      if (existing.projectId === projectId) {
        if (existing.ptyId) {
          try { this.ptyPool.kill(existing.ptyId) } catch { /* already exited */ }
        }
        if (existing.devServerPtyId) {
          try { this.ptyPool.kill(existing.devServerPtyId) } catch { /* already exited */ }
        }
        this.getChatAdapter()?.clearSession(existing.id)
        this.sessions.delete(existing.id)
      }
    }

    // Ensure we're on the correct branch (the project may be on main after a mode switch)
    const currentBranch = (await gitExec(['branch', '--show-current'], project.path)).trim()
    if (currentBranch !== branchName) {
      try {
        await gitExec(['checkout', branchName], project.path)
      } catch {
        // Branch may have been deleted (e.g. by worktree cleanup during mode switch).
        // Stay on the current branch — it may still have the app code.
        debugLog(`[session] checkout ${branchName} failed, staying on ${currentBranch}`)
      }
    }

    const session: InternalSession = {
      id: uuidv4(),
      projectId,
      runtimeId: 'claude',
      branchName,
      worktreePath: project.path,
      status: 'running',
      pid: null,
      ptyId: '',
      outputBuffer: '',
      taskDescription,
      additionalDirs: [],
      noWorktree: true,
      nonInteractive: true,
    }

    this.sessions.set(session.id, session)
    this.getChatAdapter()?.addSystemMessage(session.id, 'Your app is running. Send a message to make changes.')
    this.startDevServer(session)

    return { sessionId: session.id }
  }

  /**
   * Spawn `npm run dev` in the project directory. Its output is wired
   * through wireOutputStreaming so URL detection picks up the dev server URL.
   */
  startDevServer(session: InternalSession): void {
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

  /**
   * For print-mode sessions, each follow-up message spawns a fresh
   * `claude -c -p "message"` process that continues the previous conversation.
   */
  spawnPrintModeFollowUp(session: InternalSession, prompt: string): void {
    if (!prompt) return

    // Kill any still-running process to prevent race conditions where
    // an old exit handler overwrites the session's ptyId.
    if (session.ptyId) {
      try { this.ptyPool.kill(session.ptyId) } catch { /* already exited */ }
      session.ptyId = ''
    }

    const runtime = getRuntimeById(session.runtimeId)
    if (!runtime) throw new Error('Runtime not found: ' + session.runtimeId)
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

    this.streamWirer.wireStreamJsonOutput(ptyHandle.id, session)
    this.streamWirer.wirePrintModeExitHandling(ptyHandle.id, session)
  }
}
