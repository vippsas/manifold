import type { PtyPool } from '../agent/pty-pool'
import type { FileWatcher } from '../fs/file-watcher'
import { runtimeAddDirCommand } from '../agent/add-dir-command'
import { detectAddDir } from '../fs/add-dir-detector'
import type { InternalSession } from './session-types'
import type { WorkingSetDelivery, WorkingSetNotice } from '../../shared/types'
import { debugLog } from '../app/debug-log'

export interface SessionWorkingSetDeps {
  sessions: Map<string, InternalSession>
  ptyPool: Pick<PtyPool, 'write'>
  getFileWatcher: () => Pick<FileWatcher, 'watchAdditionalDir'> | undefined
  persist: (session: InternalSession) => void
  sendToRenderer: (channel: string, payload: unknown) => void
  /** Seam for tests; real runs use setTimeout. */
  wait?: (ms: number) => Promise<void>
}

const POLL_MS = 250
/** How long to wait for a busy agent to come back to its composer. */
const IDLE_WAIT_MS = 20_000
/** Let the composer settle before Enter, so autocomplete does not eat it. */
const TYPE_SETTLE_MS = 600
/** Let the confirmation dialog paint before answering it. */
const CONFIRM_SETTLE_MS = 1200
/** How long to wait for the runtime to announce the folder. */
const VERIFY_MS = 10_000

/** Text near the end of the buffer that means the agent is holding a question,
 *  not sitting at an empty composer. `detectStatus` reports both as 'waiting',
 *  and typing into a permission dialog would answer it. */
const PENDING_QUESTION = /Do you want to proceed|Yes, for this session|❯\s*1\.\s|\b(?:Allow|Deny)\b.*\?/i

/**
 * Pushes a folder into agents that are already running.
 *
 * A session's `--add-dir` flags are fixed when its process is spawned, so a
 * folder added to a workspace afterwards is invisible to its live agents. The
 * session's `additionalDirs` is always updated (session-resume and print-mode
 * follow-ups both rebuild their args from it, so the folder lands on the next
 * turn or the next launch either way); on top of that, runtimes that accept a
 * folder at runtime get the command typed into their TUI.
 *
 * Every path ends in a notice to the renderer — silence would leave the user
 * believing an agent can see a folder it cannot.
 */
export class SessionWorkingSet {
  constructor(private deps: SessionWorkingSetDeps) {}

  private wait(ms: number): Promise<void> {
    return this.deps.wait ? this.deps.wait(ms) : new Promise((r) => setTimeout(r, ms))
  }

  /** Add `dir` to every live session of `workspaceId`, one notice per session. */
  async addDirToWorkspace(workspaceId: string, projectId: string, dir: string): Promise<void> {
    const sessions = [...this.deps.sessions.values()].filter(
      (s) => s.workspaceId === workspaceId && s.runtimeId !== '__shell__',
    )
    await Promise.all(sessions.map((session) => this.addDirToSession(session, projectId, dir)))
  }

  private async addDirToSession(session: InternalSession, projectId: string, dir: string): Promise<void> {
    if (session.worktreePath === dir || session.additionalDirs.includes(dir)) return

    this.record(session, projectId, dir)

    if (session.nonInteractive) {
      // Print-mode follow-ups rebuild their args per turn from additionalDirs.
      this.notify(session, dir, 'next-turn')
      return
    }

    const command = runtimeAddDirCommand(session.runtimeId, dir)
    if (!command) {
      this.notify(session, dir, 'restart-required')
      return
    }

    try {
      await this.inject(session, command.text, command.needsConfirm, dir)
      this.notify(session, dir, 'live')
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      debugLog(`[working-set] ${session.id} could not take ${dir}: ${error}`)
      this.notify(session, dir, 'manual', { error, command: command.text })
    }
  }

  /** State first, so the folder is never lost even if the injection fails. */
  private record(session: InternalSession, projectId: string, dir: string): void {
    session.additionalDirs.push(dir)
    if (session.workspaceWorktreePaths) {
      session.workspaceWorktreePaths = { ...session.workspaceWorktreePaths, [projectId]: dir }
    }
    this.deps.sendToRenderer('agent:dirs-changed', {
      sessionId: session.id,
      additionalDirs: [...session.additionalDirs],
    })
    this.deps.persist(session)
    this.deps.getFileWatcher()?.watchAdditionalDir(dir, session.id)
  }

  private async inject(session: InternalSession, text: string, needsConfirm: boolean, dir: string): Promise<void> {
    if (!session.ptyId) throw new Error('the agent has no running process')

    await this.waitFor(
      () => session.status === 'waiting' && !PENDING_QUESTION.test(session.outputBuffer.slice(-2000)),
      IDLE_WAIT_MS,
      'the agent was busy or holding a prompt',
    )

    this.write(session, text)
    await this.wait(TYPE_SETTLE_MS)
    this.write(session, '\r')
    if (needsConfirm) {
      await this.wait(CONFIRM_SETTLE_MS)
      this.write(session, '\r')
    }

    await this.waitFor(
      () => detectAddDir(session.outputBuffer.slice(-4000)) === dir,
      VERIFY_MS,
      'the agent never confirmed the folder',
    )
  }

  private write(session: InternalSession, input: string): void {
    this.deps.ptyPool.write(session.ptyId, input)
  }

  private async waitFor(ready: () => boolean, timeoutMs: number, failure: string): Promise<void> {
    for (let waited = 0; waited < timeoutMs; waited += POLL_MS) {
      if (ready()) return
      await this.wait(POLL_MS)
    }
    if (!ready()) throw new Error(failure)
  }

  private notify(
    session: InternalSession,
    dir: string,
    delivery: WorkingSetDelivery,
    extra?: { error?: string; command?: string },
  ): void {
    const notice: WorkingSetNotice = {
      sessionId: session.id,
      agentName: session.displayName || session.branchName,
      dir,
      delivery,
      ...extra,
    }
    this.deps.sendToRenderer('agent:working-set-notice', notice)
  }
}
