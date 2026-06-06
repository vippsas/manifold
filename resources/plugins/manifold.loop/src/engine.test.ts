import { describe, it, expect } from 'vitest'
import { LoopEngine, type TurnOutcome } from './engine'
import { SESSION_ID, WORKTREE, baseConfig, buildEngine, makeFakeEval, makeFakeJudge, makeFakeGit, makeFakeLog, makeFakeStore, makeRunTurn } from './engine.test-helpers'

/** A runTurn whose single turn stays pending until `resolve()` is called — lets a test
 *  observe the engine while a run is genuinely in progress (runs.set has happened). */
function controllableRunTurn(): { fn: () => Promise<TurnOutcome>; resolve: (o: TurnOutcome) => void } {
  let resolve!: (o: TurnOutcome) => void
  const p = new Promise<TurnOutcome>((r) => { resolve = r })
  return { fn: () => p, resolve }
}
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('LoopEngine — single iteration improvement', () => {
  it('prompts with the inline program text and commits on improvement', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'ms=42', exitCode: 0 }]) })
    env.git.changedFiles.push(3)
    await env.engine.start(baseConfig({ program: 'Make the widget faster.' }))
    expect(env.runTurn.prompts[0]).toContain('Make the widget faster.')
    expect(env.git.commits.length).toBe(1)
    expect(env.git.resets.length).toBe(0)
    const iter = env.log.appended[0]
    expect(iter.outcome).toBe('improved')
    expect(iter.score).toBe(42)
    expect(iter.commitSha).toBeTruthy()
  })

  it('persists status and emits status + iteration events', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'ms=42', exitCode: 0 }]) })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig())
    expect(env.events.map((e) => e.event)).toContain('iteration')
    expect(env.events.map((e) => e.event)).toContain('status')
    const persisted = await env.engine.getStatus(SESSION_ID)
    expect(persisted?.state).toBe('finished')
    expect(persisted?.bestScore).toBe(42)
  })
})

describe('LoopEngine — llm-judge', () => {
  it('uses the judge score and skips eval when command blank', async () => {
    let evalCalled = false
    const env = buildEngine({
      evalRunner: { run: async () => { evalCalled = true; return { stdout: '', exitCode: 0, timedOut: false } } },
      judge: makeFakeJudge([{ score: 7 }]),
    })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig({ evalCommand: '   ', metric: { kind: 'llm-judge', rubric: 'r', maxScore: 10, direction: 'maximize' } }))
    expect(evalCalled).toBe(false)
    expect(env.judge.calls[0].hasEvalCommand).toBe(false)
    expect(env.log.appended[0].score).toBe(7)
  })

  it('marks iteration failed and resets when the judge fails', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'ok', exitCode: 0 }]), judge: makeFakeJudge([{ failure: 'boom' }]) })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig({ metric: { kind: 'llm-judge', rubric: 'r', maxScore: 10, direction: 'maximize' } }))
    expect(env.log.appended[0].outcome).toBe('failed')
    expect(env.git.resets.length).toBe(1)
  })
})

describe('LoopEngine — regression handling', () => {
  it('resets to baseline when worse', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'ms=10', exitCode: 0 }, { stdout: 'ms=50', exitCode: 0 }]), runTurn: makeRunTurn(['ended', 'ended']).fn })
    env.git.changedFiles.push(2, 2)
    await env.engine.start(baseConfig({ maxIterations: 2 }))
    expect(env.git.commits.length).toBe(1)
    expect(env.git.resets.length).toBe(1)
    expect(env.log.appended[1].outcome).toBe('regressed')
  })

  it('rolls forward on regression when alwaysAdvance is set', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'ms=10', exitCode: 0 }, { stdout: 'ms=50', exitCode: 0 }]), runTurn: makeRunTurn(['ended', 'ended']).fn })
    env.git.changedFiles.push(2, 2)
    await env.engine.start(baseConfig({ maxIterations: 2, alwaysAdvance: true }))
    expect(env.git.commits.length).toBe(2)
    expect(env.git.resets.length).toBe(0)
    expect(env.log.appended[1].commitSha).toBeTruthy()
  })
})

