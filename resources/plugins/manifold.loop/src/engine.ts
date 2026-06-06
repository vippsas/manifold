// resources/plugins/manifold.loop/src/engine.ts
// The autoresearch loop engine: sendInput+waitForTurnEnd collapse into runTurn; config/status
// persist via the injected store; the active session is pinned at start and re-checked each
// iteration. No `manifold` import (all deps injected, so it's unit-testable).
import { parseLoopConfig, DEFAULT_MAX_ITERATIONS, type LoopConfig, type LoopIteration, type LoopStatus, type IterationOutcome } from './types'
import { parseMetric, isImprovement } from './eval'
import type { LoopGitAdapter } from './git'
import type { LoopEvalRunner, EvalOutcome } from './eval-runner'
import type { Judge } from './judge'
import type { LoopStore } from './store'

export type TurnOutcome = 'ended' | 'timeout' | 'aborted'
export type RunTurn = (prompt: string, opts: { budgetSeconds: number; clearContext: boolean }, signal: AbortSignal) => Promise<TurnOutcome>

export interface LoopIterationLogPort {
  append(worktreePath: string, iter: LoopIteration): Promise<void>
  readAll(worktreePath: string): Promise<LoopIteration[]>
  clear(worktreePath: string): Promise<void>
}

export interface LoopEngineDeps {
  git: LoopGitAdapter
  evalRunner: LoopEvalRunner
  judge: Judge
  iterationLog: LoopIterationLogPort
  runTurn: RunTurn
  activeSessionId: () => string | undefined
  worktreePath: () => string | undefined
  store: LoopStore
  emit?: (event: 'status' | 'iteration', payload: unknown) => void
  now?: () => number
}

interface RunState {
  config: LoopConfig
  status: LoopStatus
  abort: AbortController
  startWallMs: number
  baselineSha: string
  targetSessionId: string
  worktreePath: string
}

const PROMPT_TEMPLATE = `Task:
{program}

Propose ONE small change aimed at improving the target metric.{targetGlobsLine} Do NOT ask clarifying questions — make reasonable assumptions and act. Do NOT create or edit a program.md file; the task above is your spec. When done, stop your turn. Do not run tests or benchmarks — the harness will measure your change.`

export class LoopEngine {
  private runs = new Map<string, RunState>()
  private readonly deps: LoopEngineDeps
  private readonly now: () => number
  private emit?: (event: 'status' | 'iteration', payload: unknown) => void

  constructor(deps: LoopEngineDeps) {
    this.deps = deps
    this.now = deps.now ?? ((): number => Date.now())
    this.emit = deps.emit
  }

  /** Override the event sink after construction (used to bridge to the webview). */
  setEmit(fn: (event: 'status' | 'iteration', payload: unknown) => void): void {
    this.emit = fn
  }

  /** Run the loop to completion. The plugin command invokes this fire-and-forget. */
  async start(config: LoopConfig): Promise<void> {
    const parsed = parseLoopConfig(config)
    if ('error' in parsed) throw new Error(parsed.error)
    if (this.runs.has(config.sessionId)) {
      throw new Error(`Loop already running for session ${config.sessionId}`)
    }
    const worktreePath = this.deps.worktreePath()
    if (!worktreePath) throw new Error('no active worktree')
    const targetSessionId = this.deps.activeSessionId()
    if (!targetSessionId) throw new Error('no active agent session')

    await this.deps.store.setConfig(config.sessionId, config)
    const baselineSha = await this.deps.git.getHeadSha(worktreePath)
    // Continue numbering from the persistent log: the log survives a stop, so starting
    // again from 0 would re-emit indices that already exist and duplicate history rows.
    const priorIterations = await this.deps.iterationLog.readAll(worktreePath)
    const resumeIndex = priorIterations.reduce((max, it) => (it.index > max ? it.index : max), 0)
    const status: LoopStatus = {
      sessionId: config.sessionId,
      state: 'running',
      currentIteration: resumeIndex,
      bestCommitSha: baselineSha,
      baselineSha,
      startedAt: this.now(),
    }
    const run: RunState = { config, status, abort: new AbortController(), startWallMs: this.now(), baselineSha, targetSessionId, worktreePath }
    this.runs.set(config.sessionId, run)
    await this.publish(run)

    try {
      await this.drive(run)
    } catch (err) {
      run.status.state = 'error'
      run.status.errorMessage = (err as Error).message
    }

    if (run.status.state === 'running') run.status.state = 'finished'
    run.status.stoppedAt = this.now()
    await this.publish(run)
    this.runs.delete(config.sessionId)
  }

