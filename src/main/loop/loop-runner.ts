import type {
  LoopConfig,
  LoopIteration,
  LoopStatus,
  IterationOutcome,
} from '../../shared/loop-types'
import { parseMetric, isImprovement } from './loop-eval'

export interface LoopSessionAdapter {
  getWorktreePath(sessionId: string): string | null
  sendInput(sessionId: string, text: string): void
  getStatus(sessionId: string): string | null
  setLoopConfig(sessionId: string, config: LoopConfig): void
  getLoopConfig(sessionId: string): LoopConfig | null
  setLoopStatus(sessionId: string, status: LoopStatus): void
  getLoopStatus(sessionId: string): LoopStatus | null
}

export interface LoopGitAdapter {
  getHeadSha(worktreePath: string): Promise<string>
  stageAllAndCommit(worktreePath: string, message: string): Promise<string>
  hardReset(worktreePath: string, sha: string): Promise<void>
  getChangedFilesCount(worktreePath: string): Promise<number>
  getDiff(worktreePath: string, sinceSha: string): Promise<string>
}

export interface JudgeRequest {
  sessionId: string
  rubric: string
  maxScore: number
  evalStdout: string
  diff: string
  hasEvalCommand: boolean
  program: string
}

export interface JudgeResult {
  score?: number
  failure?: string
  rawOutput?: string
}

export interface LoopJudgeAdapter {
  judge(request: JudgeRequest, signal: AbortSignal): Promise<JudgeResult>
}

export interface EvalOutcome {
  stdout: string
  exitCode: number
  timedOut: boolean
}

export interface LoopEvalRunner {
  run(worktreePath: string, command: string, budgetSeconds: number, signal: AbortSignal): Promise<EvalOutcome>
}

export interface LoopEmitter {
  emit(channel: string, payload: unknown): void
}

export interface LoopIterationLog {
  append(worktreePath: string, iter: LoopIteration): Promise<void>
  readAll(worktreePath: string): Promise<LoopIteration[]>
  clear(worktreePath: string): Promise<void>
}

export type WaitForTurnEnd = (sessionId: string, budgetSeconds: number, signal: AbortSignal) => Promise<'ended' | 'timeout' | 'aborted'>

export interface LoopRunnerDeps {
  session: LoopSessionAdapter
  git: LoopGitAdapter
  evalRunner: LoopEvalRunner
  judge: LoopJudgeAdapter
  emitter: LoopEmitter
  iterationLog: LoopIterationLog
  waitForTurnEnd: WaitForTurnEnd
  now?: () => number
}

interface RunState {
  config: LoopConfig
  status: LoopStatus
  abort: AbortController
  startWallMs: number
  baselineSha: string
}

const PROMPT_TEMPLATE = `Task:
{program}

Propose ONE small change aimed at improving the target metric.{targetGlobsLine} Do NOT ask clarifying questions — make reasonable assumptions and act. Do NOT create or edit a program.md file; the task above is your spec. When done, stop your turn. Do not run tests or benchmarks — the harness will measure your change.`

export class LoopRunner {
  private runs = new Map<string, RunState>()
  private readonly deps: LoopRunnerDeps
  private readonly now: () => number

  constructor(deps: LoopRunnerDeps) {
    this.deps = deps
    this.now = deps.now ?? ((): number => Date.now())
  }

  async start(config: LoopConfig): Promise<void> {
    if (this.runs.has(config.sessionId)) {
      throw new Error(`Loop already running for session ${config.sessionId}`)
    }
    const worktreePath = this.deps.session.getWorktreePath(config.sessionId)
    if (!worktreePath) throw new Error(`No worktree for session ${config.sessionId}`)

    this.deps.session.setLoopConfig(config.sessionId, config)
    const baselineSha = await this.deps.git.getHeadSha(worktreePath)
    const status: LoopStatus = {
      sessionId: config.sessionId,
      state: 'running',
      currentIteration: 0,
      bestCommitSha: baselineSha,
      baselineSha,
      startedAt: this.now(),
    }
    const run: RunState = {
      config,
      status,
      abort: new AbortController(),
      startWallMs: this.now(),
      baselineSha,
    }
    this.runs.set(config.sessionId, run)
    this.publish(run)

    try {
      await this.drive(run, worktreePath)
    } catch (err) {
      run.status.state = 'error'
      run.status.errorMessage = (err as Error).message
    }

    if (run.status.state === 'running') run.status.state = 'finished'
    run.status.stoppedAt = this.now()
    this.publish(run)
    this.runs.delete(config.sessionId)
  }

  async stop(sessionId: string): Promise<void> {
    const run = this.runs.get(sessionId)
    if (!run) return
    run.abort.abort()
    run.status.state = 'finished'
    this.publish(run)
  }

  getStatus(sessionId: string): LoopStatus | null {
    const run = this.runs.get(sessionId)
    if (run) return run.status
    return this.deps.session.getLoopStatus(sessionId)
  }

  async getIterations(sessionId: string): Promise<LoopIteration[]> {
    const worktreePath = this.deps.session.getWorktreePath(sessionId)
    if (!worktreePath) return []
    return this.deps.iterationLog.readAll(worktreePath)
  }

  async restoreToCommit(worktreePath: string, sha: string): Promise<void> {
    await this.deps.git.hardReset(worktreePath, sha)
  }

