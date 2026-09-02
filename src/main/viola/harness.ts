import type { AgentRuntime } from '../../shared/types'
import { getRuntimeById, listRuntimesWithStatus } from '../agent/runtimes'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { GitOperationsManager } from '../git/git-operations'
import { createAgentControlService, type AgentControlService } from '../plugins/agent-control-service'
import { createAgentSpawnService, type NativeAgentSpawnService } from '../plugins/agent-spawn-service'
import type { ViolaHarnessController, SessionManager } from '../session/session-manager'
import { ViolaEngine, type ViolaAgent, type ViolaTurn } from './engine'
import { describeTaskProgress, formatPlan, formatResult, formatStart } from './format'
import { createViolaGates, type ViolaGates } from './gates'
import { createViolaGit, type ViolaGit } from './git'
import { parsePlanResponse } from './planner'
import { buildPlanPrompt } from './prompts'
import { FileViolaStore, type ViolaStore } from './store'
import type { ViolaRun, ViolaTaskState, ViolaWorkerId } from './types'
import { isViolaWorker } from './types'

type GitAi = Pick<GitOperationsManager, 'aiGenerate'>

export interface ViolaHarnessOptions {
  storageRoot: string
  getPreferredRuntime(): string
  listRuntimes?: () => Promise<AgentRuntime[]>
  spawnService?: NativeAgentSpawnService
  controlService?: AgentControlService
  store?: ViolaStore
  git?: ViolaGit
  gates?: ViolaGates
}

const START_COMMANDS = new Set(['start', 'start plan', 'run', 'run plan', 'approve', 'approved'])
/** The planner may read the repository before answering, so it gets more than a one-shot budget. */
const PLAN_TIMEOUT_MS = 10 * 60_000
const WORKER_TURN_BUDGET_SECONDS = 30 * 60

/** Native conversational harness for the Viola runtime. */
export class ViolaHarness implements ViolaHarnessController {
  private readonly engine: ViolaEngine
  private readonly inflight = new Set<string>()
  private readonly planAborts = new Map<string, AbortController>()
  private readonly announced = new Map<string, Map<string, ViolaTaskState>>()
  private readonly control: AgentControlService
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

    this.engine = new ViolaEngine({
      availableRuntimes: () => this.availableWorkers(),
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
          whenReady: (timeoutMs) => spawn.whenReady(child.sessionId, timeoutMs),
          runTurn: (prompt, signal) => this.runChildTurn(child.sessionId, prompt, signal),
        }
      },
      git: options.git ?? createViolaGit(),
      gates: options.gates ?? createViolaGates(),
      store: options.store ?? new FileViolaStore(options.storageRoot),
      emit: (run) => this.announceProgress(run),
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

  /** Posts one chat line per task state change so a long run is never silent. */
  private announceProgress(run: ViolaRun): void {
    let seen = this.announced.get(run.baseSessionId)
    if (!seen) {
      seen = new Map()
      this.announced.set(run.baseSessionId, seen)
    }
    for (const task of run.tasks) {
      if (seen.get(task.id) === task.state) continue
      seen.set(task.id, task.state)
      const line = describeTaskProgress(task)
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

  private async runChildTurn(sessionId: string, prompt: string, signal: AbortSignal): Promise<ViolaTurn> {
    if (signal.aborted) return { outcome: 'aborted', response: '' }
    const before = this.chat.getMessages(sessionId).length
    const cancel = (): void => {
      this.control.cancelTurn(sessionId)
      this.sessions.interruptSession(sessionId)
    }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const outcome = await this.control.runTurn(sessionId, prompt, { budgetSeconds: WORKER_TURN_BUDGET_SECONDS })
      const response = this.chat.getMessages(sessionId)
        .slice(before)
        .filter((message) => message.role === 'agent')
        .map((message) => message.text)
        .join('\n')
      const fallback = this.sessions.getInternalSession(sessionId)?.outputBuffer ?? ''
      return { outcome, response: response || fallback }
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  }

  private requireSession(sessionId: string) {
    const session = this.sessions.getSession(sessionId)
    if (!session || session.runtimeId !== 'viola') throw new Error(`No Viola session ${sessionId}`)
    return session
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
