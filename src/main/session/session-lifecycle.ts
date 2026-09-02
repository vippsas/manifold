import { AgentSession, SpawnAgentOptions } from '../../shared/types'
import { ProjectRegistry } from '../store/project-registry'
import { PtyPool } from '../agent/pty-pool'
import type { MemoryCapture } from '../memory/memory-capture'
import type { MemoryInjector } from '../memory/memory-injector'
import type { InternalSession } from './session-types'
import type { SessionCreator } from './session-creator'
import type { SessionStreamWirer } from './session-stream-wirer'
import type { VerdictRecorder } from './verdict-recorder'
import type { DismissedAgentsStore } from '../store/dismissed-agents-store'
import { resumeAgentSession } from './session-resume'
import { toPublicSession } from './session-public'

interface SessionLifecycleDeps {
  sessions: Map<string, InternalSession>
  projectRegistry: ProjectRegistry
  sessionCreator: SessionCreator
  ptyPool: PtyPool
  streamWirer: SessionStreamWirer
  probeSlashCommands: (session: InternalSession) => void
  getMemoryCapture: () => MemoryCapture | null
  getMemoryInjector: () => MemoryInjector | null
  getVerdictRecorder: () => VerdictRecorder | null
  getDismissedAgents: () => Pick<DismissedAgentsStore, 'has' | 'delete'> | null
  notifySessionsChanged: (projectId: string) => void
}

/** Create/resume orchestration for agent sessions, split out of SessionManager. */
export class SessionLifecycle {
  /** Dedup concurrent resume calls for the same session id. */
  private resumeInFlight = new Map<string, Promise<AgentSession>>()

  constructor(private deps: SessionLifecycleDeps) {}

  async createSession(options: SpawnAgentOptions): Promise<AgentSession> {
    const project = this.deps.projectRegistry.getProject(options.projectId)
    if (!project) throw new Error(`Project not found: ${options.projectId}`)
    // No-worktree agents run directly in the repo and share one working tree.
    // Multiple are allowed per project (warn-only); the New Agent form surfaces
    // a heads-up when another in-place agent is already active.
    return this.doCreateSession(options)
  }

  private async doCreateSession(options: SpawnAgentOptions): Promise<AgentSession> {
    const project = this.deps.projectRegistry.getProject(options.projectId)!

    const session = await this.deps.sessionCreator.create(options)
    this.deps.sessions.set(session.id, session)
    // The user explicitly recreated an agent on this branch — lift any
    // dismissal so the session is rediscoverable once it goes dormant (#679).
    this.deps.getDismissedAgents()?.delete(session.projectId, session.branchName)

    // Chat-mode (nonInteractive) agents show a `/` command autocomplete before
    // the first message is sent. Seed it from the project cache, and on a cache
    // miss probe for the list, so commands don't only appear from the 2nd message.
    if (session.nonInteractive && session.runtimeId !== 'viola') {
      if (project.slashCommands?.length) {
        session.slashCommands = project.slashCommands
      } else if (!session.ptyId) {
        // Deferred session (no first message yet) — probe before the user types.
        this.deps.probeSlashCommands(session)
      }
    }

    this.deps.getMemoryCapture()?.startCapturing(session.id)
    this.deps.notifySessionsChanged(session.projectId)
    const verdictRecorder = this.deps.getVerdictRecorder()
    if (verdictRecorder && !session.noWorktree && session.worktreePath) {
      verdictRecorder.onSessionCreated({
        sessionId: session.id,
        projectId: session.projectId,
        title: session.displayName,
        branch: session.branchName,
        runtime: session.runtimeId,
        taskPrompt: session.taskDescription ?? '',
        worktreePath: session.worktreePath,
        baseBranch: project.baseBranch || 'main',
      })
    }
    return toPublicSession(session)
  }

  async resumeSession(sessionId: string, runtimeId: string): Promise<AgentSession> {
    const session = this.deps.sessions.get(sessionId)
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

    const promise = resumeAgentSession(session, runtimeId, this.deps.ptyPool, this.deps.streamWirer, this.deps.getMemoryInjector() ?? undefined)
      .then(() => {
        this.deps.getMemoryCapture()?.startCapturing(sessionId)
        this.deps.notifySessionsChanged(session.projectId)
        return toPublicSession(session)
      })
      .finally(() => {
        this.resumeInFlight.delete(sessionId)
      })

    this.resumeInFlight.set(sessionId, promise)
    return promise
  }
}