  async clearIterations(sessionId: string): Promise<void> {
    if (this.runs.has(sessionId)) {
      throw new Error('Cannot clear iterations while loop is running — stop it first')
    }
    const worktreePath = this.deps.session.getWorktreePath(sessionId)
    if (!worktreePath) throw new Error(`No worktree for session ${sessionId}`)
    await this.deps.iterationLog.clear(worktreePath)
    const cleared: LoopStatus = {
      sessionId,
      state: 'idle',
      currentIteration: 0,
    }
    this.deps.session.setLoopStatus(sessionId, cleared)
    this.deps.emitter.emit('loop:status-changed', cleared)
  }

  private async drive(run: RunState, worktreePath: string): Promise<void> {
    const { config, status, abort } = run
    const maxIter = config.maxIterations ?? 40
    const maxWallMs = (config.maxWallClockMinutes ?? 24 * 60) * 60 * 1000

    while (status.state === 'running' && status.currentIteration < maxIter) {
      if (abort.signal.aborted) return
      if (this.now() - run.startWallMs > maxWallMs) return

      status.currentIteration += 1
      const iter = await this.runOneIteration(run, worktreePath)
      await this.deps.iterationLog.append(worktreePath, iter)
      this.deps.emitter.emit('loop:iteration', iter)
      this.publish(run)
    }
  }

  private async runOneIteration(run: RunState, worktreePath: string): Promise<LoopIteration> {
    const { config, status, abort } = run
    const index = status.currentIteration
    const startedAt = this.now()
    const base: LoopIteration = { index, startedAt, outcome: 'failed' }

    const baseForIter = await this.deps.git.getHeadSha(worktreePath)

    if (config.clearContextEachIteration && index > 1) {
      this.deps.session.sendInput(config.sessionId, '/clear')
      await new Promise((r) => setTimeout(r, 200))
      this.deps.session.sendInput(config.sessionId, '\r')
      await new Promise((r) => setTimeout(r, 800))
    }

    this.deps.session.sendInput(config.sessionId, renderPrompt(PROMPT_TEMPLATE, config))
    await new Promise((r) => setTimeout(r, 400))
    this.deps.session.sendInput(config.sessionId, '\r')

    const turn = await this.deps.waitForTurnEnd(config.sessionId, config.budgetSeconds, abort.signal)

    if (turn === 'aborted') {
      return { ...base, outcome: 'aborted', finishedAt: this.now(), errorMessage: 'stopped by user' }
    }
    if (turn === 'timeout') {
      await this.safeReset(worktreePath, baseForIter)
      return { ...base, outcome: 'aborted', finishedAt: this.now(), errorMessage: 'agent turn exceeded budget' }
    }

    const changed = await this.deps.git.getChangedFilesCount(worktreePath)
    if (changed === 0) {
      return { ...base, outcome: 'failed', finishedAt: this.now(), errorMessage: 'no changes' }
    }

    const skipEval = config.metric.kind === 'llm-judge' && !config.evalCommand.trim()
    let evalResult: EvalOutcome
    if (skipEval) {
      evalResult = { stdout: '', exitCode: 0, timedOut: false }
    } else {
      try {
        evalResult = await this.deps.evalRunner.run(worktreePath, config.evalCommand, config.budgetSeconds, abort.signal)
      } catch (err) {
        await this.safeReset(worktreePath, baseForIter)
        return { ...base, outcome: 'failed', finishedAt: this.now(), errorMessage: `eval crashed: ${(err as Error).message}` }
      }

      if (evalResult.timedOut) {
        await this.safeReset(worktreePath, baseForIter)
        return { ...base, outcome: 'failed', finishedAt: this.now(), errorMessage: 'eval timed out', evalStdoutTail: tail(evalResult.stdout) }
      }
    }

    let score: number | undefined
    let failure: string | undefined
    let judgeOutputTail: string | undefined
    if (config.metric.kind === 'llm-judge') {
      const diff = await this.safeDiff(worktreePath, run.baselineSha)
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
      await this.safeReset(worktreePath, baseForIter)
      return { ...base, outcome: 'failed', finishedAt: this.now(), errorMessage: failure ?? 'no score', evalStdoutTail: tail(evalResult.stdout), judgeOutputTail }
    }

    const metricDirection = 'direction' in config.metric ? config.metric.direction : 'minimize'
    const improved = isImprovement(score, status.bestScore, metricDirection)

    let outcome: IterationOutcome
    let commitSha: string | undefined
    if (improved) {
      commitSha = await this.deps.git.stageAllAndCommit(worktreePath, `loop: iteration ${index} (score=${score})`)
      status.bestScore = score
      status.bestCommitSha = commitSha
      outcome = 'improved'
    } else if (config.alwaysAdvance) {
      commitSha = await this.deps.git.stageAllAndCommit(worktreePath, `loop: iteration ${index} (score=${score}, rolled forward)`)
      outcome = 'regressed'
    } else {
      await this.safeReset(worktreePath, baseForIter)
      outcome = 'regressed'
    }

    return {
      ...base,
      outcome,
      score,
      commitSha,
      finishedAt: this.now(),
      evalStdoutTail: tail(evalResult.stdout),
      judgeOutputTail,
    }
  }

  private async safeReset(worktreePath: string, sha: string): Promise<void> {
    try { await this.deps.git.hardReset(worktreePath, sha) } catch { /* best-effort */ }
  }

  private async safeDiff(worktreePath: string, sha: string): Promise<string> {
    try { return await this.deps.git.getDiff(worktreePath, sha) } catch { return '' }
  }

  private publish(run: RunState): void {
    this.deps.session.setLoopStatus(run.config.sessionId, { ...run.status })
    this.deps.emitter.emit('loop:status-changed', { ...run.status })
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
