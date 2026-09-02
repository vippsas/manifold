import { describe, expect, it, vi } from 'vitest'
import { ViolaEngine, type ViolaAgent, type ViolaEngineDeps, type ViolaTurn } from './engine'
import { MemoryViolaStore } from './store'
import type { ViolaPlan, ViolaReview, ViolaTaskPlan, ViolaWorkerId } from './types'

const PLAN: ViolaPlan = {
  summary: 'Two independent changes',
  tasks: [
    { id: 'api', title: 'API', description: 'Fix the API.', acceptance: ['API tests pass'], purpose: 'implement', gates: [] },
    { id: 'ui', title: 'UI', description: 'Fix the UI.', acceptance: ['UI tests pass'], purpose: 'implement', gates: [] },
  ],
}

const PASS: ViolaReview = { passed: true, blocking: [], nonBlocking: [] }

interface SetupOptions {
  deps?: Partial<ViolaEngineDeps>
  verdicts?: ViolaReview[]
  /** Called with the implementer prompt; return a promise to hold that turn open. */
  implementerTurn?: (agent: ViolaAgent, prompt: string) => Promise<ViolaTurn>
}

function setup(options: SetupOptions = {}) {
  const verdicts = [...(options.verdicts ?? [])]
  const turns = new Map<string, ReturnType<typeof vi.fn>>()
  let child = 0
  const spawn = vi.fn(async (_baseSessionId: string, spawnOptions: { runtimeId: ViolaWorkerId; title: string }) => {
    const sessionId = `${spawnOptions.runtimeId}-${++child}`
    const agent: ViolaAgent = {
      sessionId,
      runtimeId: spawnOptions.runtimeId,
      worktreePath: `/wt/${sessionId}`,
      whenReady: vi.fn(async () => true),
      runTurn: vi.fn(async (prompt: string): Promise<ViolaTurn> => {
        if (prompt.startsWith('You are an independent code reviewer')) {
          return { outcome: 'ended', response: JSON.stringify(verdicts.shift() ?? PASS) }
        }
        if (options.implementerTurn) return options.implementerTurn(agent, prompt)
        return { outcome: 'ended', response: prompt.startsWith('EXPLORE') ? 'The flake is in retry.ts:12.' : 'Implemented.' }
      }),
    }
    turns.set(sessionId, agent.runTurn as ReturnType<typeof vi.fn>)
    return agent
  })
  const git = {
    head: vi.fn(async () => 'base-sha'),
    diff: vi.fn(async () => 'diff --git a/file b/file'),
    diffStat: vi.fn(async () => ' file | 1 +'),
    apply: vi.fn(async () => undefined),
    pullRequestUrl: vi.fn(async (path: string) => `https://example.test${path}`),
  }
  const gates = { run: vi.fn(async () => ({ ok: true, output: '' })) }
  const deps: ViolaEngineDeps = {
    availableRuntimes: vi.fn(async () => ['claude', 'codex']),
    plan: vi.fn(async () => PLAN),
    spawn,
    git,
    gates,
    store: new MemoryViolaStore(),
    now: () => 100,
    ...options.deps,
  }
  return { engine: new ViolaEngine(deps), deps, spawn, git, gates, turns }
}

function reviewerSpawns(spawn: ReturnType<typeof vi.fn>) {
  return spawn.mock.calls
    .map(([, options]) => options as { title: string; runtimeId: string; nonInteractive?: boolean; newWorktree: boolean })
    .filter((options) => options.title.startsWith('review-'))
}