  async stop(sessionId: string): Promise<void> {
    const run = this.runs.get(sessionId)
    if (!run) return
    run.abort.abort()
    run.status.state = 'finished'
    await this.publish(run)
  }

  /** In-memory status for an active run (sync). */
  getStatusSync(sessionId: string): LoopStatus | null {
    return this.runs.get(sessionId)?.status ?? null
  }

  /** Active status, else the persisted one. */
  async getStatus(sessionId: string): Promise<LoopStatus | null> {
    return this.getStatusSync(sessionId) ?? (await this.deps.store.getStatus(sessionId))
  }

  async getConfig(sessionId: string): Promise<LoopConfig | null> {
    return this.deps.store.getConfig(sessionId)
  }

  async setConfig(sessionId: string, config: LoopConfig): Promise<LoopConfig> {
    const parsed = parseLoopConfig(config)
    if ('error' in parsed) throw new Error(parsed.error)
    await this.deps.store.setConfig(sessionId, config)
    return config
  }

  async getIterations(): Promise<LoopIteration[]> {
    const worktreePath = this.deps.worktreePath()
    if (!worktreePath) return []
    return this.deps.iterationLog.readAll(worktreePath)
  }

  async clear(sessionId: string): Promise<LoopStatus> {
    if (this.runs.has(sessionId)) throw new Error('Cannot clear iterations while loop is running — stop it first')
    const worktreePath = this.deps.worktreePath()
    if (!worktreePath) throw new Error('no active worktree')
    await this.deps.iterationLog.clear(worktreePath)
    const cleared: LoopStatus = { sessionId, state: 'idle', currentIteration: 0 }
    await this.deps.store.setStatus(sessionId, cleared)
    this.emit?.('status', cleared)
    return cleared
  }

  async restoreBest(sessionId: string): Promise<{ sha: string }> {
    const status = await this.getStatus(sessionId)
    if (!status?.bestCommitSha) throw new Error('No best commit recorded yet')
    if (status.bestCommitSha === status.baselineSha) throw new Error('No improvement to restore — best is still the baseline')
    const worktreePath = this.deps.worktreePath()
    if (!worktreePath) throw new Error('no active worktree')
    await this.deps.git.hardReset(worktreePath, status.bestCommitSha)
    return { sha: status.bestCommitSha }
  }

  private async drive(run: RunState): Promise<void> {
    const { config, status, abort } = run
    const maxIter = config.maxIterations ?? DEFAULT_MAX_ITERATIONS
    const maxWallMs = (config.maxWallClockMinutes ?? 24 * 60) * 60 * 1000

    // `maxIterations` is per-run; `currentIteration` is the absolute, log-wide index
    // (seeded from prior runs in start()). Track them separately so resuming numbering
    // doesn't shrink how many iterations this run is allowed.
    let ranThisRun = 0
    while (status.state === 'running' && ranThisRun < maxIter) {
      if (abort.signal.aborted) return
      if (this.now() - run.startWallMs > maxWallMs) return
      if (this.deps.activeSessionId() !== run.targetSessionId) {
        status.state = 'error'
        status.errorMessage = 'active session changed'
        return
      }

      ranThisRun += 1
      status.currentIteration += 1
      const iter = await this.runOneIteration(run)
      await this.deps.iterationLog.append(run.worktreePath, iter)
      this.emit?.('iteration', iter)
      await this.publish(run)
    }
  }

