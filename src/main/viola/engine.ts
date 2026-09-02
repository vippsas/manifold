import type { ViolaGates } from './gates'
import type { ViolaGit } from './git'
import type { ViolaStore } from './store'
import { runTaskPipeline } from './task-pipeline'
import type { ViolaPlan, ViolaRun, ViolaTaskRun, ViolaWorkerId } from './types'

export interface ViolaTurn {
  outcome: 'ended' | 'timeout' | 'aborted'
  /** The worker's agent messages produced by this turn. */
  response: string
}

export interface ViolaAgent {
  sessionId: string
  runtimeId: ViolaWorkerId
  worktreePath: string
  whenReady(timeoutMs?: number): Promise<boolean>
  runTurn(prompt: string, signal: AbortSignal): Promise<ViolaTurn>
}

export interface ViolaSpawnOptions {
  title: string
  runtimeId: ViolaWorkerId
  newWorktree: boolean
  nonInteractive?: boolean
}

export interface ViolaEngineDeps {
  availableRuntimes(): Promise<ViolaWorkerId[]>
  plan(sessionId: string, goal: string, runtimes: ViolaWorkerId[]): Promise<ViolaPlan>
  spawn(baseSessionId: string, options: ViolaSpawnOptions): Promise<ViolaAgent>
  git: ViolaGit
  gates: ViolaGates
  store: ViolaStore
  emit?: (run: ViolaRun) => void
  now?: () => number
}

export class ViolaEngine {
  private readonly now: () => number
  private readonly runs = new Map<string, ViolaRun>()
  private readonly aborts = new Map<string, AbortController>()

  constructor(private readonly deps: ViolaEngineDeps) {
    this.now = deps.now ?? ((): number => Date.now())
  }

  async getRun(baseSessionId: string): Promise<ViolaRun | null> {
    const live = this.runs.get(baseSessionId)
    if (live) return snapshot(live)
    const saved = await this.deps.store.get(baseSessionId)
    if (!saved) return null
    const stored = normalizeStored(saved)
    if (stored.state === 'running') {
      stored.state = 'stopped'
      stored.error = 'Viola stopped when Manifold previously closed.'
      await this.deps.store.set(snapshot(stored))
    }
    this.runs.set(baseSessionId, stored)
    return snapshot(stored)
  }

  async plan(baseSessionId: string, goal: string): Promise<ViolaRun> {
    const existing = this.runs.get(baseSessionId)
    if (existing?.state === 'running') throw new Error('Viola is already running.')
    const cleanedGoal = goal.trim()
    if (!cleanedGoal) throw new Error('Describe the goal before asking Viola to plan it.')

    const availableRuntimes = await this.deps.availableRuntimes()
    if (availableRuntimes.length < 2) {
      throw new Error('Viola needs at least two installed worker harnesses for independent review.')
    }
    const plan = await this.deps.plan(baseSessionId, cleanedGoal, availableRuntimes)
    const createdAt = this.now()
    const run: ViolaRun = {
      id: `viola-${createdAt}`,
      baseSessionId,
      goal: cleanedGoal,
      summary: plan.summary,
      state: 'planned',
      availableRuntimes,
      tasks: plan.tasks.map((task) => ({ ...task, state: 'planned' })),
      createdAt,
    }
    this.runs.set(baseSessionId, run)
    await this.publish(run)
    return snapshot(run)
  }

  /** Runs every task as its own pipeline (spawn, implement, gate, review, fix), all concurrently. */
  async start(baseSessionId: string): Promise<ViolaRun> {
    const run = await this.getRun(baseSessionId)
    if (!run || run.state !== 'planned') throw new Error('Create and approve a plan before starting Viola.')
    this.runs.set(baseSessionId, run)
    run.state = 'running'
    const abort = new AbortController()
    this.aborts.set(baseSessionId, abort)
    await this.publish(run)

    const context = { deps: this.deps, publish: (current: ViolaRun) => this.publish(current) }
    try {
      await Promise.all(run.tasks.map((task, index) => (
        runTaskPipeline(context, run, task, this.assignWorker(run, task, index), abort.signal)
      )))
      if (abort.signal.aborted) run.state = 'stopped'
      else if (run.tasks.every((task) => task.state === 'done')) run.state = 'complete'
      else run.state = 'needs_attention'
    } catch (error) {
      run.state = abort.signal.aborted ? 'stopped' : 'error'
      run.error = error instanceof Error ? error.message : String(error)
    } finally {
      this.aborts.delete(baseSessionId)
      await this.publish(run)
    }
    return snapshot(run)
  }

  async stop(baseSessionId: string): Promise<void> {
    this.aborts.get(baseSessionId)?.abort()
    const run = this.runs.get(baseSessionId)
    if (run?.state === 'running') {
      run.state = 'stopped'
      await this.publish(run)
    }
  }

  /** The planner's suggestion wins when that harness is installed; otherwise round-robin. */
  private assignWorker(run: ViolaRun, task: ViolaTaskRun, index: number): ViolaWorkerId {
    if (task.worker && run.availableRuntimes.includes(task.worker)) return task.worker
    return run.availableRuntimes[index % run.availableRuntimes.length]
  }

  private async publish(run: ViolaRun): Promise<void> {
    const copy = snapshot(run)
    await this.deps.store.set(copy)
    this.deps.emit?.(copy)
  }
}

/** Runs saved by earlier Viola versions predate per-task `purpose` and `gates`. */
function normalizeStored(run: ViolaRun): ViolaRun {
  return {
    ...run,
    tasks: run.tasks.map((task) => ({ ...task, purpose: task.purpose ?? 'implement', gates: task.gates ?? [] })),
  }
}

function snapshot(run: ViolaRun): ViolaRun {
  return {
    ...run,
    availableRuntimes: [...run.availableRuntimes],
    tasks: run.tasks.map((task) => ({
      ...task,
      acceptance: [...task.acceptance],
      gates: [...task.gates],
      review: task.review ? {
        ...task.review,
        blocking: [...task.review.blocking],
        nonBlocking: [...task.review.nonBlocking],
      } : undefined,
    })),
  }
}
