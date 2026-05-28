import { LoopRunner } from './loop-runner'
import type {
  LoopRunnerDeps,
  LoopSessionAdapter,
  LoopGitAdapter,
  LoopEvalRunner,
  LoopJudgeAdapter,
  LoopEmitter,
  LoopIterationLog as LoopIterationLogPort,
  WaitForTurnEnd,
} from './loop-runner'
import type { LoopConfig, LoopIteration, LoopStatus } from '../../shared/loop-types'

export const SESSION_ID = 'sess-1'
export const WORKTREE = '/tmp/wt'

export function makeFakeSession(): LoopSessionAdapter & { loopConfigs: Map<string, LoopConfig>; loopStatuses: Map<string, LoopStatus>; inputs: string[]; statusQueue: string[] } {
  const loopConfigs = new Map<string, LoopConfig>()
  const loopStatuses = new Map<string, LoopStatus>()
  const inputs: string[] = []
  const statusQueue: string[] = []
  return {
    loopConfigs,
    loopStatuses,
    inputs,
    statusQueue,
    getWorktreePath: () => WORKTREE,
    sendInput: (_id, text) => { inputs.push(text) },
    getStatus: () => statusQueue.shift() ?? 'done',
    setLoopConfig: (id, cfg) => { loopConfigs.set(id, cfg) },
    setLoopStatus: (id, st) => { loopStatuses.set(id, st) },
    getLoopConfig: (id) => loopConfigs.get(id) ?? null,
    getLoopStatus: (id) => loopStatuses.get(id) ?? null,
  }
}

export function makeFakeGit(): LoopGitAdapter & { commits: Array<{ msg: string; sha: string }>; resets: string[]; headShas: string[]; changedFiles: number[] } {
  const commits: Array<{ msg: string; sha: string }> = []
  const resets: string[] = []
  const headShas: string[] = ['sha-baseline']
  const changedFiles: number[] = []
  let nextSha = 1
  return {
    commits,
    resets,
    headShas,
    changedFiles,
    getHeadSha: async () => headShas[headShas.length - 1],
    stageAllAndCommit: async (_wt, msg) => {
      const sha = `sha-commit-${nextSha++}`
      commits.push({ msg, sha })
      headShas.push(sha)
      return sha
    },
    hardReset: async (_wt, sha) => {
      resets.push(sha)
      headShas.push(sha)
    },
    getChangedFilesCount: async () => changedFiles.shift() ?? 0,
    getDiff: async () => '',
  }
}

export function makeFakeJudge(results: Array<{ score: number } | { failure: string }> = []): LoopJudgeAdapter & { calls: Array<{ rubric: string; maxScore: number; evalStdout: string; diff: string; hasEvalCommand: boolean }> } {
  const calls: Array<{ rubric: string; maxScore: number; evalStdout: string; diff: string; hasEvalCommand: boolean }> = []
  const queue = [...results]
  return {
    calls,
    async judge(request) {
      calls.push({
        rubric: request.rubric,
        maxScore: request.maxScore,
        evalStdout: request.evalStdout,
        diff: request.diff,
        hasEvalCommand: request.hasEvalCommand,
      })
      return queue.shift() ?? { failure: 'no judge result queued' }
    },
  }
}

export function makeFakeEval(results: Array<{ stdout: string; exitCode: number; timedOut?: boolean }>): LoopEvalRunner {
  const queue = [...results]
  return {
    run: async () => {
      const next = queue.shift() ?? { stdout: '', exitCode: 0, timedOut: false }
      return { stdout: next.stdout, exitCode: next.exitCode, timedOut: next.timedOut ?? false }
    },
  }
}

export function makeFakeEmitter(): LoopEmitter & { events: Array<{ channel: string; payload: unknown }> } {
  const events: Array<{ channel: string; payload: unknown }> = []
  return {
    events,
    emit: (channel, payload) => { events.push({ channel, payload }) },
  }
}

export function makeFakeLog(): LoopIterationLogPort & { appended: LoopIteration[] } {
  const appended: LoopIteration[] = []
  return {
    appended,
    append: async (_wt, iter) => { appended.push(iter) },
    readAll: async () => [...appended],
    clear: async () => { appended.length = 0 },
  }
}

export function makeWait(outcomes: Array<'ended' | 'timeout' | 'aborted'>): WaitForTurnEnd {
  const queue = [...outcomes]
  return async () => queue.shift() ?? 'ended'
}

export function baseConfig(overrides: Partial<LoopConfig> = {}): LoopConfig {
  return {
    sessionId: SESSION_ID,
    program: 'Make the widget faster.',
    targetGlobs: ['src/**'],
    evalCommand: 'npm run bench',
    metric: { kind: 'stdout-regex', pattern: 'ms=(\\d+)', direction: 'minimize' },
    budgetSeconds: 30,
    maxIterations: 1,
    ...overrides,
  }
}

export function buildDeps(partial: Partial<LoopRunnerDeps>): {
  session: ReturnType<typeof makeFakeSession>
  git: ReturnType<typeof makeFakeGit>
  evalRunner: LoopEvalRunner
  judge: ReturnType<typeof makeFakeJudge>
  emitter: ReturnType<typeof makeFakeEmitter>
  iterationLog: ReturnType<typeof makeFakeLog>
  composed: LoopRunnerDeps
} {
  const session = makeFakeSession()
  const git = makeFakeGit()
  const evalRunner = partial.evalRunner ?? makeFakeEval([{ stdout: 'ms=42', exitCode: 0 }])
  const judge = (partial.judge as ReturnType<typeof makeFakeJudge>) ?? makeFakeJudge()
  const emitter = makeFakeEmitter()
  const iterationLog = makeFakeLog()
  const composed: LoopRunnerDeps = {
    session,
    git,
    evalRunner,
    judge,
    emitter,
    iterationLog,
    waitForTurnEnd: partial.waitForTurnEnd ?? makeWait(['ended']),
    now: partial.now ?? ((): number => 1_700_000_000_000),
  }
  return { session, git, evalRunner, judge, emitter, iterationLog, composed }
}

export function buildRunner(partial: Partial<LoopRunnerDeps> = {}): {
  runner: LoopRunner
  deps: ReturnType<typeof buildDeps>
} {
  const deps = buildDeps(partial)
  const runner = new LoopRunner(deps.composed)
  return { runner, deps }
}
