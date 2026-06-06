import { LoopEngine, type LoopEngineDeps, type TurnOutcome } from './engine'
import type { LoopGitAdapter } from './git'
import type { LoopEvalRunner } from './eval-runner'
import type { Judge } from './judge'
import type { LoopStore } from './store'
import type { LoopConfig, LoopIteration, LoopStatus } from './types'

export const SESSION_ID = 'sess-1'
export const WORKTREE = '/tmp/wt'

export function makeFakeGit(): LoopGitAdapter & { commits: Array<{ msg: string; sha: string }>; resets: string[]; headShas: string[]; changedFiles: number[] } {
  const commits: Array<{ msg: string; sha: string }> = []
  const resets: string[] = []
  const headShas: string[] = ['sha-baseline']
  const changedFiles: number[] = []
  let nextSha = 1
  return {
    commits, resets, headShas, changedFiles,
    getHeadSha: async () => headShas[headShas.length - 1],
    stageAllAndCommit: async (_wt, msg) => { const sha = `sha-commit-${nextSha++}`; commits.push({ msg, sha }); headShas.push(sha); return sha },
    hardReset: async (_wt, sha) => { resets.push(sha); headShas.push(sha) },
    getChangedFilesCount: async () => changedFiles.shift() ?? 0,
    getDiff: async () => '',
  }
}

export function makeFakeEval(results: Array<{ stdout: string; exitCode: number; timedOut?: boolean }>): LoopEvalRunner {
  const queue = [...results]
  return { run: async () => { const n = queue.shift() ?? { stdout: '', exitCode: 0, timedOut: false }; return { stdout: n.stdout, exitCode: n.exitCode, timedOut: n.timedOut ?? false } } }
}

export function makeFakeJudge(results: Array<{ score: number } | { failure: string }> = []): Judge & { calls: Array<{ rubric: string; maxScore: number; evalStdout: string; diff: string; hasEvalCommand: boolean }> } {
  const calls: Array<{ rubric: string; maxScore: number; evalStdout: string; diff: string; hasEvalCommand: boolean }> = []
  const queue = [...results]
  return {
    calls,
    async judge(request) {
      calls.push({ rubric: request.rubric, maxScore: request.maxScore, evalStdout: request.evalStdout, diff: request.diff, hasEvalCommand: request.hasEvalCommand })
      return queue.shift() ?? { failure: 'no judge result queued' }
    },
  }
}

export function makeFakeLog(): LoopEngineDeps['iterationLog'] & { appended: LoopIteration[] } {
  const appended: LoopIteration[] = []
  return {
    appended,
    append: async (_wt, iter) => { appended.push(iter) },
    readAll: async () => [...appended],
    clear: async () => { appended.length = 0 },
  }
}

export function makeFakeStore(): LoopStore & { configs: Map<string, LoopConfig>; statuses: Map<string, LoopStatus> } {
  const configs = new Map<string, LoopConfig>()
  const statuses = new Map<string, LoopStatus>()
  return {
    configs, statuses,
    getConfig: async (id) => configs.get(id) ?? null,
    setConfig: async (id, c) => { configs.set(id, c) },
    getStatus: async (id) => statuses.get(id) ?? null,
    setStatus: async (id, s) => { statuses.set(id, s) },
  }
}

export function makeRunTurn(outcomes: Array<TurnOutcome>): { fn: LoopEngineDeps['runTurn']; prompts: string[] } {
  const queue = [...outcomes]
  const prompts: string[] = []
  return { prompts, fn: async (prompt, _opts, signal) => { prompts.push(prompt); if (signal.aborted) return 'aborted'; return queue.shift() ?? 'ended' } }
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

export function buildEngine(partial: Partial<LoopEngineDeps> = {}): {
  engine: LoopEngine
  git: ReturnType<typeof makeFakeGit>
  judge: ReturnType<typeof makeFakeJudge>
  log: ReturnType<typeof makeFakeLog>
  store: ReturnType<typeof makeFakeStore>
  runTurn: ReturnType<typeof makeRunTurn>
  events: Array<{ event: string; payload: unknown }>
  setActive: (id: string | undefined) => void
} {
  const git = (partial.git as ReturnType<typeof makeFakeGit>) ?? makeFakeGit()
  const judge = (partial.judge as ReturnType<typeof makeFakeJudge>) ?? makeFakeJudge()
  const log = (partial.iterationLog as ReturnType<typeof makeFakeLog>) ?? makeFakeLog()
  const store = (partial.store as ReturnType<typeof makeFakeStore>) ?? makeFakeStore()
  const runTurn = partial.runTurn ? { fn: partial.runTurn, prompts: [] as string[] } : makeRunTurn(['ended'])
  const events: Array<{ event: string; payload: unknown }> = []
  let active: string | undefined = SESSION_ID
  const engine = new LoopEngine({
    git,
    evalRunner: partial.evalRunner ?? makeFakeEval([{ stdout: 'ms=42', exitCode: 0 }]),
    judge,
    iterationLog: log,
    runTurn: runTurn.fn,
    activeSessionId: () => active,
    worktreePath: () => WORKTREE,
    store,
    emit: (event, payload) => { events.push({ event, payload }) },
    now: partial.now ?? ((): number => 1_700_000_000_000),
  })
  return { engine, git, judge, log, store, runTurn, events, setActive: (id) => { active = id } }
}
