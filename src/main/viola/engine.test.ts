import { describe, expect, it, vi } from 'vitest'
import { ViolaEngine, type ViolaAgent, type ViolaEngineDeps } from './engine'
import { MemoryViolaStore } from './store'
import type { ViolaPlan, ViolaReview, ViolaWorkerId } from './types'

const PLAN: ViolaPlan = {
  summary: 'Two independent changes',
  tasks: [
    { id: 'api', title: 'API', description: 'Fix the API.', acceptance: ['API tests pass'] },
    { id: 'ui', title: 'UI', description: 'Fix the UI.', acceptance: ['UI tests pass'] },
  ],
}

function setup(overrides: Partial<ViolaEngineDeps> = {}) {
  const turns = new Map<string, ReturnType<typeof vi.fn>>()
  let child = 0
  const spawn = vi.fn(async (_baseSessionId: string, options: { runtimeId: ViolaWorkerId }) => {
    const sessionId = `${options.runtimeId}-${++child}`
    const runTurn = vi.fn(async () => 'ended' as const)
    turns.set(sessionId, runTurn)
    return {
      sessionId,
      runtimeId: options.runtimeId,
      worktreePath: `/wt/${sessionId}`,
      whenReady: vi.fn(async () => true),
      runTurn,
    } satisfies ViolaAgent
  })
  const review = vi.fn(async (): Promise<ViolaReview> => ({
    passed: true,
    blocking: [],
    nonBlocking: [],
  }))
  const deps: ViolaEngineDeps = {
    availableRuntimes: vi.fn(async () => ['claude', 'codex']),
    plan: vi.fn(async () => PLAN),
    review,
    spawn,
    git: {
      head: vi.fn(async () => 'base-sha'),
      diff: vi.fn(async () => 'diff --git a/file b/file'),
      pullRequestUrl: vi.fn(async (path) => `https://example.test${path}`),
    },
    store: new MemoryViolaStore(),
    now: () => 100,
    ...overrides,
  }
  return { engine: new ViolaEngine(deps), deps, spawn, review, turns }
}

describe('ViolaEngine', () => {
  it('requires two installed harnesses before it plans', async () => {
    const { engine, deps } = setup({ availableRuntimes: vi.fn(async () => ['claude']) })
    await expect(engine.plan('viola-1', 'Fix it')).rejects.toThrow(/at least two/i)
    expect(deps.plan).not.toHaveBeenCalled()
  })

  it('keeps the plan gated until the user starts it', async () => {
    const { engine, spawn } = setup()
    const plan = await engine.plan('viola-1', 'Fix it')
    expect(plan.state).toBe('planned')
    expect(spawn).not.toHaveBeenCalled()
  })

  it('fans out implementation worktrees and reviews each diff with another harness', async () => {
    const { engine, spawn, review } = setup()
    await engine.plan('viola-1', 'Fix it')
    const result = await engine.start('viola-1')

    expect(result.state).toBe('complete')
    expect(result.tasks.map((task) => [task.runtimeId, task.reviewRuntimeId])).toEqual([
      ['claude', 'codex'],
      ['codex', 'claude'],
    ])
    expect(spawn).toHaveBeenCalledTimes(4)
    expect(spawn).toHaveBeenCalledWith('viola-1', expect.objectContaining({
      runtimeId: 'claude', newWorktree: true,
    }))
    expect(spawn).toHaveBeenCalledWith('viola-1', expect.objectContaining({
      runtimeId: 'codex', newWorktree: true, nonInteractive: true,
    }))
    expect(review).toHaveBeenCalledTimes(2)
    for (const [reviewer, task] of review.mock.calls) {
      expect(reviewer.runtimeId).not.toBe(result.tasks.find((candidate) => candidate.id === task.id)?.runtimeId)
    }
  })

  it('uses one reviewer session per task so parallel reviews never share a live turn', async () => {
    const fourTasks: ViolaPlan = {
      summary: 'Four changes',
      tasks: Array.from({ length: 4 }, (_, index) => ({
        id: `task-${index + 1}`,
        title: `Task ${index + 1}`,
        description: `Implement task ${index + 1}.`,
        acceptance: [`Task ${index + 1} passes`],
      })),
    }
    const { engine, spawn } = setup({ plan: vi.fn(async () => fourTasks) })
    await engine.plan('viola-1', 'Fix it')
    await engine.start('viola-1')

    const reviewerSpawns = spawn.mock.calls
      .map(([, options]) => options as { title: string; nonInteractive?: boolean })
      .filter((options) => options.nonInteractive)
    expect(reviewerSpawns).toHaveLength(4)
    expect(new Set(reviewerSpawns.map((options) => options.title)).size).toBe(4)
  })

  it('allows one bounded fix turn and re-review', async () => {
    const verdicts: ViolaReview[] = [
      { passed: false, blocking: ['Add the missing regression test.'], nonBlocking: [] },
      { passed: true, blocking: [], nonBlocking: [] },
      { passed: true, blocking: [], nonBlocking: [] },
    ]
    const review = vi.fn(async () => verdicts.shift()!)
    const { engine, turns } = setup({ review })
    await engine.plan('viola-1', 'Fix it')
    const result = await engine.start('viola-1')

    expect(result.state).toBe('complete')
    const implementation = turns.get(result.tasks[0].sessionId!)!
    expect(implementation).toHaveBeenCalledTimes(2)
    expect(review).toHaveBeenCalledTimes(3)
  })
})
