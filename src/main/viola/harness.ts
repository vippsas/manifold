import type { AgentRuntime, Project } from '../../shared/types'
import { isGitProject } from '../../shared/project-kind'
import { getRuntimeById, listRuntimesWithStatus } from '../agent/runtimes'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { GitOperationsManager } from '../git/git-operations'
import { createAgentControlService, type AgentControlService } from '../plugins/agent-control-service'
import { createAgentSpawnService, type NativeAgentSpawnService } from '../plugins/agent-spawn-service'
import type { ViolaHarnessController, SessionManager } from '../session/session-manager'
import { ViolaEngine, type ViolaAgent, type ViolaTurn, type ViolaTurnRequest } from './engine'
import { describeTaskMilestone, formatPlan, formatResult, formatStart } from './format'
import { createViolaDoneSignal, type ViolaDoneSignal } from './done-signal'
import { createViolaGates, type ViolaGates } from './gates'
import { createViolaGit, type ViolaGit } from './git'
import { stripAnsiForContext } from '../session/nl-command-translator'
import { parsePlanResponse } from './planner'
import { buildPlanPrompt } from './prompts'
import { FileViolaStore, type ViolaStore } from './store'
import { createViolaVerdictStore, type ViolaVerdictStore } from './verdict-store'
import { workerComposerReady } from './worker-ready'
import type { ViolaRun, ViolaTaskState, ViolaWorkerId } from '../../shared/viola'
import { isViolaWorker } from '../../shared/viola'

type GitAi = Pick<GitOperationsManager, 'aiGenerate'>

export interface ViolaHarnessOptions {
  storageRoot: string
  getPreferredRuntime(): string
  /** Resolves the session's project so Viola can refuse a folder project up front. */
  getProject?: (projectId: string) => Pick<Project, 'kind'> | undefined | null
  listRuntimes?: () => Promise<AgentRuntime[]>
  spawnService?: NativeAgentSpawnService
  controlService?: AgentControlService
  store?: ViolaStore
  git?: ViolaGit
  gates?: ViolaGates
  verdicts?: ViolaVerdictStore
  done?: ViolaDoneSignal
  /** Pushes run snapshots to the renderer's live board. */
  sendToRenderer?: (channel: string, payload: unknown) => void
  /** Interactive timing knobs; overridable so tests need not wait on real delays. */
  readyPollMs?: number
  readyQuietMs?: number
  submitDelayMs?: number
}

const START_COMMANDS = new Set(['start', 'start plan', 'run', 'run plan', 'approve', 'approved'])
/** The planner may read the repository before answering, so it gets more than a one-shot budget. */
const PLAN_TIMEOUT_MS = 10 * 60_000
const WORKER_TURN_BUDGET_SECONDS = 30 * 60
const TERMINAL_REPORT_MAX_CHARS = 4_000
/** Matches the interactive submit delay the shared turn driver uses. */
const SUBMIT_DELAY_MS = 400
const READY_POLL_MS = 500
/** The composer must hold still this long: a TUI draws it early, then redraws through startup. */
const READY_QUIET_MS = 1_500
const DEFAULT_READY_TIMEOUT_MS = 120_000

/** Native conversational harness for the Viola runtime. */
export class ViolaHarness implements ViolaHarnessController {
  private readonly engine: ViolaEngine
  private readonly inflight = new Set<string>()
  private readonly planAborts = new Map<string, AbortController>()
  private readonly announced = new Map<string, Map<string, ViolaTaskState>>()
  private readonly sendToRenderer: (channel: string, payload: unknown) => void
  private readonly control: AgentControlService
  private readonly done: ViolaDoneSignal
  private readonly readyPollMs: number
  private readonly readyQuietMs: number
  private readonly submitDelayMs: number
  private readonly listRuntimes: () => Promise<AgentRuntime[]>

