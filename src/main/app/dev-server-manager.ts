import { v4 as uuidv4 } from 'uuid'
import { PtyPool } from '../agent/pty-pool'
import { ProjectRegistry } from '../store/project-registry'
import { getRuntimeById } from '../agent/runtimes'
import { buildSimpleRuntimeCommand } from '../agent/simple-runtime'
import { extractSlashCommands } from '../agent/ai-runtime-output-parsers'
import { detectUrl } from '../fs/url-detector'
import { gitExec } from '../git/git-exec'
import type { ChatAdapter } from '../agent/chat-adapter'
import { debugLog } from './debug-log'
import type { InternalSession } from '../session/session-types'
import type { SessionStreamWirer } from '../session/session-stream-wirer'
import { buildSimpleFollowUpPrompt } from '../../shared/simple-prompts'
import { isGitProject } from '../../shared/project-kind'

export class DevServerManager {
  constructor(
    private ptyPool: PtyPool,
    private getChatAdapter: () => ChatAdapter | null,
    private sessions: Map<string, InternalSession>,
    private projectRegistry: ProjectRegistry,
    private sendToRenderer: (channel: string, ...args: unknown[]) => void,
    private streamWirer: SessionStreamWirer,
  ) {}

  async startDevServerSession(
    projectId: string,
    branchName: string,
    taskDescription?: string,
    simpleTemplateTitle?: string,
    simplePromptInstructions?: string,
    runtimeId = 'claude',
  ): Promise<{ sessionId: string }> {
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
        if (existing.slashCommandProbePtyId) {
          try { this.ptyPool.kill(existing.slashCommandProbePtyId) } catch { /* already exited */ }
        }
        this.getChatAdapter()?.clearSession(existing.id)
        this.sessions.delete(existing.id)
      }
    }

    await this.prepareBranchForPreview(project, branchName)

    const session: InternalSession = {
      id: uuidv4(),
      projectId,
      runtimeId,
      branchName,
      worktreePath: project.path,
      status: 'running',
      pid: null,
      ptyId: '',
      outputBuffer: '',
      taskDescription,
      simpleTemplateTitle,
      simplePromptInstructions,
      additionalDirs: [],
      noWorktree: true,
      nonInteractive: true,
      // Seed the `/` autocomplete from the cached list so it works on the first message.
      slashCommands: project.slashCommands,
    }

    this.sessions.set(session.id, session)
    this.getChatAdapter()?.addSystemMessage(session.id, 'Your app is running. Send a message to make changes.')
    this.startDevServer(session)

    // Cache miss: capture the command list now so it's ready before the first message.
    if (!project.slashCommands?.length) {
      this.probeSlashCommands(session)
    }

    return { sessionId: session.id }
  }

  private async prepareBranchForPreview(
    project: NonNullable<ReturnType<ProjectRegistry['getProject']>>,
    branchName: string,
  ): Promise<void> {
    if (!isGitProject(project)) return

    let currentBranch = ''
    try {
      currentBranch = (await gitExec(['branch', '--show-current'], project.path)).trim()
    } catch (err) {
      debugLog(`[session] branch check failed for ${project.path}, starting dev server anyway: ${(err as Error).message}`)
      return
    }

    if (currentBranch === branchName) return

    try {
      await gitExec(['checkout', branchName], project.path)
    } catch {
      // Branch may have been deleted (e.g. by worktree cleanup during mode switch).
      // Stay on the current branch — it may still have the app code.
      debugLog(`[session] checkout ${branchName} failed, staying on ${currentBranch}`)
    }
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
   * For simple-mode sessions, each follow-up message spawns a fresh
   * non-interactive run using the current repository state plus recent chat history.
   */
  spawnPrintModeFollowUp(session: InternalSession, prompt: string): void {
    if (!prompt) return

    // Kill any still-running process to prevent race conditions where
    // an old exit handler overwrites the session's ptyId.
    if (session.ptyId) {
      try { this.ptyPool.kill(session.ptyId) } catch { /* already exited */ }
      session.ptyId = ''
    }

    // A real message supersedes any in-flight slash-command probe.
    if (session.slashCommandProbePtyId) {
      try { this.ptyPool.kill(session.slashCommandProbePtyId) } catch { /* already exited */ }
      session.slashCommandProbePtyId = undefined
    }

    const adapter = this.getChatAdapter()
    const history = adapter?.getMessages(session.id) ?? []
    const followUpPrompt = buildSimpleFollowUpPrompt(
      history,
      prompt,
      session.simpleTemplateTitle,
      session.simplePromptInstructions,
    )
    const runtime = getRuntimeById(session.runtimeId)
    if (!runtime) throw new Error('Runtime not found: ' + session.runtimeId)
    const simpleCommand = buildSimpleRuntimeCommand(session.runtimeId, followUpPrompt)
    const runtimeArgs = simpleCommand.args

    debugLog(`[session] print-mode follow-up: ${JSON.stringify(runtimeArgs)}`)

    const ptyHandle = this.ptyPool.spawn(simpleCommand.binary, runtimeArgs, {
      cwd: session.worktreePath,
      env: runtime.env,
    })

    session.ptyId = ptyHandle.id
    session.pid = ptyHandle.pid
    session.status = 'running'
    session.outputBuffer = ''
    session.streamJsonLineBuffer = ''
    session.nonInteractiveOutputMode = simpleCommand.outputMode
    this.sendToRenderer('agent:status', { sessionId: session.id, status: 'running' })

    if (simpleCommand.outputMode === 'plain-text') {
      this.streamWirer.wireOutputStreaming(ptyHandle.id, session)
    } else {
      this.streamWirer.wireStreamJsonOutput(ptyHandle.id, session, simpleCommand.outputMode)
    }
    this.streamWirer.wirePrintModeExitHandling(ptyHandle.id, session)
  }

  /**
   * On a cache miss, spawn a throwaway Claude run solely to capture the
   * `system/init` event — which carries the full slash-command/skill list — then
   * kill it the instant that event arrives. Init is emitted before the model
   * turn begins, so this costs effectively nothing. Only Claude reports this
   * list in its stream-json output, so other runtimes are skipped.
   *
   * Called both here (simple-mode dev server) and from SessionManager.createSession
   * for editor chat-mode agents, the other surface for the `/` autocomplete.
   */
  probeSlashCommands(session: InternalSession): void {
    if (session.runtimeId !== 'claude') return
    const runtime = getRuntimeById(session.runtimeId)
    if (!runtime) return

    const command = buildSimpleRuntimeCommand(session.runtimeId, 'hi')
    const ptyHandle = this.ptyPool.spawn(command.binary, command.args, {
      cwd: session.worktreePath,
      env: runtime.env,
    })
    session.slashCommandProbePtyId = ptyHandle.id

    let buffer = ''
    let captured = false
    this.ptyPool.onData(ptyHandle.id, (data: string) => {
      if (captured) return
      buffer += data
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        let event: Record<string, unknown>
        try { event = JSON.parse(line) as Record<string, unknown> } catch { continue }
        const commands = extractSlashCommands(event)
        if (commands) {
          captured = true
          session.slashCommands = commands
          this.projectRegistry.updateProject(session.projectId, { slashCommands: commands })
          this.sendToRenderer('agent:slash-commands', { sessionId: session.id, commands })
          try { this.ptyPool.kill(ptyHandle.id) } catch { /* already exited */ }
          return
        }
      }
    })

    this.ptyPool.onExit(ptyHandle.id, () => {
      if (session.slashCommandProbePtyId === ptyHandle.id) {
        session.slashCommandProbePtyId = undefined
      }
    })
  }
}
