import { describe, it, expect, beforeEach } from 'vitest'
import { LoopRunner } from './loop-runner'
import type {
  LoopRunnerDeps,
  LoopSessionAdapter,
  LoopGitAdapter,
  LoopEvalRunner,
  LoopEmitter,
  LoopIterationLog as LoopIterationLogPort,
  WaitForTurnEnd,
} from './loop-runner'
import type { LoopConfig, LoopIteration, LoopStatus } from '../../shared/loop-types'

const SESSION_ID = 'sess-1'
const WORKTREE = '/tmp/wt'

function makeFakeSession(): LoopSessionAdapter & { loopConfigs: Map<string, LoopConfig>; loopStatuses: Map<string, LoopStatus>; inputs: string[]; statusQueue: string[] } {
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

function makeFakeGit(): LoopGitAdapter & { commits: Array<{ msg: string; sha: string }>; resets: string[]; headShas: string[]; changedFiles: number[] } {
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
  }
}

function makeFakeEval(results: Array<{ stdout: string; exitCode: number; timedOut?: boolean }>): LoopEvalRunner {
  const queue = [...results]
  return {
    run: async () => {
      const next = queue.shift() ?? { stdout: '', exitCode: 0, timedOut: false }
      return { stdout: next.stdout, exitCode: next.exitCode, timedOut: next.timedOut ?? false }
    },
  }
}

function makeFakeEmitter(): LoopEmitter & { events: Array<{ channel: string; payload: unknown }> } {
  const events: Array<{ channel: string; payload: unknown }> = []
  return {
    events,
    emit: (channel, payload) => { events.push({ channel, payload }) },
  }
}

function makeFakeLog(): LoopIterationLogPort & { appended: LoopIteration[] } {
  const appended: LoopIteration[] = []
  return {
    appended,
    append: async (_wt, iter) => { appended.push(iter) },
    readAll: async () => [...appended],
  }
}

function makeWait(outcomes: Array<'ended' | 'timeout' | 'aborted'>): WaitForTurnEnd {
  const queue = [...outcomes]
  return async () => queue.shift() ?? 'ended'
}

function baseConfig(overrides: Partial<LoopConfig> = {}): LoopConfig {
  return {
    sessionId: SESSION_ID,
    programFile: 'program.md',
    targetGlobs: ['src/**'],
    evalCommand: 'npm run bench',
    metric: { kind: 'stdout-regex', pattern: 'ms=(\\d+)', direction: 'minimize' },
    budgetSeconds: 30,
    maxIterations: 1,
    ...overrides,
  }
}

function buildRunner(partial: Partial<LoopRunnerDeps> = {}): {
  runner: LoopRunner
  deps: ReturnType<typeof buildDeps>
} {
  const deps = buildDeps(partial)
  const runner = new LoopRunner(deps.composed)
  return { runner, deps }
}

function buildDeps(partial: Partial<LoopRunnerDeps>): {
  session: ReturnType<typeof makeFakeSession>
  git: ReturnType<typeof makeFakeGit>
  evalRunner: LoopEvalRunner
  emitter: ReturnType<typeof makeFakeEmitter>
  iterationLog: ReturnType<typeof makeFakeLog>
  composed: LoopRunnerDeps
} {
  const session = makeFakeSession()
  const git = makeFakeGit()
  const evalRunner = partial.evalRunner ?? makeFakeEval([{ stdout: 'ms=42', exitCode: 0 }])
  const emitter = makeFakeEmitter()
  const iterationLog = makeFakeLog()
  const composed: LoopRunnerDeps = {
    session,
    git,
    evalRunner,
    emitter,
    iterationLog,
    waitForTurnEnd: partial.waitForTurnEnd ?? makeWait(['ended']),
    now: partial.now ?? ((): number => 1_700_000_000_000),
  }
  return { session, git, evalRunner, emitter, iterationLog, composed }
}