  constructor(
    private readonly sessions: SessionManager,
    private readonly chat: ChatAdapter,
    gitOps: GitAi,
    options: ViolaHarnessOptions,
  ) {
    const spawn = options.spawnService ?? createAgentSpawnService(sessions)
    this.control = options.controlService ?? createAgentControlService(sessions)
    this.listRuntimes = options.listRuntimes ?? listRuntimesWithStatus
    this.sendToRenderer = options.sendToRenderer ?? ((): void => {})
    this.done = options.done ?? createViolaDoneSignal()
    this.readyPollMs = options.readyPollMs ?? READY_POLL_MS
    this.readyQuietMs = options.readyQuietMs ?? READY_QUIET_MS
    this.submitDelayMs = options.submitDelayMs ?? SUBMIT_DELAY_MS

    this.engine = new ViolaEngine({
      availableRuntimes: () => this.availableWorkers(),
      baseWorktreePath: async (sessionId) => this.requireSession(sessionId).worktreePath,
      supportsIsolatedWorktrees: async (sessionId) => {
        const lookup = options.getProject
        if (!lookup) return true
        return isGitProject(lookup(this.requireSession(sessionId).projectId))
      },
      plan: async (sessionId, goal, runtimes) => {
        const session = this.requireSession(sessionId)
        const brain = this.resolveBrain(options.getPreferredRuntime(), runtimes)
        // No model args: the brain's cheap `aiModelArgs` exist for commit messages, not planning.
        const response = await gitOps.aiGenerate(
          brain,
          buildPlanPrompt(goal, runtimes),
          session.worktreePath,
          [],
          { silent: true, timeoutMs: PLAN_TIMEOUT_MS, signal: this.planAborts.get(sessionId)?.signal },
        )
        const parsed = parsePlanResponse(response)
        if ('error' in parsed) throw new Error(parsed.error)
        return parsed
      },
      spawn: async (baseSessionId, spawnOptions): Promise<ViolaAgent> => {
        const child = await spawn.spawnAgent(baseSessionId, spawnOptions)
        if (!isViolaWorker(child.runtimeId)) {
          throw new Error(`Unsupported Viola worker: ${child.runtimeId}`)
        }
        return {
          sessionId: child.sessionId,
          runtimeId: child.runtimeId,
          worktreePath: child.worktreePath,
          whenReady: (timeoutMs) => this.workerReady(child.sessionId, child.runtimeId, timeoutMs, spawn),
          runTurn: (request) => this.runChildTurn(child.sessionId, request),
        }
      },
      git: options.git ?? createViolaGit(),
      gates: options.gates ?? createViolaGates(),
      verdicts: options.verdicts ?? createViolaVerdictStore(),
      done: this.done,
      store: options.store ?? new FileViolaStore(options.storageRoot),
      emit: (run) => this.publishRun(run),
    })
  }

  send(sessionId: string, input: string): void {
    if (!input) return
    if (this.inflight.has(sessionId)) {
      this.chat.addAgentMessage(sessionId, 'I am still running the current Viola step. Stop it before starting another.')
      return
    }
    this.inflight.add(sessionId)
    void this.handleInput(sessionId, input).finally(() => this.inflight.delete(sessionId))
  }

  interrupt(sessionId: string): void {
    const planning = this.planAborts.get(sessionId)
    planning?.abort()
    void this.engine.stop(sessionId).finally(() => {
      this.sessions.setHarnessStatus(sessionId, 'waiting')
      this.chat.addAgentMessage(
        sessionId,
        planning
          ? 'Planning stopped. No workers were started.'
          : 'Stopped. Existing worker branches and worktrees were left intact.',
      )
    })
  }

  disposeSession(sessionId: string): void {
    this.planAborts.get(sessionId)?.abort()
    this.planAborts.delete(sessionId)
    void this.engine.stop(sessionId)
    this.inflight.delete(sessionId)
    this.announced.delete(sessionId)
  }

