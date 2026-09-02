import { buildFixPrompt, buildImplementationPrompt } from './planner'
import type { ViolaGit } from './git'
import type { ViolaStore } from './store'
import type {
  ViolaPlan,
  ViolaReview,
  ViolaRun,
  ViolaTaskPlan,
  ViolaTaskRun,
  ViolaWorkerId,
} from './types'

export interface ViolaAgent {
  sessionId: string
  runtimeId: ViolaWorkerId
  worktreePath: string
  whenReady(timeoutMs?: number): Promise<boolean>
  runTurn(prompt: string, signal: AbortSignal): Promise<'ended' | 'timeout' | 'aborted'>
}

interface SpawnOptions {
  title: string
  runtimeId: ViolaWorkerId
  newWorktree: boolean
  nonInteractive?: boolean
}

export interface ViolaEngineDeps {
  availableRuntimes(): Promise<ViolaWorkerId[]>
  plan(sessionId: string, goal: string, runtimes: ViolaWorkerId[]): Promise<ViolaPlan>
  review(agent: ViolaAgent, task: ViolaTaskPlan, diff: string, signal: AbortSignal): Promise<ViolaReview>
  spawn(baseSessionId: string, options: SpawnOptions): Promise<ViolaAgent>
  git: ViolaGit
  store: ViolaStore
  emit?: (run: ViolaRun) => void
  now?: () => number
}

interface SpawnedTask {
  task: ViolaTaskRun
  agent: ViolaAgent
  baseSha: string
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
    const stored = await this.deps.store.get(baseSessionId)
    if (!stored) return null
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