describe('LoopRunner.start — single iteration, improvement', () => {
  let env: ReturnType<typeof buildRunner>
  beforeEach(() => {
    env = buildRunner({
      evalRunner: makeFakeEval([{ stdout: 'ms=42', exitCode: 0 }]),
    })
    env.deps.git.changedFiles.push(3)
  })

  it('prompts the agent', async () => {
    await env.runner.start(baseConfig())
    expect(env.deps.session.inputs.length).toBe(1)
    expect(env.deps.session.inputs[0]).toContain('program.md')
  })

  it('commits on improvement', async () => {
    await env.runner.start(baseConfig())
    expect(env.deps.git.commits.length).toBe(1)
    expect(env.deps.git.resets.length).toBe(0)
  })

  it('records improvement in iteration log', async () => {
    await env.runner.start(baseConfig())
    expect(env.deps.iterationLog.appended.length).toBe(1)
    const iter = env.deps.iterationLog.appended[0]
    expect(iter.outcome).toBe('improved')
    expect(iter.score).toBe(42)
    expect(iter.commitSha).toBeTruthy()
  })

  it('emits status-changed and iteration events', async () => {
    await env.runner.start(baseConfig())
    const channels = env.deps.emitter.events.map((e) => e.channel)
    expect(channels).toContain('loop:status-changed')
    expect(channels).toContain('loop:iteration')
  })

  it('marks run as finished and updates bestScore', async () => {
    await env.runner.start(baseConfig())
    const status = env.runner.getStatus(SESSION_ID)
    expect(status?.state).toBe('finished')
    expect(status?.bestScore).toBe(42)
  })
})

describe('LoopRunner.start — regression discards', () => {
  it('resets to baseline when score is worse', async () => {
    const env = buildRunner({
      evalRunner: makeFakeEval([
        { stdout: 'ms=10', exitCode: 0 },  // improvement → commits
        { stdout: 'ms=50', exitCode: 0 },  // regression → reset
      ]),
    })
    env.deps.git.changedFiles.push(2, 2)
    await env.runner.start(baseConfig({ maxIterations: 2 }))
    expect(env.deps.git.commits.length).toBe(1)
    expect(env.deps.git.resets.length).toBe(1)
    const iters = env.deps.iterationLog.appended
    expect(iters[0].outcome).toBe('improved')
    expect(iters[1].outcome).toBe('regressed')
    const status = env.runner.getStatus(SESSION_ID)
    expect(status?.bestScore).toBe(10)
  })
})

describe('LoopRunner.start — eval failure', () => {
  it('marks iteration failed and resets', async () => {
    const env = buildRunner({
      evalRunner: makeFakeEval([{ stdout: 'no metric here', exitCode: 0 }]),
    })
    env.deps.git.changedFiles.push(1)
    await env.runner.start(baseConfig())
    const iter = env.deps.iterationLog.appended[0]
    expect(iter.outcome).toBe('failed')
    expect(iter.errorMessage).toBeTruthy()
    expect(env.deps.git.resets.length).toBe(1)
  })
})

describe('LoopRunner.start — no changes made', () => {
  it('skips eval and marks iteration failed with no-changes reason', async () => {
    const env = buildRunner()
    env.deps.git.changedFiles.push(0)
    await env.runner.start(baseConfig())
    const iter = env.deps.iterationLog.appended[0]
    expect(iter.outcome).toBe('failed')
    expect(iter.errorMessage).toContain('no changes')
  })
})

describe('LoopRunner.start — turn timeout', () => {
  it('marks iteration aborted and resets', async () => {
    const env = buildRunner({
      waitForTurnEnd: makeWait(['timeout']),
    })
    await env.runner.start(baseConfig())
    const iter = env.deps.iterationLog.appended[0]
    expect(iter.outcome).toBe('aborted')
  })
})

describe('LoopRunner — stop cancels loop', () => {
  it('stops cleanly when requested', async () => {
    const env = buildRunner({
      evalRunner: makeFakeEval([
        { stdout: 'ms=10', exitCode: 0 },
        { stdout: 'ms=9', exitCode: 0 },
      ]),
      waitForTurnEnd: (async (_id, _b, signal) => {
        if (signal.aborted) return 'aborted'
        return 'ended'
      }) as WaitForTurnEnd,
    })
    env.deps.git.changedFiles.push(1, 1)
    const runPromise = env.runner.start(baseConfig({ maxIterations: 5 }))
    await env.runner.stop(SESSION_ID)
    await runPromise
    const status = env.runner.getStatus(SESSION_ID)
    expect(status?.state === 'finished' || status?.state === 'idle').toBe(true)
  })
})

describe('LoopRunner.getIterations', () => {
  it('returns appended iterations for a session', async () => {
    const env = buildRunner()
    env.deps.git.changedFiles.push(1)
    await env.runner.start(baseConfig())
    const iters = await env.runner.getIterations(SESSION_ID)
    expect(iters.length).toBe(1)
  })
})