describe('LoopEngine — failure paths', () => {
  it('marks failed + resets when eval yields no metric', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'no metric', exitCode: 0 }]) })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig())
    expect(env.log.appended[0].outcome).toBe('failed')
    expect(env.git.resets.length).toBe(1)
  })

  it('skips eval and reports no-changes when nothing changed', async () => {
    const env = buildEngine()
    env.git.changedFiles.push(0)
    await env.engine.start(baseConfig())
    expect(env.log.appended[0].errorMessage).toContain('no changes')
  })

  it('marks aborted on turn timeout', async () => {
    const env = buildEngine({ runTurn: makeRunTurn(['timeout']).fn })
    await env.engine.start(baseConfig())
    expect(env.log.appended[0].outcome).toBe('aborted')
  })
})

describe('LoopEngine — session pinning', () => {
  it('errors when the active session changes mid-run', async () => {
    const git = makeFakeGit(); git.changedFiles.push(1, 1)
    const log = makeFakeLog()
    let active: string | undefined = SESSION_ID
    let turns = 0
    const engine = new LoopEngine({
      git,
      evalRunner: makeFakeEval([{ stdout: 'ms=10', exitCode: 0 }, { stdout: 'ms=9', exitCode: 0 }]),
      judge: makeFakeJudge(),
      iterationLog: log,
      runTurn: async () => { turns += 1; if (turns === 1) active = 'other'; return 'ended' },
      activeSessionId: () => active,
      worktreePath: () => WORKTREE,
      store: makeFakeStore(),
      now: () => 1_700_000_000_000,
    })
    await engine.start(baseConfig({ maxIterations: 2 }))
    const status = await engine.getStatus(SESSION_ID)
    expect(status?.state).toBe('error')
    expect(status?.errorMessage).toContain('active session changed')
    expect(log.appended.length).toBe(1) // iteration 1 ran; iteration 2 blocked by the guard
  })
})

describe('LoopEngine — start guards', () => {
  it('throws when no active agent session', async () => {
    const env = buildEngine()
    env.setActive(undefined)
    await expect(env.engine.start(baseConfig())).rejects.toThrow(/no active agent/i)
  })

  it('rejects an invalid config before doing anything', async () => {
    const env = buildEngine()
    await expect(env.engine.start(baseConfig({ budgetSeconds: 0 }))).rejects.toThrow(/budgetSeconds must be positive/)
    expect(env.git.commits.length).toBe(0)
    expect(env.store.configs.size).toBe(0) // nothing persisted on a rejected start
  })

  it('rejects a second start while one is already running', async () => {
    const turn = controllableRunTurn()
    const env = buildEngine({ runTurn: turn.fn })
    env.git.changedFiles.push(1)
    const running = env.engine.start(baseConfig())
    await flush() // let start() reach the (pending) runTurn — the run is now in the map
    await expect(env.engine.start(baseConfig())).rejects.toThrow(/already running/i)
    turn.resolve('ended')
    await running
  })
})

describe('LoopEngine — setConfig', () => {
  it('persists a valid config', async () => {
    const env = buildEngine()
    await env.engine.setConfig(SESSION_ID, baseConfig())
    expect(env.store.configs.get(SESSION_ID)?.sessionId).toBe(SESSION_ID)
  })
  it('rejects an invalid config without persisting', async () => {
    const env = buildEngine()
    await expect(env.engine.setConfig(SESSION_ID, baseConfig({ program: '' }))).rejects.toThrow(/program/)
    expect(env.store.configs.size).toBe(0)
  })
})

describe('LoopEngine — restoreBest', () => {
  it('hard-resets to the best commit after an improvement', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'ms=42', exitCode: 0 }]) })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig())
    const best = (await env.engine.getStatus(SESSION_ID))?.bestCommitSha
    expect(best).toBeTruthy()
    const { sha } = await env.engine.restoreBest(SESSION_ID)
    expect(sha).toBe(best)
    expect(env.git.resets).toContain(best)
  })

  it('throws (no destructive reset) when best is still the baseline', async () => {
    // A run whose only iteration fails never commits, so bestCommitSha stays === baselineSha.
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'no metric', exitCode: 0 }]) })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig())
    const resetsAfterRun = env.git.resets.length
    await expect(env.engine.restoreBest(SESSION_ID)).rejects.toThrow(/baseline/)
    expect(env.git.resets.length).toBe(resetsAfterRun) // restoreBest did not reset
  })

  it('throws when no best commit is recorded yet', async () => {
    const env = buildEngine()
    await expect(env.engine.restoreBest('never-run')).rejects.toThrow(/no best commit/i)
  })
})

