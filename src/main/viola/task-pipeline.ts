import type { ViolaAgent, ViolaEngineDeps } from './engine'
import { parseReviewResponse } from './planner'
import {
  buildExplorePrompt,
  buildFixPrompt,
  buildGateFixPrompt,
  buildImplementationPrompt,
  buildReviewPrompt,
} from './prompts'
import type { ViolaReview, ViolaRun, ViolaTaskRun, ViolaTaskState, ViolaWorkerId } from '../../shared/viola'

export interface PipelineContext {
  deps: Pick<ViolaEngineDeps, 'spawn' | 'git' | 'gates' | 'verdicts'>
  /** Viola's own checkout, used to detect a worker that was not given its own worktree. */
  basePath: string
  now(): number
  publish(run: ViolaRun): Promise<void>
}

const READY_TIMEOUT_MS = 30_000

/** Drives one task from spawn to a terminal state. Never throws: failures land on the task. */
export async function runTaskPipeline(
  ctx: PipelineContext,
  run: ViolaRun,
  task: ViolaTaskRun,
  runtimeId: ViolaWorkerId,
  signal: AbortSignal,
): Promise<void> {
  try {
    if (task.purpose === 'explore') await explore(ctx, run, task, runtimeId, signal)
    else await implement(ctx, run, task, runtimeId, signal)
  } catch (error) {
    mark(ctx, task, signal.aborted ? 'needs_attention' : 'error')
    task.error = error instanceof Error ? error.message : String(error)
  }
  await ctx.publish(run)
}

async function explore(
  ctx: PipelineContext,
  run: ViolaRun,
  task: ViolaTaskRun,
  runtimeId: ViolaWorkerId,
  signal: AbortSignal,
): Promise<void> {
  task.runtimeId = runtimeId
  await setState(ctx, run, task, 'spawning')
  // Read-only work shares Viola's own checkout instead of paying for a worktree.
  const agent = await spawnWorker(ctx, run, task, task.title, runtimeId, false)
  await setState(ctx, run, task, 'exploring')
  task.report = await turn(agent, buildExplorePrompt(task), signal, 'Exploration')
  mark(ctx, task, 'done')
}

async function implement(
  ctx: PipelineContext,
  run: ViolaRun,
  task: ViolaTaskRun,
  runtimeId: ViolaWorkerId,
  signal: AbortSignal,
): Promise<void> {
  task.runtimeId = runtimeId
  await setState(ctx, run, task, 'spawning')
  const agent = await spawnWorker(ctx, run, task, task.title, runtimeId, true)
  const baseSha = await ctx.deps.git.head(agent.worktreePath)
  await setState(ctx, run, task, 'implementing')
  task.report = await turn(agent, buildImplementationPrompt(task), signal, 'Implementation')

  if (!(await passGates(ctx, run, task, agent, signal))) return

  const reviewRuntimeId = run.availableRuntimes.find((runtime) => runtime !== runtimeId)
  if (!reviewRuntimeId) {
    mark(ctx, task, 'needs_attention')
    task.error = 'No independent worker harness was available to review this task.'
    return
  }
  task.reviewRuntimeId = reviewRuntimeId
  const reviewer = await spawnWorker(ctx, run, task, `review-${task.id}`, reviewRuntimeId, true)

  let verdict = await review(ctx, run, task, agent, reviewer, baseSha, signal)
  if (!verdict.passed && verdict.blocking.length > 0 && !signal.aborted) {
    await setState(ctx, run, task, 'fixing')
    task.report = await turn(agent, buildFixPrompt(task, verdict.blocking), signal, 'Fix turn')
    verdict = await review(ctx, run, task, agent, reviewer, baseSha, signal)
  }

  task.review = verdict
  if (verdict.passed) {
    mark(ctx, task, 'done')
    task.prUrl = await ctx.deps.git.pullRequestUrl(agent.worktreePath)
    return
  }
  mark(ctx, task, 'needs_attention')
  task.error = verdict.blocking.length > 0
    ? `Review still has ${verdict.blocking.length} blocking finding${verdict.blocking.length === 1 ? '' : 's'}.`
    : 'Review did not pass.'
}