  private async runOneIteration(run: RunState): Promise<LoopIteration> {
    const { config, status, abort } = run
    const wt = run.worktreePath
    const index = status.currentIteration
    const startedAt = this.now()
    const base: LoopIteration = { index, startedAt, outcome: 'failed' }

    const baseForIter = await this.deps.git.getHeadSha(wt)

    const clearContext = !!config.clearContextEachIteration && index > 1
    const turn = await this.deps.runTurn(renderPrompt(PROMPT_TEMPLATE, config), { budgetSeconds: config.budgetSeconds, clearContext }, abort.signal)

    if (turn === 'aborted') {
      return { ...base, outcome: 'aborted', finishedAt: this.now(), errorMessage: 'stopped by user' }
    }
    if (turn === 'timeout') {
      await this.safeReset(wt, baseForIter)
      return { ...base, outcome: 'aborted', finishedAt: this.now(), errorMessage: 'agent turn exceeded budget' }
    }

    const changed = await this.deps.git.getChangedFilesCount(wt)
    if (changed === 0) {
      return { ...base, outcome: 'failed', finishedAt: this.now(), errorMessage: 'no changes' }
    }

    const skipEval = config.metric.kind === 'llm-judge' && !config.evalCommand.trim()
    let evalResult: EvalOutcome
    if (skipEval) {
      evalResult = { stdout: '', exitCode: 0, timedOut: false }
    } else {
      try {
        evalResult = await this.deps.evalRunner.run(wt, config.evalCommand, config.budgetSeconds, abort.signal)
      } catch (err) {
        await this.safeReset(wt, baseForIter)
        return { ...base, outcome: 'failed', finishedAt: this.now(), errorMessage: `eval crashed: ${(err as Error).message}` }
      }
      if (evalResult.timedOut) {
        await this.safeReset(wt, baseForIter)
        return { ...base, outcome: 'failed', finishedAt: this.now(), errorMessage: 'eval timed out', evalStdoutTail: tail(evalResult.stdout) }
      }
    }

    let score: number | undefined
    let failure: string | undefined
    let judgeOutputTail: string | undefined
    if (config.metric.kind === 'llm-judge') {
      const diff = await this.safeDiff(wt, run.baselineSha)
      const result = await this.deps.judge.judge({
        sessionId: config.sessionId,
        rubric: config.metric.rubric,
        maxScore: config.metric.maxScore,
        evalStdout: evalResult.stdout,
        diff,
        hasEvalCommand: !skipEval,
        program: config.program,
      }, abort.signal)
      score = result.score
      failure = result.failure
      if (result.rawOutput) judgeOutputTail = tail(result.rawOutput)
    } else {
      const parsed = parseMetric(evalResult.stdout, evalResult.exitCode, config.metric)
      if ('failure' in parsed) failure = parsed.failure
      else score = parsed.score
    }
    if (failure !== undefined || score === undefined) {
      await this.safeReset(wt, baseForIter)
      return { ...base, outcome: 'failed', finishedAt: this.now(), errorMessage: failure ?? 'no score', evalStdoutTail: tail(evalResult.stdout), judgeOutputTail }
    }

    const metricDirection = 'direction' in config.metric ? config.metric.direction : 'minimize'
    const improved = isImprovement(score, status.bestScore, metricDirection)

    let outcome: IterationOutcome
    let commitSha: string | undefined
    if (improved) {
      commitSha = await this.deps.git.stageAllAndCommit(wt, `loop: iteration ${index} (score=${score})`)
      status.bestScore = score
      status.bestCommitSha = commitSha
      outcome = 'improved'
    } else if (config.alwaysAdvance) {
      commitSha = await this.deps.git.stageAllAndCommit(wt, `loop: iteration ${index} (score=${score}, rolled forward)`)
      outcome = 'regressed'
    } else {
      await this.safeReset(wt, baseForIter)
      outcome = 'regressed'
    }

    return { ...base, outcome, score, commitSha, finishedAt: this.now(), evalStdoutTail: tail(evalResult.stdout), judgeOutputTail }
  }

  private async safeReset(worktreePath: string, sha: string): Promise<void> {
    // A failed reset is consequential: the next iteration would run on top of un-reverted,
    // rejected changes and poison the experiment. Best-effort, but log so it's diagnosable.
    try { await this.deps.git.hardReset(worktreePath, sha) }
    catch (err) { console.error('[loop-plugin] failed to reset worktree after a rejected iteration:', (err as Error).message) }
  }

  private async safeDiff(worktreePath: string, sha: string): Promise<string> {
    try { return await this.deps.git.getDiff(worktreePath, sha) } catch { return '' }
  }

  private async publish(run: RunState): Promise<void> {
    await this.deps.store.setStatus(run.config.sessionId, { ...run.status })
    this.emit?.('status', { ...run.status })
  }
}

function renderPrompt(template: string, config: LoopConfig): string {
  const globs = config.targetGlobs.filter((g) => g.trim().length > 0)
  const targetGlobsLine = globs.length > 0 ? ` Edit only files matching: ${globs.join(', ')}.` : ''
  return template
    .replace('{program}', config.program.trim() || '(no task specified)')
    .replace('{targetGlobsLine}', targetGlobsLine)
}

function tail(text: string, max = 2048): string {
  if (text.length <= max) return text
  return text.slice(text.length - max)
}