  private async handleInput(sessionId: string, input: string): Promise<void> {
    this.requireSession(sessionId)
    const current = await this.engine.getRun(sessionId)
    const normalized = input.trim().toLowerCase()

    if (current?.state === 'planned' && START_COMMANDS.has(normalized)) {
      await this.start(sessionId, current)
      return
    }
    if (current?.state === 'planned' && normalized === 'revise plan') {
      this.chat.addAgentMessage(sessionId, 'Tell me what should change in the plan. No workers have started.')
      return
    }
    const goal = current?.state === 'planned'
      ? `${current.goal}\n\nRevision requested by the user:\n${input}`
      : input
    await this.plan(sessionId, goal)
  }

  private async plan(sessionId: string, goal: string): Promise<void> {
    const abort = new AbortController()
    this.planAborts.set(sessionId, abort)
    this.announced.delete(sessionId)
    this.sessions.setHarnessStatus(sessionId, 'running')
    try {
      const run = await this.engine.plan(sessionId, goal)
      this.chat.addAgentMessageWithOptions(sessionId, formatPlan(run), ['Start plan', 'Revise plan'])
      this.sessions.setHarnessStatus(sessionId, 'waiting')
    } catch (error) {
      if (abort.signal.aborted) {
        this.sessions.setHarnessStatus(sessionId, 'waiting')
        return
      }
      this.chat.addAgentMessage(sessionId, `I could not create the plan: ${errorMessage(error)}`)
      this.sessions.setHarnessStatus(sessionId, 'error')
    } finally {
      if (this.planAborts.get(sessionId) === abort) this.planAborts.delete(sessionId)
    }
  }

  private async start(sessionId: string, plan: ViolaRun): Promise<void> {
    this.sessions.setHarnessStatus(sessionId, 'running')
    this.chat.addAgentMessage(sessionId, formatStart(plan))
    try {
      const result = await this.engine.start(sessionId)
      this.chat.addAgentMessage(sessionId, formatResult(result))
      this.sessions.setHarnessStatus(sessionId, result.state === 'error' ? 'error' : 'waiting')
    } catch (error) {
      this.chat.addAgentMessage(sessionId, `The run failed: ${errorMessage(error)}`)
      this.sessions.setHarnessStatus(sessionId, 'error')
    }
  }

  /** Streams the run to the live board on every change, and writes only milestones to the chat
   *  log: the board carries in-flight detail, the transcript keeps the durable outcomes. */
  private publishRun(run: ViolaRun): void {
    this.sendToRenderer('viola:run', { sessionId: run.baseSessionId, run })

    let seen = this.announced.get(run.baseSessionId)
    if (!seen) {
      seen = new Map()
      this.announced.set(run.baseSessionId, seen)
    }
    for (const task of run.tasks) {
      if (seen.get(task.id) === task.state) continue
      seen.set(task.id, task.state)
      const line = describeTaskMilestone(task)
      if (line) this.chat.addAgentMessage(run.baseSessionId, line)
    }
  }

  private async availableWorkers(): Promise<ViolaWorkerId[]> {
    const runtimes = await this.listRuntimes()
    return runtimes
      .filter((runtime) => runtime.installed !== false && isViolaWorker(runtime.id))
      .map((runtime) => runtime.id as ViolaWorkerId)
  }

  private resolveBrain(preferredId: string, workers: ViolaWorkerId[]): AgentRuntime {
    const preferred = workers.includes(preferredId as ViolaWorkerId) ? preferredId : undefined
    const runtimeId = preferred ?? (workers.includes('claude') ? 'claude' : workers[0])
    const runtime = getRuntimeById(runtimeId)
    if (!runtime || runtime.kind === 'orchestrator') throw new Error('No planning brain is available.')
    return runtime
  }

