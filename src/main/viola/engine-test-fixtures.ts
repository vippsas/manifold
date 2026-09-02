// Shared scaffolding for the ViolaEngine suites (engine.test.ts, engine-failures.test.ts).
// Not a `.test.ts` file, so vitest treats it as a plain module rather than a suite.
import { vi } from 'vitest'
import { ViolaEngine, type ViolaAgent, type ViolaEngineDeps, type ViolaTurn } from './engine'
import { MemoryViolaStore } from './store'
import type { ViolaPlan, ViolaReview, ViolaTaskPlan, ViolaWorkerId } from '../../shared/viola'

export const PLAN: ViolaPlan = {
  summary: 'Two independent changes',
  tasks: [
    { id: 'api', title: 'API', description: 'Fix the API.', acceptance: ['API tests pass'], purpose: 'implement', gates: [] },
    { id: 'ui', title: 'UI', description: 'Fix the UI.', acceptance: ['UI tests pass'], purpose: 'implement', gates: [] },
  ],
}

export const PASS: ViolaReview = { passed: true, blocking: [], nonBlocking: [] }

export interface SetupOptions {
  deps?: Partial<ViolaEngineDeps>
  verdicts?: ViolaReview[]
  /** Called with the implementer prompt; return a promise to hold that turn open. */
  implementerTurn?: (agent: ViolaAgent, prompt: string) => Promise<ViolaTurn>
}

export function setup(options: SetupOptions = {}) {
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
    availableRuntimes: vi.fn(async (): Promise<ViolaWorkerId[]> => ['claude', 'codex']),
    baseWorktreePath: vi.fn(async () => '/wt/base'),
    supportsIsolatedWorktrees: vi.fn(async () => true),
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

export function reviewerSpawns(spawn: ReturnType<typeof vi.fn>) {
  return spawn.mock.calls
    .map(([, options]) => options as { title: string; runtimeId: string; nonInteractive?: boolean; newWorktree: boolean })
    .filter((options) => options.title.startsWith('review-'))
}
