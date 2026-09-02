import { describe, expect, it, vi } from 'vitest'
import { PASS, PLAN, reviewerSpawns, setup } from './engine-test-fixtures'
import type { ViolaPlan, ViolaTaskPlan } from '../../shared/viola'

describe('ViolaEngine', () => {
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
    // Every worker is a visible terminal the human can watch or take over; only Viola is chat.
    // They share the run's group id, which keeps eight worker tabs out of the dock bar — the
    // board opens one on demand instead.
    for (const [, options] of spawn.mock.calls) {
      expect(options).toMatchObject({ newWorktree: true, nonInteractive: false, groupId: 'viola-100' })
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

  it('stamps every task state change so the UI can show how long the step has been running', async () => {
    let clock = 1_000
    const { engine } = setup({ deps: { now: () => clock } })
    await engine.plan('viola-1', 'Fix it')
    const planned = await engine.getRun('viola-1')
    expect(planned!.tasks[0].stateSince).toBe(1_000)

    clock = 5_000
    const result = await engine.start('viola-1')
    expect(result.tasks[0]).toMatchObject({ state: 'done', stateSince: 5_000 })
  })

  it('takes the verdict from the file the reviewer wrote, not from its terminal output', async () => {
    const { engine, verdicts } = setup({
      verdictViaFile: true,
      verdicts: [
        { passed: true, blocking: [], nonBlocking: ['Consider a helper.'] },
        { passed: true, blocking: [], nonBlocking: [] },
      ],
    })
    await engine.plan('viola-1', 'Fix it')
    const result = await engine.start('viola-1')

    expect(result.state).toBe('complete')
    expect(result.tasks[0].review?.nonBlocking).toEqual(['Consider a helper.'])
    // Cleared before every review turn, so a re-review cannot pick up the previous verdict.
    for (const task of result.tasks) {
      expect(verdicts.clear).toHaveBeenCalledWith(expect.stringContaining('/wt/'), task.id)
      expect(verdicts.read).toHaveBeenCalledWith(expect.stringContaining('/wt/'), task.id)
    }
  })

  it('falls back to the reviewer\'s reply when it answered inline instead of writing the file', async () => {
    const { engine } = setup()
    await engine.plan('viola-1', 'Fix it')
    const result = await engine.start('viola-1')

    expect(result.state).toBe('complete')
    expect(result.tasks[0].review?.passed).toBe(true)
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
    expect(spawn.mock.calls[0][1]).toMatchObject({ newWorktree: false, nonInteractive: false })
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

  it('still lets a read-only explore task share Viola\'s checkout', async () => {
    const explore: ViolaPlan = {
      summary: 'Investigate',
      tasks: [{ id: 'flake', title: 'Flake', description: 'Why?', acceptance: ['Cause named'], purpose: 'explore', gates: [] }],
    }
    const { engine, spawn } = setup({ deps: { plan: vi.fn(async () => explore) } })
    spawn.mockImplementation(async (_base: string, options: { runtimeId: ViolaWorkerId }) => ({
      sessionId: 'explorer',
      runtimeId: options.runtimeId,
      worktreePath: '/wt/base',
      whenReady: async () => true,
      runTurn: vi.fn(async () => ({ outcome: 'ended' as const, response: 'It retries twice.' })),
    }))
    await engine.plan('viola-1', 'Why?')
    const result = await engine.start('viola-1')

    expect(result.state).toBe('complete')
    expect(result.tasks[0]).toMatchObject({ state: 'done', report: 'It retries twice.' })
  })
})