  /** Waits until an interactive worker's TUI can actually take a prompt.
   *
   *  Not the session status: that reads "waiting" from a prompt-shaped character anywhere in the
   *  output, and a TUI's startup banner has those. A codex reviewer was typed into while it was
   *  still starting its MCP servers; the composer redrew, the prompt was gone, and the reviewer sat
   *  idle for its whole budget. Ready means the composer is drawn, nothing on screen would swallow
   *  keystrokes, and the screen has been quiet for a moment — so a composer drawn early and then
   *  wiped does not count. Chat-mode sessions have no TUI and keep the plain status check. */
  private async workerReady(
    sessionId: string,
    runtimeId: string,
    timeoutMs: number | undefined,
    spawn: NativeAgentSpawnService,
  ): Promise<boolean> {
    const internal = this.sessions.getInternalSession(sessionId)
    if (!internal || internal.nonInteractive) return spawn.whenReady(sessionId, timeoutMs)
    const deadline = Date.now() + (timeoutMs ?? DEFAULT_READY_TIMEOUT_MS)
    while (Date.now() < deadline) {
      const current = this.sessions.getInternalSession(sessionId)
      if (!current) return false
      const quietFor = Date.now() - (current.lastOutputTime ?? 0)
      if (workerComposerReady(runtimeId, current.outputBuffer ?? '') && quietFor >= this.readyQuietMs) return true
      await sleep(this.readyPollMs)
    }
    return false
  }

  /** Sends a prompt, then waits for the file the worker was told to write.
   *
   *  Deliberately not the shared turn-end heuristic: that infers "finished" from an idle-looking
   *  terminal, and a TUI keeps its prompt glyph on screen while it works, so a worker that pauses
   *  for a few seconds gets declared done while it is still going. */
  private async runChildTurn(sessionId: string, request: ViolaTurnRequest): Promise<ViolaTurn> {
    const { prompt, completionFile, signal } = request
    if (signal.aborted) return { outcome: 'aborted', response: '' }
    const before = this.chat.getMessages(sessionId).length

    await this.done.clear(completionFile)
    const interactive = !this.sessions.getInternalSession(sessionId)?.nonInteractive
    // Typed raw into a PTY, every newline in a prompt is an Enter: a real gate-fix prompt reached
    // its worker as the last 133 characters, the rest having been submitted as fragments. Framing
    // it as a bracketed paste is what a terminal does when a human pastes, and the TUI then takes
    // the whole block as one message. A chat-mode runtime gets the prompt as argv, so no frame.
    this.sessions.sendInput(sessionId, interactive ? asBracketedPaste(prompt) : prompt)
    if (interactive) {
      await sleep(this.submitDelayMs)
      this.sessions.sendInput(sessionId, '\r')
    }

    const outcome = await this.done.wait(completionFile, {
      signal,
      timeoutMs: WORKER_TURN_BUDGET_SECONDS * 1000,
    })
    if (outcome !== 'done') {
      this.control.cancelTurn(sessionId)
      this.sessions.interruptSession(sessionId)
    }

    const response = this.chat.getMessages(sessionId)
      .slice(before)
      .filter((message) => message.role === 'agent')
      .map((message) => message.text)
      .join('\n')
    // An interactive worker writes to its PTY, not to the chat store, so its report is the tail
    // of the terminal — readable only once the escape codes are gone.
    const terminal = this.sessions.getInternalSession(sessionId)?.outputBuffer ?? ''
    return {
      outcome: outcome === 'done' ? 'ended' : outcome,
      response: response || terminalReport(terminal),
    }
  }

  private requireSession(sessionId: string) {
    const session = this.sessions.getSession(sessionId)
    if (!session || session.runtimeId !== 'viola') throw new Error(`No Viola session ${sessionId}`)
    return session
  }
}

/** The readable tail of a worker's terminal, bounded so a long session cannot flood a prompt. */
function terminalReport(output: string): string {
  const clean = stripAnsiForContext(output)
    .split('\n')
    .map((line) => line.replace(/\r/g, '').trimEnd())
    .filter((line) => line.trim().length > 0)
    .join('\n')
  return clean.length > TERMINAL_REPORT_MAX_CHARS ? clean.slice(-TERMINAL_REPORT_MAX_CHARS) : clean
}

/** xterm bracketed-paste framing: the TUI treats the enclosed text as one pasted block. */
function asBracketedPaste(text: string): string {
  return `\u001b[200~${text}\u001b[201~`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