  async start(baseSessionId: string): Promise<ViolaRun> {
    const run = await this.getRun(baseSessionId)
    if (!run || run.state !== 'planned') throw new Error('Create and approve a plan before starting Viola.')
    this.runs.set(baseSessionId, run)
    run.state = 'running'
    const abort = new AbortController()
    this.aborts.set(baseSessionId, abort)
    await this.publish(run)

    try {
      const spawnResults = await Promise.all(run.tasks.map((task, index) => (
        this.spawnImplementation(run, task, run.availableRuntimes[index % run.availableRuntimes.length])
      )))
      const spawned = spawnResults.filter((item): item is SpawnedTask => item !== null)

      await Promise.all(spawned.map((item) => this.implement(item, run, abort.signal)))
      if (!abort.signal.aborted) {
        const reviewers = await this.spawnReviewers(run, spawned)
        await Promise.all(spawned.map((item) => this.review(item, run, reviewers, abort.signal)))
      }

      if (abort.signal.aborted) run.state = 'stopped'
      else if (run.tasks.every((task) => task.state === 'done')) run.state = 'complete'
      else run.state = 'needs_attention'
    } catch (error) {
      run.state = abort.signal.aborted ? 'stopped' : 'error'
      run.error = errorMessage(error)
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

  private async spawnImplementation(run: ViolaRun, task: ViolaTaskRun, runtimeId: ViolaWorkerId): Promise<SpawnedTask | null> {
    task.state = 'spawning'
    task.runtimeId = runtimeId
    await this.publish(run)
    try {
      const agent = await this.deps.spawn(run.baseSessionId, {
        title: task.title,
        runtimeId,
        newWorktree: true,
      })
      task.sessionId = agent.sessionId
      task.worktreePath = agent.worktreePath
      const baseSha = await this.deps.git.head(agent.worktreePath)
      return { task, agent, baseSha }
    } catch (error) {
      task.state = 'error'
      task.error = errorMessage(error)
      await this.publish(run)
      return null
    }
  }

  private async implement(item: SpawnedTask, run: ViolaRun, signal: AbortSignal): Promise<void> {
    const { task, agent } = item
    if (signal.aborted) {
      task.state = 'needs_attention'
      await this.publish(run)
      return
    }
    task.state = 'implementing'
    await this.publish(run)
    try {
      await agent.whenReady(30_000)
      const outcome = await agent.runTurn(buildImplementationPrompt(task), signal)
      if (outcome !== 'ended') throw new Error(`Implementation ${outcome}.`)
    } catch (error) {
      task.state = signal.aborted ? 'needs_attention' : 'error'
      task.error = errorMessage(error)
      await this.publish(run)
    }
  }

  private async spawnReviewers(run: ViolaRun, items: SpawnedTask[]): Promise<Map<string, ViolaAgent>> {
    const reviewers = new Map<string, ViolaAgent>()
    await Promise.all(items.map(async ({ task }) => {
      if (task.state !== 'implementing') return
      const runtimeId = run.availableRuntimes.find((runtime) => runtime !== task.runtimeId)
      if (!runtimeId) return
      try {
        const agent = await this.deps.spawn(run.baseSessionId, {
          title: `review-${task.id}`,
          runtimeId,
          newWorktree: true,
          nonInteractive: true,
        })
        reviewers.set(task.id, agent)
      } catch {
        // The affected task reports the missing reviewer below.
      }
    }))
    return reviewers
  }

  private async review(
    item: SpawnedTask,
    run: ViolaRun,
    reviewers: Map<string, ViolaAgent>,
    signal: AbortSignal,
  ): Promise<void> {
    const { task, agent } = item
    if (task.state !== 'implementing' || signal.aborted) return
    const reviewRuntimeId = run.availableRuntimes.find((runtime) => runtime !== task.runtimeId)
    const reviewer = reviewers.get(task.id)
    if (!reviewRuntimeId || !reviewer) {
      task.state = 'needs_attention'
      task.error = 'No independent worker harness was available to review this task.'
      await this.publish(run)
      return
    }
    task.reviewRuntimeId = reviewRuntimeId

    try {
      let verdict = await this.runReview(task, item, reviewer, run, signal)
      if (!verdict.passed && verdict.blocking.length > 0 && !signal.aborted) {
        task.state = 'fixing'
        await this.publish(run)
        const outcome = await agent.runTurn(buildFixPrompt(task, verdict.blocking), signal)
        if (outcome !== 'ended') throw new Error(`Fix turn ${outcome}.`)
        verdict = await this.runReview(task, item, reviewer, run, signal)
      }

      task.review = verdict
      if (verdict.passed) {
        task.state = 'done'
        task.prUrl = await this.deps.git.pullRequestUrl(agent.worktreePath)
      } else {
        task.state = 'needs_attention'
        task.error = verdict.blocking.length > 0
          ? `Review still has ${verdict.blocking.length} blocking finding${verdict.blocking.length === 1 ? '' : 's'}.`
          : 'Review did not pass.'
      }
    } catch (error) {
      task.state = signal.aborted ? 'needs_attention' : 'error'
      task.error = errorMessage(error)
    }
    await this.publish(run)
  }

  private async runReview(
    task: ViolaTaskRun,
    item: SpawnedTask,
    reviewer: ViolaAgent,
    run: ViolaRun,
    signal: AbortSignal,
  ): Promise<ViolaReview> {
    task.state = 'reviewing'
    await this.publish(run)
    const diff = await this.deps.git.diff(item.agent.worktreePath, item.baseSha)
    if (!diff.trim()) throw new Error('The worker produced no diff to review.')
    const verdict = await this.deps.review(reviewer, task, diff, signal)
    task.review = verdict
    await this.publish(run)
    return verdict
  }

  private async publish(run: ViolaRun): Promise<void> {
    const copy = snapshot(run)
    await this.deps.store.set(copy)
    this.deps.emit?.(copy)
  }
}

function snapshot(run: ViolaRun): ViolaRun {
  return {
    ...run,
    availableRuntimes: [...run.availableRuntimes],
    tasks: run.tasks.map((task) => ({
      ...task,
      acceptance: [...task.acceptance],
      review: task.review ? {
        ...task.review,
        blocking: [...task.review.blocking],
        nonBlocking: [...task.review.nonBlocking],
      } : undefined,
    })),
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
