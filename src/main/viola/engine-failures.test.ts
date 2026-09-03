// Preconditions and failure paths for ViolaEngine. The happy-path run flow is in engine.test.ts.
import { describe, expect, it, vi } from 'vitest'
import { PLAN, reviewerSpawns, setup } from './engine-test-fixtures'
import { MemoryViolaStore } from './store'
import type { ViolaPlan, ViolaWorkerId } from '../../shared/viola'

describe('ViolaEngine preconditions and failures', () => {
  it('requires two installed harnesses before it plans', async () => {
    const { engine, deps } = setup({ deps: { availableRuntimes: vi.fn(async () => ['claude']) } })
    await expect(engine.plan('viola-1', 'Fix it')).rejects.toThrow(/at least two/i)
    expect(deps.plan).not.toHaveBeenCalled()
  })

  it('refuses to plan when the project cannot host isolated worktrees', async () => {
    const { engine, deps } = setup({ deps: { supportsIsolatedWorktrees: vi.fn(async () => false) } })
    await expect(engine.plan('viola-1', 'Fix it')).rejects.toThrow(/isolated worktree/i)
    expect(deps.plan).not.toHaveBeenCalled()
  })

  it('runs the gates before review and sends red output back to the implementer once', async () => {
    const gated: ViolaPlan = {
      summary: 'Gated',
      tasks: [{ ...PLAN.tasks[0], gates: ['npm test -- src/api'] }],
    }
    const { engine, gates, turns, spawn } = setup({ deps: { plan: vi.fn(async () => gated) } })
    gates.run
      .mockResolvedValueOnce({ ok: false, output: 'FAIL src/api.test.ts' })
      .mockResolvedValueOnce({ ok: true, output: '1 passed' })
    await engine.plan('viola-1', 'Fix it')
    const result = await engine.start('viola-1')

    expect(result.state).toBe('complete')
    expect(gates.run).toHaveBeenCalledWith('/wt/claude-1', 'npm test -- src/api', expect.anything())
    const implementation = turns.get(result.tasks[0].sessionId!)!
    expect(implementation).toHaveBeenCalledTimes(2)
    expect(implementation.mock.calls[1][0].prompt).toContain('FAIL src/api.test.ts')
    expect(reviewerSpawns(spawn)).toHaveLength(1)
  })

  it('stops a task whose gate stays red without spending a reviewer', async () => {
    const gated: ViolaPlan = {
      summary: 'Gated',
      tasks: [{ ...PLAN.tasks[0], gates: ['npm test -- src/api'] }],
    }
    const { engine, gates, spawn } = setup({ deps: { plan: vi.fn(async () => gated) } })
    gates.run.mockResolvedValue({ ok: false, output: 'FAIL' })
    await engine.plan('viola-1', 'Fix it')
    const result = await engine.start('viola-1')

    expect(result.state).toBe('needs_attention')
    expect(result.tasks[0]).toMatchObject({ state: 'needs_attention', error: expect.stringContaining('npm test -- src/api') })
    expect(reviewerSpawns(spawn)).toHaveLength(0)
  })

  it('surfaces a reviewer spawn failure as that task\'s error', async () => {
    const { engine, spawn } = setup()
    spawn.mockImplementation(async (_base: string, options: { title: string; runtimeId: ViolaWorkerId }) => {
      if (options.title.startsWith('review-')) throw new Error('worktree quota exceeded')
      return {
        sessionId: `${options.runtimeId}-impl`,
        runtimeId: options.runtimeId,
        worktreePath: `/wt/${options.runtimeId}-impl`,
        whenReady: async () => true,
        runTurn: async () => ({ outcome: 'ended' as const, response: 'Implemented.' }),
      }
    })
    await engine.plan('viola-1', 'Fix it')
    const result = await engine.start('viola-1')

    expect(result.state).toBe('needs_attention')
    for (const task of result.tasks) {
      expect(task).toMatchObject({ state: 'error', error: expect.stringContaining('worktree quota exceeded') })
    }
  })

  it('fails an implement task when the spawn shares Viola\'s own checkout instead of isolating it', async () => {
    const { engine, spawn, git } = setup()
    // A `kind: 'folder'` project ignores newWorktree and hands back the project directory.
    spawn.mockImplementation(async (_base: string, options: { runtimeId: ViolaWorkerId }) => ({
      sessionId: `${options.runtimeId}-shared`,
      runtimeId: options.runtimeId,
      worktreePath: '/wt/base',
      whenReady: async () => true,
      runTurn: vi.fn(async () => ({ outcome: 'ended' as const, response: 'Implemented.' })),
    }))
    await engine.plan('viola-1', 'Fix it')
    const result = await engine.start('viola-1')

    expect(result.state).toBe('needs_attention')
    for (const task of result.tasks) {
      expect(task).toMatchObject({ state: 'error', error: expect.stringMatching(/isolated worktree/i) })
    }
    // Nothing ran in the shared checkout: no turn, no gates, and above all no destructive apply.
    expect(git.apply).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  it('fails a task whose worker never becomes ready', async () => {
    const { engine, spawn } = setup()
    spawn.mockImplementation(async (_base: string, options: { runtimeId: ViolaWorkerId }) => ({
      sessionId: `${options.runtimeId}-slow`,
      runtimeId: options.runtimeId,
      worktreePath: '/wt/slow',
      whenReady: async () => false,
      runTurn: vi.fn(async () => ({ outcome: 'ended' as const, response: '' })),
    }))
    await engine.plan('viola-1', 'Fix it')
    const result = await engine.start('viola-1')

    for (const task of result.tasks) {
      expect(task).toMatchObject({ state: 'error', error: expect.stringMatching(/did not start/i) })
    }
  })
})

describe('ViolaEngine stored runs', () => {
  it('reads a run saved before tasks had purpose and gates', async () => {
    const store = new MemoryViolaStore()
    await store.set({
      id: 'viola-1',
      baseSessionId: 'viola-1',
      goal: 'Fix it',
      summary: 'Old run',
      state: 'complete',
      availableRuntimes: ['claude', 'codex'],
      createdAt: 1,
      tasks: [{ id: 'api', title: 'API', description: 'Fix the API.', acceptance: ['ok'], state: 'done' }],
    } as never)
    const { engine } = setup({ deps: { store } })

    const run = await engine.getRun('viola-1')

    expect(run?.tasks[0]).toMatchObject({ purpose: 'implement', gates: [] })
  })
})