/** Runs the plan's gate commands in the worker's worktree. One red gate earns one fix turn. */
async function passGates(
  ctx: PipelineContext,
  run: ViolaRun,
  task: ViolaTaskRun,
  agent: ViolaAgent,
  signal: AbortSignal,
): Promise<boolean> {
  if (task.gates.length === 0) return true
  await setState(ctx, run, task, 'gating')
  let fixSpent = false
  for (const command of task.gates) {
    let result = await ctx.deps.gates.run(agent.worktreePath, command, signal)
    if (!result.ok && !fixSpent && !signal.aborted) {
      fixSpent = true
      await setState(ctx, run, task, 'fixing')
      task.report = await turn(agent, buildGateFixPrompt(task, command, result.output), signal, 'Gate fix turn')
      await setState(ctx, run, task, 'gating')
      result = await ctx.deps.gates.run(agent.worktreePath, command, signal)
    }
    if (!result.ok) {
      mark(ctx, task, 'needs_attention')
      task.error = `Gate still failing: ${command}`
      return false
    }
  }
  return true
}

async function review(
  ctx: PipelineContext,
  run: ViolaRun,
  task: ViolaTaskRun,
  agent: ViolaAgent,
  reviewer: ViolaAgent,
  baseSha: string,
  signal: AbortSignal,
): Promise<ViolaReview> {
  await setState(ctx, run, task, 'reviewing')
  const diff = await ctx.deps.git.diff(agent.worktreePath, baseSha)
  if (!diff.trim()) throw new Error('The worker produced no diff to review.')
  const stat = await ctx.deps.git.diffStat(agent.worktreePath, baseSha)
  await ctx.deps.git.apply(reviewer.worktreePath, diff)

  // Clear first: a re-review that read the previous verdict would pass on stale findings.
  await ctx.deps.verdicts.clear(reviewer.worktreePath, task.id)
  const verdictPath = ctx.deps.verdicts.path(reviewer.worktreePath, task.id)
  const response = await turn(
    reviewer,
    buildReviewPrompt(task, { diff, stat, report: task.report ?? '', verdictPath }),
    signal,
    'Review',
  )
  // The file is exact; the reply is a fallback for a reviewer that answered inline.
  const written = await ctx.deps.verdicts.read(reviewer.worktreePath, task.id)
  const parsed = parseReviewResponse(written ?? response)
  if ('error' in parsed) throw new Error(parsed.error)
  task.review = parsed
  await ctx.publish(run)
  return parsed
}

async function spawnWorker(
  ctx: PipelineContext,
  run: ViolaRun,
  task: ViolaTaskRun,
  title: string,
  runtimeId: ViolaWorkerId,
  newWorktree: boolean,
): Promise<ViolaAgent> {
  // Workers run as real terminals so the human can watch one or take it over. Only Viola itself
  // is a chat session.
  const agent = await ctx.deps.spawn(run.baseSessionId, { title, runtimeId, newWorktree, nonInteractive: false })
  // A project added as a plain folder always works in place, so it hands back Viola's own
  // checkout however loudly we ask for a worktree. Every implement guarantee depends on the
  // isolation, and reviewing there would reset a real working copy, so stop before any work.
  if (newWorktree && agent.worktreePath === ctx.basePath) {
    throw new Error(
      `Manifold gave "${title}" no isolated worktree: it shares Viola's own checkout (${agent.worktreePath}). `
      + 'A repository added as a plain folder always works in place. Re-add it as a git project so Viola '
      + 'can isolate each task and review it independently.',
    )
  }
  if (title === task.title) {
    task.sessionId = agent.sessionId
    task.worktreePath = agent.worktreePath
  }
  if (!(await agent.whenReady(READY_TIMEOUT_MS))) {
    throw new Error(`Worker "${title}" (${runtimeId}) did not become ready in time.`)
  }
  return agent
}

async function turn(agent: ViolaAgent, prompt: string, signal: AbortSignal, label: string): Promise<string> {
  const result = await agent.runTurn(prompt, signal)
  if (result.outcome !== 'ended') throw new Error(`${label} ${result.outcome}.`)
  return result.response
}

async function setState(ctx: PipelineContext, run: ViolaRun, task: ViolaTaskRun, state: ViolaTaskState): Promise<void> {
  mark(ctx, task, state)
  await ctx.publish(run)
}

/** Every transition goes through here so `stateSince` can never drift from `state`. */
function mark(ctx: PipelineContext, task: ViolaTaskRun, state: ViolaTaskState): void {
  task.state = state
  task.stateSince = ctx.now()
}