describe('LoopEngine — clear', () => {
  it('wipes the log, persists idle status, and emits status', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'ms=42', exitCode: 0 }]) })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig())
    expect(env.log.appended.length).toBe(1)
    const cleared = await env.engine.clear(SESSION_ID)
    expect(cleared.state).toBe('idle')
    expect(env.log.appended.length).toBe(0)
    expect((await env.engine.getStatus(SESSION_ID))?.state).toBe('idle')
    expect(env.events.some((e) => e.event === 'status' && (e.payload as { state: string }).state === 'idle')).toBe(true)
  })

  it('refuses to clear while a loop is running', async () => {
    const turn = controllableRunTurn()
    const env = buildEngine({ runTurn: turn.fn })
    env.git.changedFiles.push(1)
    const running = env.engine.start(baseConfig())
    await flush()
    await expect(env.engine.clear(SESSION_ID)).rejects.toThrow(/stop it first/i)
    turn.resolve('ended')
    await running
  })
})

describe('LoopEngine — eval failure paths', () => {
  it('resets and marks failed when the eval command crashes', async () => {
    const env = buildEngine({ evalRunner: { run: async () => { throw new Error('spawn ENOENT') } } })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig())
    expect(env.log.appended[0].outcome).toBe('failed')
    expect(env.log.appended[0].errorMessage).toContain('eval crashed')
    expect(env.git.resets.length).toBe(1)
  })

  it('resets and marks failed when the eval times out', async () => {
    const env = buildEngine({ evalRunner: makeFakeEval([{ stdout: 'partial', exitCode: 124, timedOut: true }]) })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig())
    expect(env.log.appended[0].outcome).toBe('failed')
    expect(env.log.appended[0].errorMessage).toContain('eval timed out')
    expect(env.git.resets.length).toBe(1)
  })
})

describe('LoopEngine — wall-clock cutoff', () => {
  it('stops before running any iteration once the wall-clock budget is exceeded', async () => {
    // now() returns the start time for startedAt + startWallMs, then jumps far past the
    // 1-minute budget for the first drive() check.
    let calls = 0
    const now = (): number => { calls += 1; return calls <= 2 ? 1000 : 1000 + 999_999_999 }
    const env = buildEngine({ now })
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig({ maxIterations: 5, maxWallClockMinutes: 1 }))
    expect(env.log.appended.length).toBe(0)
    expect((await env.engine.getStatus(SESSION_ID))?.state).toBe('finished')
  })
})

describe('LoopEngine — getIterations', () => {
  it('returns appended iterations', async () => {
    const env = buildEngine()
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig())
    expect((await env.engine.getIterations()).length).toBe(1)
  })
})

describe('LoopEngine — restart numbering', () => {
  it('continues iteration indices across a stop/restart instead of restarting at 1', async () => {
    // Two separate runs against the same (persistent) log. The second start must NOT
    // re-use indices already in the log, or the history shows duplicate iteration numbers.
    const env = buildEngine({
      evalRunner: makeFakeEval([{ stdout: 'ms=42', exitCode: 0 }, { stdout: 'ms=40', exitCode: 0 }]),
      runTurn: makeRunTurn(['ended', 'ended']).fn,
    })
    env.git.changedFiles.push(1, 1)

    await env.engine.start(baseConfig({ maxIterations: 1 })) // run 1 → index 1
    await env.engine.start(baseConfig({ maxIterations: 1 })) // run 2 → index 2 (not 1 again)

    const indices = env.log.appended.map((i) => i.index)
    expect(indices).toEqual([1, 2])
    expect(new Set(indices).size).toBe(indices.length) // no duplicate numbers
  })

  it('still respects maxIterations per run after resuming numbering', async () => {
    const env = buildEngine({
      evalRunner: makeFakeEval([
        { stdout: 'ms=42', exitCode: 0 }, { stdout: 'ms=41', exitCode: 0 }, { stdout: 'ms=40', exitCode: 0 },
      ]),
      runTurn: makeRunTurn(['ended', 'ended', 'ended']).fn,
    })
    env.git.changedFiles.push(1, 1, 1)

    await env.engine.start(baseConfig({ maxIterations: 1 })) // → [1]
    await env.engine.start(baseConfig({ maxIterations: 2 })) // → [2, 3], not capped by prior count

    expect(env.log.appended.map((i) => i.index)).toEqual([1, 2, 3])
  })
})