describe('ViolaEngine', () => {
  it('requires two installed harnesses before it plans', async () => {
    const { engine, deps } = setup({ deps: { availableRuntimes: vi.fn(async () => ['claude']) } })
    await expect(engine.plan('viola-1', 'Fix it')).rejects.toThrow(/at least two/i)
    expect(deps.plan).not.toHaveBeenCalled()
  })

  it('keeps the plan gated until the user starts it', async () => {
    const { engine, spawn } = setup()
    const plan = await engine.plan('viola-1', 'Fix it')
    expect(plan.state).toBe('planned')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('runs every worker in chat mode, fans out worktrees, and cross-reviews each diff in the reviewer\'s own worktree', async () => {
    const { engine, spawn, git } = setup()
    await engine.plan('viola-1', 'Fix it')
    const result = await engine.start('viola-1')

    expect(result.state).toBe('complete')
    expect(result.tasks.map((task) => [task.runtimeId, task.reviewRuntimeId])).toEqual([
      ['claude', 'codex'],
      ['codex', 'claude'],
    ])
    expect(result.tasks.map((task) => task.report)).toEqual(['Implemented.', 'Implemented.'])
    expect(spawn).toHaveBeenCalledTimes(4)
    for (const [, options] of spawn.mock.calls) {
      expect(options).toMatchObject({ newWorktree: true, nonInteractive: true })
    }
    expect(git.apply).toHaveBeenCalledWith('/wt/codex-3', 'diff --git a/file b/file')
    expect(git.apply).toHaveBeenCalledWith('/wt/claude-4', 'diff --git a/file b/file')
  })

  it('uses one reviewer session per task so parallel reviews never share a live turn', async () => {
    const fourTasks: ViolaPlan = {
      summary: 'Four changes',
      tasks: Array.from({ length: 4 }, (_, index): ViolaTaskPlan => ({
        id: `task-${index + 1}`,
        title: `Task ${index + 1}`,
        description: `Implement task ${index + 1}.`,
        acceptance: [`Task ${index + 1} passes`],
        purpose: 'implement',
        gates: [],
      })),
    }
    const { engine, spawn } = setup({ deps: { plan: vi.fn(async () => fourTasks) } })
    await engine.plan('viola-1', 'Fix it')
    await engine.start('viola-1')

    const reviewers = reviewerSpawns(spawn)
    expect(reviewers).toHaveLength(4)
    expect(new Set(reviewers.map((options) => options.title)).size).toBe(4)
  })

  it('reviews a finished task while a slower sibling is still implementing', async () => {
    let releaseUi: (() => void) | null = null
    const { engine, spawn } = setup({
      implementerTurn: (agent, prompt) => {
        if (prompt.includes('Fix the UI.')) {
          return new Promise((resolve) => {
            releaseUi = () => resolve({ outcome: 'ended', response: 'UI done.' })
          })
        }
        return Promise.resolve({ outcome: 'ended', response: `${agent.runtimeId} done.` })
      },
    })
    await engine.plan('viola-1', 'Fix it')
    const running = engine.start('viola-1')

    await vi.waitFor(() => expect(reviewerSpawns(spawn)).toHaveLength(1))
    expect(reviewerSpawns(spawn)[0].title).toBe('review-api')
    expect(releaseUi).not.toBeNull()
    releaseUi!()
    const result = await running
    expect(result.state).toBe('complete')
  })

  it('allows one bounded fix turn and re-review', async () => {
    const { engine, turns } = setup({
      verdicts: [
        { passed: false, blocking: ['Add the missing regression test.'], nonBlocking: [] },
        PASS,
        PASS,
      ],
    })
    await engine.plan('viola-1', 'Fix it')
    const result = await engine.start('viola-1')

    expect(result.state).toBe('complete')
    const implementation = turns.get(result.tasks[0].sessionId!)!
    expect(implementation).toHaveBeenCalledTimes(2)
    expect(implementation.mock.calls[1][0]).toContain('Add the missing regression test.')
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
    expect(implementation.mock.calls[1][0]).toContain('FAIL src/api.test.ts')
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

  it('returns an explore task\'s report without a worktree or a reviewer', async () => {
    const explore: ViolaPlan = {
      summary: 'Investigate',
      tasks: [{ id: 'flake', title: 'Flake', description: 'Why does it flake?', acceptance: ['Root cause named'], purpose: 'explore', gates: [] }],
    }
    const { engine, spawn, git } = setup({ deps: { plan: vi.fn(async () => explore) } })
    await engine.plan('viola-1', 'Why does it flake?')
    const result = await engine.start('viola-1')

    expect(result.state).toBe('complete')
    expect(result.tasks[0]).toMatchObject({ state: 'done', report: 'The flake is in retry.ts:12.' })
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn.mock.calls[0][1]).toMatchObject({ newWorktree: false, nonInteractive: true })
    expect(git.apply).not.toHaveBeenCalled()
  })

  it('honors the planner\'s suggested worker when it is installed', async () => {
    const routed: ViolaPlan = {
      summary: 'Routed',
      tasks: [
        { ...PLAN.tasks[0], worker: 'codex' },
        { ...PLAN.tasks[1], worker: 'gemini' },
      ],
    }
    const { engine } = setup({ deps: { plan: vi.fn(async () => routed) } })
    await engine.plan('viola-1', 'Fix it')
    const result = await engine.start('viola-1')

    expect(result.tasks.map((task) => task.runtimeId)).toEqual(['codex', 'codex'])
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
      expect(task).toMatchObject({ state: 'error', error: expect.stringMatching(/ready/i) })
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
