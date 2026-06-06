import { describe, it, expect } from 'vitest'
import { LoopEngine } from './engine'
import { SESSION_ID, WORKTREE, baseConfig, buildEngine, makeFakeEval, makeFakeJudge, makeFakeGit, makeFakeLog, makeFakeStore, makeRunTurn } from './engine.test-helpers'

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
})

describe('LoopEngine — getIterations', () => {
  it('returns appended iterations', async () => {
    const env = buildEngine()
    env.git.changedFiles.push(1)
    await env.engine.start(baseConfig())
    expect((await env.engine.getIterations()).length).toBe(1)
  })
})
