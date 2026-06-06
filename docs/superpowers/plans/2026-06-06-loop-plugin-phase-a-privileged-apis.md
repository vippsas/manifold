# Loop-as-a-Plugin — Phase A: Privileged VS Code-shaped APIs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three privileged, capability-gated `manifold` plugin APIs — `agents.activeAgent.runTurn`, `lm.selectChatModels/sendRequest`, and `workspace.workspaceFolders` — that a future decoupled loop plugin will consume, without touching the existing loop feature.

**Architecture:** The extension host is a Node `utilityProcess`, so plugins do git/shell/fs themselves; only three things need a host bridge. Each rides the existing RPC pattern (host-side API object → `endpoint.getProxy(CTX)` → main-side service registered in `ExtensionHost`). Two new capabilities (`agent:control`, `lm`) are gated by declaration **and** restricted to `builtin`-origin plugins. Everything is additive — `src/main/loop/*` and `src/renderer/components/loop/*` are not modified.

**Tech Stack:** TypeScript, Electron (`utilityProcess`), Vitest. Design spec: `docs/superpowers/specs/2026-06-06-loop-plugin-phase-a-privileged-apis-design.md`.

---

## Environment prerequisites (read once)

- This is a git worktree. If `node_modules` is missing, symlink it from the primary checkout: `ln -s ~/git/manifold/node_modules ~/.manifold/worktrees/manifold/manifold-loop-2/node_modules` (per project setup).
- Tests run on Vitest. Use `npx vitest run <path>` for a single file. If a test errors on `better-sqlite3` with an ABI/`NODE_MODULE_VERSION` mismatch, run `npm run rebuild:node` once first (see the project `testing` skill). The full suite via `npm test` runs that rebuild automatically through `pretest`.
- Typecheck gates: `npm run typecheck:web` and `npm run typecheck:node` (plain `npm run typecheck` is a no-op). Baselines are **non-zero** — capture the current counts before you start and require **no new errors in touched files**.
- Commit message footer for every commit:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

## File Structure

**New files**
- `src/main/plugins/agent-control-service.ts` — main-side service: drives a session's agent for one turn + cancellation; owns the turn-end heuristic (duplicated from core loop so core stays untouched; core's copy is deleted in Phase C).
- `src/main/plugins/agent-control-service.test.ts`
- `src/main/plugins/lm-service.ts` — main-side service: one-shot LLM generation via the active session's runtime.
- `src/main/plugins/lm-service.test.ts`
- `src/plugin-host/agents-api.ts` — host-side `manifold.agents` object over `HOST_AGENTS`.
- `src/plugin-host/lm-api.ts` — host-side `manifold.lm` object over `HOST_LM`.
- `src/plugin-host/privileged-api-rpc.test.ts` — RPC round-trip test for the host APIs against fake main-side services.

**Modified files**
- `src/shared/plugins/api-types.ts` — new interfaces + `ManifoldApi` extensions.
- `src/shared/plugins/rpc.ts` — `HOST_AGENTS`, `HOST_LM` constants.
- `src/shared/plugins/manifest.ts` — `agent:control`, `lm` capabilities + builtin-only list.
- `src/shared/plugins/manifest.test.ts` — capability validation coverage.
- `src/plugin-host/gated-api.ts` — `agents`/`lm` gated getters + builtin-origin restriction.
- `src/plugin-host/gated-api.test.ts` — gating coverage.
- `src/plugin-host/workspace-api.ts` — `activeSessionId` accessor + `workspaceFolders`.
- `src/plugin-host/workspace-api.test.ts` — `workspaceFolders` coverage.
- `src/plugin-host/activator.ts` — `origin` on `ActivationTarget`.
- `src/plugin-host/index.ts` — construct + wire `agents`/`lm`; pass `origin` to `buildGatedApi`.
- `src/main/plugins/extension-host.ts` — accept the two services; register `HOST_AGENTS`/`HOST_LM`.
- `src/main/plugins/plugin-manager.ts` — accept `sessionManager`+`gitOps`; build services; thread `origin`; enrich active-context with `worktreePath`.
- `src/main/app/index.ts` — pass `sessionManager`+`gitOps` into `new PluginManager(...)`.
- `docs/plugins/authoring.md` — document the new capabilities + APIs.

---

## Task 1: Shared types, RPC constants, and capabilities

**Files:**
- Modify: `src/shared/plugins/api-types.ts`
- Modify: `src/shared/plugins/rpc.ts`
- Modify: `src/shared/plugins/manifest.ts`
- Test: `src/shared/plugins/manifest.test.ts`

- [ ] **Step 1: Add the new shared API types**

In `src/shared/plugins/api-types.ts`, add these interfaces (place near `Disposable`/`SessionInfo`):

```ts
export interface CancellationToken {
  readonly isCancellationRequested: boolean
  onCancellationRequested(listener: () => void): Disposable
}

export type TurnOutcome = 'ended' | 'timeout' | 'aborted'

export interface AgentSession {
  readonly sessionId: string
  /** Send a prompt to the live agent and resolve when its turn ends. */
  runTurn(
    prompt: string,
    opts?: { budgetSeconds?: number; clearContext?: boolean },
    token?: CancellationToken,
  ): Promise<TurnOutcome>
}

export interface LanguageModelChat {
  readonly id: string
  sendRequest(
    prompt: string,
    opts?: { timeoutMs?: number },
    token?: CancellationToken,
  ): Promise<{ text: string }>
}

export interface WorkspaceFolder {
  readonly name: string
  /** Absolute filesystem path of the worktree. */
  readonly uri: string
}
```

Extend the existing `SessionInfo` to carry the worktree path:

```ts
export interface SessionInfo { id: string; status: string; branchName?: string; worktreePath?: string }
```

Extend `ManifoldApi`: add `workspaceFolders` to the `workspace` member, and add the two new top-level members. The `workspace` block becomes:

```ts
  workspace: {
    readonly activeProject: ProjectInfo | undefined
    readonly activeSession: SessionInfo | undefined
    readonly workspaceFolders: readonly WorkspaceFolder[] | undefined
    onDidChangeActiveProject(listener: (project: ProjectInfo | undefined) => void): Disposable
    onDidChangeActiveSession(listener: (session: SessionInfo | undefined) => void): Disposable
  }
  agents: {
    readonly activeAgent: AgentSession | undefined
  }
  lm: {
    selectChatModels(): Promise<LanguageModelChat[]>
  }
```

- [ ] **Step 2: Add RPC context constants**

In `src/shared/plugins/rpc.ts`, after `HOST_UI`, add:

```ts
export const HOST_AGENTS = 'HostAgents'             // main, called by host
export const HOST_LM = 'HostLm'                     // main, called by host
```

- [ ] **Step 3: Add the new capabilities**

In `src/shared/plugins/manifest.ts`, extend `CAPABILITIES` and add the builtin-only list directly under it:

```ts
export const CAPABILITIES = ['storage', 'workspace:read', 'configuration', 'agent:control', 'lm'] as const
export type Capability = typeof CAPABILITIES[number]
export function isCapability(value: unknown): value is Capability {
  return typeof value === 'string' && (CAPABILITIES as readonly string[]).includes(value)
}

/** Capabilities granted only to built-in (origin === 'builtin') plugins, even when declared. */
export const BUILTIN_ONLY_CAPABILITIES = ['agent:control', 'lm'] as const satisfies readonly Capability[]
export function isBuiltinOnlyCapability(cap: Capability): boolean {
  return (BUILTIN_ONLY_CAPABILITIES as readonly string[]).includes(cap)
}
```

- [ ] **Step 4: Write the failing test for capability validation**

Append to `src/shared/plugins/manifest.test.ts`:

```ts
import { isCapability, isBuiltinOnlyCapability } from './manifest'

describe('capabilities', () => {
  it('recognizes the new privileged capabilities', () => {
    expect(isCapability('agent:control')).toBe(true)
    expect(isCapability('lm')).toBe(true)
    expect(isCapability('storage')).toBe(true)
    expect(isCapability('not-a-cap')).toBe(false)
  })
  it('marks agent:control and lm as builtin-only', () => {
    expect(isBuiltinOnlyCapability('agent:control')).toBe(true)
    expect(isBuiltinOnlyCapability('lm')).toBe(true)
    expect(isBuiltinOnlyCapability('storage')).toBe(false)
    expect(isBuiltinOnlyCapability('workspace:read')).toBe(false)
  })
})
```

(If `describe/it/expect` are not already imported in that file, add `import { describe, it, expect } from 'vitest'` at the top.)

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/shared/plugins/manifest.test.ts`
Expected: PASS (new cases green; existing cases still green).

- [ ] **Step 6: Typecheck the shared changes**

Run: `npm run typecheck:node`
Expected: no new errors. (`ManifoldApi` now requires `agents`/`lm`/`workspaceFolders`; later tasks implement them. If the host `buildGatedApi` return type errors here, that is expected and resolved in Task 4 — note it and proceed; do not fix prematurely.)

- [ ] **Step 7: Commit**

```bash
git add src/shared/plugins/api-types.ts src/shared/plugins/rpc.ts src/shared/plugins/manifest.ts src/shared/plugins/manifest.test.ts
git commit -m "feat(plugins): shared types + capabilities for agents/lm/workspaceFolders

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: AgentControlService (main)

**Files:**
- Create: `src/main/plugins/agent-control-service.ts`
- Test: `src/main/plugins/agent-control-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/plugins/agent-control-service.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createAgentControlService, createTurnEndWaiter } from './agent-control-service'

interface FakeInternal { status: string; lastOutputTime?: number }

function fakeSessionManager(opts: {
  worktreePath?: string | null
  internal?: () => FakeInternal | undefined
}) {
  const inputs: string[] = []
  return {
    inputs,
    getSession: (_id: string) => (opts.worktreePath === null ? undefined : { worktreePath: opts.worktreePath ?? '/wt' }),
    getInternalSession: (_id: string) => (opts.internal ? opts.internal() : { status: 'running' }),
    sendInput: (_id: string, text: string) => { inputs.push(text) },
  }
}

describe('createTurnEndWaiter', () => {
  it("returns 'ended' once idle + output-silence grace elapses", async () => {
    let t = 0
    const now = (): number => t
    const sleep = async (ms: number): Promise<void> => { t += ms }
    // produces output at t=10, then goes idle and silent
    const sm = fakeSessionManager({ internal: () => ({ status: 'waiting', lastOutputTime: 10 }) })
    const wait = createTurnEndWaiter(sm as never, { now, sleep, pollMs: 100, idleGraceMs: 500 })
    const outcome = await wait('s1', 60, new AbortController().signal)
    expect(outcome).toBe('ended')
  })

  it("returns 'timeout' when the budget elapses without ending", async () => {
    let t = 0
    const now = (): number => t
    const sleep = async (ms: number): Promise<void> => { t += ms }
    const sm = fakeSessionManager({ internal: () => ({ status: 'running', lastOutputTime: t }) })
    const wait = createTurnEndWaiter(sm as never, { now, sleep, pollMs: 100, idleGraceMs: 500 })
    const outcome = await wait('s1', 1, new AbortController().signal)
    expect(outcome).toBe('timeout')
  })

  it("returns 'aborted' when the signal is already aborted", async () => {
    const sm = fakeSessionManager({})
    const wait = createTurnEndWaiter(sm as never, {})
    const ac = new AbortController()
    ac.abort()
    expect(await wait('s1', 60, ac.signal)).toBe('aborted')
  })
})

describe('createAgentControlService', () => {
  it('throws when the session has no worktree', async () => {
    const sm = fakeSessionManager({ worktreePath: null })
    const svc = createAgentControlService(sm as never, { waitForTurnEnd: async () => 'ended' })
    await expect(svc.runTurn('s1', 'do it')).rejects.toThrow(/no worktree/i)
  })

  it('sends the prompt then a carriage return and returns the wait outcome', async () => {
    const sm = fakeSessionManager({})
    const svc = createAgentControlService(sm as never, { waitForTurnEnd: async () => 'ended' })
    const outcome = await svc.runTurn('s1', 'PROMPT')
    expect(outcome).toBe('ended')
    expect(sm.inputs).toEqual(['PROMPT', '\r'])
  })

  it('clears context first when clearContext is set', async () => {
    const sm = fakeSessionManager({})
    const svc = createAgentControlService(sm as never, { waitForTurnEnd: async () => 'ended' })
    await svc.runTurn('s1', 'PROMPT', { clearContext: true })
    expect(sm.inputs).toEqual(['/clear', '\r', 'PROMPT', '\r'])
  })

  it("cancelTurn aborts an in-flight turn and resolves 'aborted'", async () => {
    const sm = fakeSessionManager({})
    const svc = createAgentControlService(sm as never, {
      waitForTurnEnd: (_sid, _budget, signal) =>
        new Promise((resolve) => signal.addEventListener('abort', () => resolve('aborted'), { once: true })),
    })
    const p = svc.runTurn('s1', 'PROMPT')
    svc.cancelTurn('s1')
    expect(await p).toBe('aborted')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/main/plugins/agent-control-service.test.ts`
Expected: FAIL — module `./agent-control-service` not found.

- [ ] **Step 3: Implement the service**

Create `src/main/plugins/agent-control-service.ts`:

```ts
// src/main/plugins/agent-control-service.ts
// Main-side service that drives a session's agent for one turn and owns the
// turn-end heuristic. The heuristic is duplicated from src/main/loop/loop-adapters.ts
// (createWaitForTurnEnd) so the core loop feature stays untouched in Phase A; the
// core copy is removed in Phase C when loop becomes a plugin.
import type { SessionManager } from '../session/session-manager'
import type { TurnOutcome } from '../../shared/plugins/api-types'

type SessionAccess = Pick<SessionManager, 'getSession' | 'getInternalSession' | 'sendInput'>

const IDLE_GRACE_MS = 4000
const DEFAULT_BUDGET_SECONDS = 300

export interface TurnEndWaiterOptions {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
  idleGraceMs?: number
}

export type WaitForTurnEnd = (sessionId: string, budgetSeconds: number, signal: AbortSignal) => Promise<TurnOutcome>

/** Wait for an agent session's turn to end after a prompt was sent. A turn is
 *  "ended" only when the session has produced output since the prompt AND has
 *  been idle + output-silent for the grace period. */
export function createTurnEndWaiter(sm: SessionAccess, options: TurnEndWaiterOptions = {}): WaitForTurnEnd {
  const now = options.now ?? ((): number => Date.now())
  const sleep = options.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)))
  const pollMs = options.pollMs ?? 500
  const idleGraceMs = options.idleGraceMs ?? IDLE_GRACE_MS
  const idleStates = new Set(['done', 'waiting'])

  return async (sessionId, budgetSeconds, signal) => {
    const turnStart = now()
    const deadline = turnStart + budgetSeconds * 1000
    let idleSince: number | null = null
    let sawPostPromptOutput = false

    while (now() < deadline) {
      if (signal.aborted) return 'aborted'
      const internal = sm.getInternalSession(sessionId)
      const status = internal?.status ?? 'done'
      const lastOutput = internal?.lastOutputTime ?? 0
      if (lastOutput > turnStart) sawPostPromptOutput = true

      const isIdle = idleStates.has(status)
      if (!isIdle) idleSince = null
      else if (idleSince === null) idleSince = now()

      const t = now()
      const silenceMs = t - Math.max(lastOutput, turnStart)
      const idleMs = idleSince === null ? 0 : t - idleSince
      if (sawPostPromptOutput && isIdle && idleMs >= idleGraceMs && silenceMs >= idleGraceMs) return 'ended'

      await sleep(pollMs)
    }
    return 'timeout'
  }
}

export interface AgentControlService {
  runTurn(
    sessionId: string,
    prompt: string,
    opts?: { budgetSeconds?: number; clearContext?: boolean },
  ): Promise<TurnOutcome>
  cancelTurn(sessionId: string): void
}

export interface AgentControlServiceOptions {
  waitForTurnEnd?: WaitForTurnEnd
  sleep?: (ms: number) => Promise<void>
}

export function createAgentControlService(sm: SessionAccess, options: AgentControlServiceOptions = {}): AgentControlService {
  const waitForTurnEnd = options.waitForTurnEnd ?? createTurnEndWaiter(sm)
  const sleep = options.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)))
  const inflight = new Map<string, AbortController>()

  return {
    async runTurn(sessionId, prompt, opts) {
      if (inflight.has(sessionId)) throw new Error(`a turn is already running for session ${sessionId}`)
      const worktreePath = sm.getSession(sessionId)?.worktreePath
      if (!worktreePath) throw new Error(`no worktree for session ${sessionId}`)

      const abort = new AbortController()
      inflight.set(sessionId, abort)
      try {
        if (opts?.clearContext) {
          sm.sendInput(sessionId, '/clear')
          await sleep(200)
          sm.sendInput(sessionId, '\r')
          await sleep(800)
        }
        sm.sendInput(sessionId, prompt)
        await sleep(400)
        sm.sendInput(sessionId, '\r')
        return await waitForTurnEnd(sessionId, opts?.budgetSeconds ?? DEFAULT_BUDGET_SECONDS, abort.signal)
      } finally {
        inflight.delete(sessionId)
      }
    },
    cancelTurn(sessionId) {
      inflight.get(sessionId)?.abort()
    },
  }
}
```

Note: the default `sleep` of 200/800/400 ms runs in the no-injection production path. The tests inject `waitForTurnEnd` and rely on the default `sleep`; total real delay per `runTurn` test is ~1.4s (clearContext case ~1.4s, others ~0.4s) which is acceptable. If you prefer instant tests, pass `sleep: async () => {}` in the test's `createAgentControlService` options — update the tests in Step 1 accordingly before running.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/plugins/agent-control-service.test.ts`
Expected: PASS (8 cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/plugins/agent-control-service.ts src/main/plugins/agent-control-service.test.ts
git commit -m "feat(plugins): AgentControlService — drive a session turn (runTurn/cancelTurn)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: LmService (main)

**Files:**
- Create: `src/main/plugins/lm-service.ts`
- Test: `src/main/plugins/lm-service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/plugins/lm-service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createLmService } from './lm-service'

const fakeRuntime = { id: 'fake-runtime', aiModelArgs: ['--model', 'x'] } as never

function deps(over: { session?: unknown; runtime?: unknown; aiGenerate?: (...a: unknown[]) => Promise<string> } = {}) {
  const aiGenerate = over.aiGenerate ?? vi.fn(async () => 'JUDGED\nFINAL_SCORE: 7')
  const sm = { getSession: (_id: string) => (over.session === undefined ? { runtimeId: 'fake-runtime', worktreePath: '/wt' } : over.session) }
  const gitOps = { aiGenerate }
  const getRuntime = (_id: string) => (over.runtime === undefined ? fakeRuntime : over.runtime)
  return { sm, gitOps, getRuntime, aiGenerate }
}

describe('createLmService', () => {
  it('selectChatModels returns the active session runtime id', async () => {
    const d = deps()
    const svc = createLmService(d.sm as never, d.gitOps as never, d.getRuntime as never)
    expect(await svc.selectChatModels('s1')).toEqual([{ id: 'fake-runtime' }])
  })

  it('selectChatModels returns [] when there is no active session', async () => {
    const d = deps()
    const svc = createLmService(d.sm as never, d.gitOps as never, d.getRuntime as never)
    expect(await svc.selectChatModels(undefined)).toEqual([])
  })

  it('sendRequest runs aiGenerate with the runtime, worktree, and model args', async () => {
    const d = deps()
    const svc = createLmService(d.sm as never, d.gitOps as never, d.getRuntime as never)
    const res = await svc.sendRequest('s1', 'PROMPT', { timeoutMs: 5000 })
    expect(res.text).toContain('FINAL_SCORE: 7')
    expect(d.aiGenerate).toHaveBeenCalledWith(fakeRuntime, 'PROMPT', '/wt', ['--model', 'x'], { silent: true, timeoutMs: 5000 })
  })

  it('sendRequest throws when there is no active session runtime', async () => {
    const d = deps({ session: undefined as never })
    // session lookup returns undefined → no runtime
    const svc = createLmService({ getSession: () => undefined } as never, d.gitOps as never, d.getRuntime as never)
    await expect(svc.sendRequest('s1', 'PROMPT')).rejects.toThrow(/no active session runtime/i)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/main/plugins/lm-service.test.ts`
Expected: FAIL — module `./lm-service` not found.

- [ ] **Step 3: Implement the service**

Create `src/main/plugins/lm-service.ts`:

```ts
// src/main/plugins/lm-service.ts
// Main-side service backing manifold.lm — one-shot LLM generation via the active
// session's runtime, mirroring how src/main/loop/loop-judge-adapter.ts calls aiGenerate.
import type { SessionManager } from '../session/session-manager'
import type { GitOperations } from '../git/git-operations'
import { getRuntimeById } from '../agent/runtimes'

const DEFAULT_TIMEOUT_MS = 120_000

type SessionAccess = Pick<SessionManager, 'getSession'>
type GitAccess = Pick<GitOperations, 'aiGenerate'>
type RuntimeResolver = typeof getRuntimeById

export interface LmService {
  selectChatModels(sessionId: string | undefined): Promise<{ id: string }[]>
  sendRequest(sessionId: string | undefined, prompt: string, opts?: { timeoutMs?: number }): Promise<{ text: string }>
}

export function createLmService(sm: SessionAccess, gitOps: GitAccess, getRuntime: RuntimeResolver = getRuntimeById): LmService {
  function resolve(sessionId: string | undefined): { runtime: ReturnType<RuntimeResolver>; worktreePath: string } | null {
    if (!sessionId) return null
    const session = sm.getSession(sessionId)
    if (!session) return null
    const runtime = getRuntime(session.runtimeId)
    if (!runtime) return null
    return { runtime, worktreePath: session.worktreePath }
  }

  return {
    async selectChatModels(sessionId) {
      const r = resolve(sessionId)
      return r ? [{ id: r.runtime.id }] : []
    },
    async sendRequest(sessionId, prompt, opts) {
      const r = resolve(sessionId)
      if (!r) throw new Error('no active session runtime for language model request')
      const text = await gitOps.aiGenerate(r.runtime, prompt, r.worktreePath, r.runtime.aiModelArgs ?? [], {
        silent: true,
        timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      })
      return { text }
    },
  }
}
```

Note on `runtime.id`: `getRuntimeById` returns an `AgentRuntime` keyed by its `id`. If the `AgentRuntime` type does not expose an `id` field, change `selectChatModels` to return `[{ id: r.runtimeId }]` and thread `runtimeId` through `resolve` instead (the value is `session.runtimeId`). Verify against `src/main/agent/runtimes.ts` when implementing and pick whichever compiles; the test asserts the id equals `'fake-runtime'`, which matches both `runtime.id` (fake) and `session.runtimeId`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/main/plugins/lm-service.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/plugins/lm-service.ts src/main/plugins/lm-service.test.ts
git commit -m "feat(plugins): LmService — one-shot language-model requests via session runtime

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Gated API — origin + agents/lm gating

**Files:**
- Modify: `src/plugin-host/gated-api.ts`
- Modify: `src/plugin-host/gated-api.test.ts`
- Modify: any other callers of `buildGatedApi` (grep first)

- [ ] **Step 1: Find all callers of `buildGatedApi`**

Run: `git grep -n "buildGatedApi" -- src`
Expected callers to update for the new signature: `src/plugin-host/index.ts` (Task 7) and `src/plugin-host/gated-api.test.ts` (this task). Note any others and update them in this task.

- [ ] **Step 2: Write the failing test**

Replace the body of `src/plugin-host/gated-api.test.ts` cases (keep existing storage/workspace/configuration cases, updating their `buildGatedApi(...)` calls to the new signature) and add:

```ts
import { describe, it, expect } from 'vitest'
import { buildGatedApi, CapabilityError, RestrictedCapabilityError } from './gated-api'

const shared = { commands: {} as never, window: {} as never }
const factories = {
  storage: () => ({}) as never,
  workspace: () => ({}) as never,
  configuration: () => ({}) as never,
  agents: () => ({ activeAgent: undefined }) as never,
  lm: () => ({ selectChatModels: async () => [] }) as never,
}

describe('buildGatedApi — privileged capabilities', () => {
  it('throws CapabilityError when agent:control is not declared', () => {
    const api = buildGatedApi([], 'builtin', shared, factories)
    expect(() => api.agents).toThrow(CapabilityError)
  })

  it('throws CapabilityError when lm is not declared', () => {
    const api = buildGatedApi([], 'builtin', shared, factories)
    expect(() => api.lm).toThrow(CapabilityError)
  })

  it('restricts agent:control to builtin origin even when declared', () => {
    const api = buildGatedApi(['agent:control'], 'user', shared, factories)
    expect(() => api.agents).toThrow(RestrictedCapabilityError)
  })

  it('restricts lm to builtin origin even when declared', () => {
    const api = buildGatedApi(['lm'], 'user', shared, factories)
    expect(() => api.lm).toThrow(RestrictedCapabilityError)
  })

  it('grants agents and lm to a builtin plugin that declares them', () => {
    const api = buildGatedApi(['agent:control', 'lm'], 'builtin', shared, factories)
    expect(api.agents).toBeDefined()
    expect(api.lm).toBeDefined()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/plugin-host/gated-api.test.ts`
Expected: FAIL — `RestrictedCapabilityError` not exported / `buildGatedApi` arity mismatch.

- [ ] **Step 4: Implement the gating**

Rewrite `src/plugin-host/gated-api.ts`:

```ts
// src/plugin-host/gated-api.ts
import type { ManifoldApi } from '../shared/plugins/api-types'
import { type Capability, isBuiltinOnlyCapability } from '../shared/plugins/manifest'

export class CapabilityError extends Error {
  constructor(capability: string) {
    super(`Missing capability: "${capability}". Declare it in your plugin manifest's "capabilities".`)
    this.name = 'CapabilityError'
  }
}

export class RestrictedCapabilityError extends Error {
  constructor(capability: string) {
    super(`Capability "${capability}" is restricted to built-in plugins.`)
    this.name = 'RestrictedCapabilityError'
  }
}

export interface GatedFactories {
  storage: () => ManifoldApi['storage']
  workspace: () => ManifoldApi['workspace']
  configuration: () => ManifoldApi['configuration']
  agents: () => ManifoldApi['agents']
  lm: () => ManifoldApi['lm']
}

export function buildGatedApi(
  capabilities: Capability[],
  origin: 'builtin' | 'user',
  shared: Pick<ManifoldApi, 'commands' | 'window'>,
  factories: GatedFactories,
): ManifoldApi {
  const caps = new Set<Capability>(capabilities)
  function requireCap(cap: Capability): void {
    if (!caps.has(cap)) throw new CapabilityError(cap)
    if (isBuiltinOnlyCapability(cap) && origin !== 'builtin') throw new RestrictedCapabilityError(cap)
  }
  return {
    commands: shared.commands,
    window: shared.window,
    get storage(): ManifoldApi['storage'] { requireCap('storage'); return factories.storage() },
    get workspace(): ManifoldApi['workspace'] { requireCap('workspace:read'); return factories.workspace() },
    get configuration(): ManifoldApi['configuration'] { requireCap('configuration'); return factories.configuration() },
    get agents(): ManifoldApi['agents'] { requireCap('agent:control'); return factories.agents() },
    get lm(): ManifoldApi['lm'] { requireCap('lm'); return factories.lm() },
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/plugin-host/gated-api.test.ts`
Expected: PASS (existing + 5 new cases).

- [ ] **Step 6: Commit**

```bash
git add src/plugin-host/gated-api.ts src/plugin-host/gated-api.test.ts
git commit -m "feat(plugins): gate agents/lm by capability + builtin origin

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Host workspace-api — activeSessionId + workspaceFolders

**Files:**
- Modify: `src/plugin-host/workspace-api.ts`
- Test: `src/plugin-host/workspace-api.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/plugin-host/workspace-api.test.ts` (add imports if missing):

```ts
import { describe, it, expect } from 'vitest'
import { WorkspaceContext } from './workspace-api'

describe('WorkspaceContext — workspaceFolders', () => {
  it('is undefined when there is no active session', () => {
    const ctx = new WorkspaceContext()
    expect(ctx.makeApi().workspaceFolders).toBeUndefined()
    expect(ctx.activeSessionId).toBeUndefined()
  })

  it('reflects the active session worktree path and id', () => {
    const ctx = new WorkspaceContext()
    ctx.setActiveContext({ session: { id: 's1', status: 'running', branchName: 'feat/x', worktreePath: '/wt/s1' } })
    expect(ctx.activeSessionId).toBe('s1')
    expect(ctx.makeApi().workspaceFolders).toEqual([{ name: 'feat/x', uri: '/wt/s1' }])
  })

  it('is undefined when the active session has no worktree path', () => {
    const ctx = new WorkspaceContext()
    ctx.setActiveContext({ session: { id: 's1', status: 'running' } })
    expect(ctx.makeApi().workspaceFolders).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/plugin-host/workspace-api.test.ts`
Expected: FAIL — `activeSessionId` / `workspaceFolders` do not exist.

- [ ] **Step 3: Implement**

In `src/plugin-host/workspace-api.ts`: import the new type and add the accessor + getter.

Add to the imports:

```ts
import type { Disposable, ProjectInfo, SessionInfo, WorkspaceFolder, ManifoldApi } from '../shared/plugins/api-types'
```

Add an accessor on the `WorkspaceContext` class (e.g. just after `setActiveContext`):

```ts
  get activeSessionId(): string | undefined { return this.context.session?.id }
```

Extend the object returned by `makeApi()` with the `workspaceFolders` getter (alongside `activeProject`/`activeSession`):

```ts
      get workspaceFolders(): readonly WorkspaceFolder[] | undefined {
        const session = self.context.session
        if (!session?.worktreePath) return undefined
        return [{ name: session.branchName ?? session.id, uri: session.worktreePath }]
      },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/plugin-host/workspace-api.test.ts`
Expected: PASS (existing + 3 new cases).

- [ ] **Step 5: Commit**

```bash
git add src/plugin-host/workspace-api.ts src/plugin-host/workspace-api.test.ts
git commit -m "feat(plugins): workspace.workspaceFolders + activeSessionId from active session

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Host-side agents-api + lm-api (+ RPC round-trip test)

**Files:**
- Create: `src/plugin-host/agents-api.ts`
- Create: `src/plugin-host/lm-api.ts`
- Test: `src/plugin-host/privileged-api-rpc.test.ts`

- [ ] **Step 1: Write the failing round-trip test**

Create `src/plugin-host/privileged-api-rpc.test.ts`. It wires two `RpcEndpoint`s back-to-back (the same pattern as `extension-host-gated-integration.test.ts`), registers fake `HOST_AGENTS`/`HOST_LM` services on the "main" side, and drives the host-side API objects:

```ts
import { describe, it, expect } from 'vitest'
import { RpcEndpoint, HOST_AGENTS, HOST_LM, type RpcMessage } from '../shared/plugins/rpc'
import { WorkspaceContext } from './workspace-api'
import { createAgentsApi } from './agents-api'
import { createLmApi } from './lm-api'

function wirePair(): { host: RpcEndpoint; main: RpcEndpoint } {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  host = new RpcEndpoint({ post: (m: RpcMessage) => void main.handleMessage(m) })
  main = new RpcEndpoint({ post: (m: RpcMessage) => void host.handleMessage(m) })
  return { host, main }
}

describe('agents-api over RPC', () => {
  it('activeAgent is undefined with no active session', () => {
    const { host } = wirePair()
    const ws = new WorkspaceContext()
    const agents = createAgentsApi(host, ws)
    expect(agents.activeAgent).toBeUndefined()
  })

  it('runTurn forwards to HOST_AGENTS.$runTurn and returns its outcome', async () => {
    const { host, main } = wirePair()
    const calls: unknown[][] = []
    main.registerService(HOST_AGENTS, {
      $runTurn: (sid: string, prompt: string, opts: unknown) => { calls.push([sid, prompt, opts]); return 'ended' },
      $cancelTurn: () => undefined,
    })
    const ws = new WorkspaceContext()
    ws.setActiveContext({ session: { id: 's1', status: 'running', worktreePath: '/wt' } })
    const agents = createAgentsApi(host, ws)
    const outcome = await agents.activeAgent!.runTurn('PROMPT', { budgetSeconds: 30 })
    expect(outcome).toBe('ended')
    expect(calls).toEqual([['s1', 'PROMPT', { budgetSeconds: 30 }]])
  })

  it('a cancellation token triggers $cancelTurn', async () => {
    const { host, main } = wirePair()
    let cancelled: string | undefined
    main.registerService(HOST_AGENTS, {
      $runTurn: () => new Promise(() => {/* never resolves */}),
      $cancelTurn: (sid: string) => { cancelled = sid },
    })
    const ws = new WorkspaceContext()
    ws.setActiveContext({ session: { id: 's1', status: 'running', worktreePath: '/wt' } })
    const agents = createAgentsApi(host, ws)
    const listeners: (() => void)[] = []
    const token = { isCancellationRequested: false, onCancellationRequested: (l: () => void) => { listeners.push(l); return { dispose() {} } } }
    void agents.activeAgent!.runTurn('PROMPT', undefined, token)
    listeners.forEach((l) => l())
    await new Promise((r) => setTimeout(r, 0))
    expect(cancelled).toBe('s1')
  })
})

describe('lm-api over RPC', () => {
  it('selectChatModels maps host models and sendRequest forwards', async () => {
    const { host, main } = wirePair()
    const calls: unknown[][] = []
    main.registerService(HOST_LM, {
      $selectChatModels: (sid: string | undefined) => { calls.push(['select', sid]); return [{ id: 'm1' }] },
      $sendRequest: (sid: string | undefined, prompt: string, opts: unknown) => { calls.push(['send', sid, prompt, opts]); return { text: 'OK' } },
    })
    const ws = new WorkspaceContext()
    ws.setActiveContext({ session: { id: 's1', status: 'running', worktreePath: '/wt' } })
    const lm = createLmApi(host, ws)
    const models = await lm.selectChatModels()
    expect(models.map((m) => m.id)).toEqual(['m1'])
    const res = await models[0].sendRequest('PROMPT', { timeoutMs: 1000 })
    expect(res.text).toBe('OK')
    expect(calls).toEqual([['select', 's1'], ['send', 's1', 'PROMPT', { timeoutMs: 1000 }]])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/plugin-host/privileged-api-rpc.test.ts`
Expected: FAIL — modules `./agents-api` / `./lm-api` not found.

- [ ] **Step 3: Implement `agents-api.ts`**

Create `src/plugin-host/agents-api.ts`:

```ts
// src/plugin-host/agents-api.ts
import { HOST_AGENTS, type RpcEndpoint } from '../shared/plugins/rpc'
import type { AgentSession, CancellationToken, ManifoldApi, TurnOutcome } from '../shared/plugins/api-types'
import type { WorkspaceContext } from './workspace-api'

interface HostAgentsProxy {
  $runTurn(sessionId: string, prompt: string, opts: { budgetSeconds?: number; clearContext?: boolean } | undefined): Promise<TurnOutcome>
  $cancelTurn(sessionId: string): Promise<void>
}

export function createAgentsApi(endpoint: RpcEndpoint, workspace: WorkspaceContext): ManifoldApi['agents'] {
  const host = endpoint.getProxy<HostAgentsProxy>(HOST_AGENTS)
  return {
    get activeAgent(): AgentSession | undefined {
      const sessionId = workspace.activeSessionId
      if (!sessionId) return undefined
      return {
        sessionId,
        async runTurn(prompt, opts, token?: CancellationToken): Promise<TurnOutcome> {
          const sub = token?.onCancellationRequested(() => { void host.$cancelTurn(sessionId) })
          try {
            return await host.$runTurn(sessionId, prompt, opts)
          } finally {
            sub?.dispose()
          }
        },
      }
    },
  }
}
```

- [ ] **Step 4: Implement `lm-api.ts`**

Create `src/plugin-host/lm-api.ts`:

```ts
// src/plugin-host/lm-api.ts
import { HOST_LM, type RpcEndpoint } from '../shared/plugins/rpc'
import type { LanguageModelChat, ManifoldApi } from '../shared/plugins/api-types'
import type { WorkspaceContext } from './workspace-api'

interface HostLmProxy {
  $selectChatModels(sessionId: string | undefined): Promise<{ id: string }[]>
  $sendRequest(sessionId: string | undefined, prompt: string, opts: { timeoutMs?: number } | undefined): Promise<{ text: string }>
}

export function createLmApi(endpoint: RpcEndpoint, workspace: WorkspaceContext): ManifoldApi['lm'] {
  const host = endpoint.getProxy<HostLmProxy>(HOST_LM)
  return {
    async selectChatModels(): Promise<LanguageModelChat[]> {
      const sessionId = workspace.activeSessionId
      const models = await host.$selectChatModels(sessionId)
      return models.map((m) => ({
        id: m.id,
        // Phase A: one-shot, non-streaming. `token` is accepted for VS Code-shape
        // fidelity but not wired to host cancellation yet (aiGenerate has a timeout).
        sendRequest: (prompt, opts) => host.$sendRequest(sessionId, prompt, opts),
      }))
    },
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/plugin-host/privileged-api-rpc.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 6: Commit**

```bash
git add src/plugin-host/agents-api.ts src/plugin-host/lm-api.ts src/plugin-host/privileged-api-rpc.test.ts
git commit -m "feat(plugins): host-side manifold.agents + manifold.lm over RPC

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Wire main + host end-to-end

**Files:**
- Modify: `src/plugin-host/activator.ts`
- Modify: `src/plugin-host/index.ts`
- Modify: `src/main/plugins/extension-host.ts`
- Modify: `src/main/plugins/plugin-manager.ts`
- Modify: `src/main/app/index.ts`

- [ ] **Step 1: Add `origin` to `ActivationTarget`**

In `src/plugin-host/activator.ts`, line 5, extend the interface (keep `origin` optional so existing test constructions still compile; absence is treated as non-builtin):

```ts
export interface ActivationTarget { id: string; root: string; main: string; kind: 'manifold' | 'vscode'; capabilities?: Capability[]; origin?: 'builtin' | 'user' }
```

- [ ] **Step 2: Wire the host assembly in `index.ts`**

In `src/plugin-host/index.ts`:

Add imports near the other host-api imports:

```ts
import { createAgentsApi } from './agents-api'
import { createLmApi } from './lm-api'
```

After `const workspaceContext = new WorkspaceContext()` (line ~34), add:

```ts
const agentsApi = createAgentsApi(endpoint, workspaceContext)
const lmApi = createLmApi(endpoint, workspaceContext)
```

Update the `buildGatedApi(...)` call (the manifold-kind branch, line ~64) to pass `origin` and the two new factories:

```ts
  const manifold = buildGatedApi(t.capabilities ?? [], t.origin ?? 'user', { commands: makeCommandsApi(t.id), window: windowApi }, {
    storage: () => createStorageApi(endpoint, t.id),
    workspace: () => workspaceContext.makeApi(),
    configuration: () => configContext.makeApi(endpoint, t.id),
    agents: () => agentsApi,
    lm: () => lmApi,
  })
```

- [ ] **Step 3: Register the services in `extension-host.ts`**

In `src/main/plugins/extension-host.ts`:

Add to the imports from `../../shared/plugins/rpc`: `HOST_AGENTS, HOST_LM`.
Add imports for the service types:

```ts
import type { AgentControlService } from './agent-control-service'
import type { LmService } from './lm-service'
```

Change the constructor to accept the two services:

```ts
  constructor(
    private readonly storage: PluginStorageStore,
    private readonly agentControl: AgentControlService,
    private readonly lm: LmService,
  ) {}
```

Inside `ensure()`, after the `HOST_UI` service registration (line ~74), register:

```ts
    endpoint.registerService(HOST_AGENTS, {
      $runTurn: (sessionId: string, prompt: string, opts: { budgetSeconds?: number; clearContext?: boolean } | undefined) => this.agentControl.runTurn(sessionId, prompt, opts),
      $cancelTurn: (sessionId: string) => { this.agentControl.cancelTurn(sessionId) },
    })
    endpoint.registerService(HOST_LM, {
      $selectChatModels: (sessionId: string | undefined) => this.lm.selectChatModels(sessionId),
      $sendRequest: (sessionId: string | undefined, prompt: string, opts: { timeoutMs?: number } | undefined) => this.lm.sendRequest(sessionId, prompt, opts),
    })
```

- [ ] **Step 4: Build the services + thread origin/worktree in `plugin-manager.ts`**

In `src/main/plugins/plugin-manager.ts`:

Add imports:

```ts
import { createAgentControlService } from './agent-control-service'
import { createLmService } from './lm-service'
import type { SessionManager } from '../session/session-manager'
import type { GitOperations } from '../git/git-operations'
import type { SessionInfo } from '../../shared/plugins/api-types'
```

Change the constructor (line ~42) to accept the new deps and build the services before constructing the host:

```ts
  constructor(
    private readonly storagePath: string,
    private readonly settings: import('../store/settings-store').SettingsStore,
    private readonly sessionManager: SessionManager,
    gitOps: GitOperations,
  ) {
    const agentControl = createAgentControlService(this.sessionManager)
    const lm = createLmService(this.sessionManager, gitOps)
    this.host = new ExtensionHost(new PluginStorageStore(storagePath), agentControl, lm)
  }
```

(If `this.host` is currently a field initializer like `private host = new ExtensionHost(...)`, convert it to a declared field `private readonly host: ExtensionHost` assigned in the constructor body as above.)

In each of the four `ActivationTarget` constructions (lines ~101, ~115, ~121, ~127 — `$activate`/`resolveView`/`activate`/`treeGetChildren`), add `origin`. They reference a descriptor `p` or `plugin`; add the field from it, e.g.:

```ts
    await this.host.activate({ id: p.id, root: p.root, main: p.manifest.main, kind: p.kind, capabilities: p.manifest.capabilities ?? [], origin: p.origin })
```

Apply the same `origin: <descriptor>.origin` addition to all four call sites.

Update `setActiveContext` (line ~136) to enrich the session with its worktree path:

```ts
  setActiveContext(context: { project?: unknown; session?: SessionInfo }): void {
    let session = context.session
    if (session?.id) {
      const worktreePath = this.sessionManager.getSession(session.id)?.worktreePath
      if (worktreePath) session = { ...session, worktreePath }
    }
    this.host.setActiveContext({ ...context, session })
  }
```

(`ExtensionHost.setActiveContext` already forwards the payload to the host `PLUGIN_WORKSPACE.$setActiveContext`; the host's `WorkspaceContext` stores the enriched `SessionInfo`. No change needed to `extension-host.ts`'s `setActiveContext` beyond Step 3.)

- [ ] **Step 5: Pass the deps at the construction site in `app/index.ts`**

In `src/main/app/index.ts` line ~135, update the construction. First confirm the in-scope variable names for the session manager and git operations:

Run: `git grep -n "new SessionManager\|new GitOperations\|sessionManager\|gitOps" -- src/main/app/index.ts | head`

Then update:

```ts
const pluginManager = new PluginManager(settingsStore.getSettings().storagePath, settingsStore, sessionManager, gitOps)
```

(Use the actual variable names found above if they differ from `sessionManager` / `gitOps`.)

- [ ] **Step 6: Typecheck and run the plugin test suites**

Run: `npm run typecheck:node`
Expected: no new errors in touched files (capture baseline first).

Run: `npx vitest run src/main/plugins src/plugin-host src/shared/plugins`
Expected: all green (existing plugin/host/shared tests + the new ones from Tasks 1–6). If `extension-host.ts` is exercised by an existing test that constructs `new ExtensionHost(storage)` with one argument, update that test to pass two fake services: `new ExtensionHost(storage, { runTurn: async () => 'ended', cancelTurn() {} } as never, { selectChatModels: async () => [], sendRequest: async () => ({ text: '' }) } as never)`. Grep first: `git grep -n "new ExtensionHost" -- src`.

- [ ] **Step 7: Commit**

```bash
git add src/plugin-host/activator.ts src/plugin-host/index.ts src/main/plugins/extension-host.ts src/main/plugins/plugin-manager.ts src/main/app/index.ts
git commit -m "feat(plugins): wire agents/lm services + origin + worktree context end-to-end

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Document the new APIs

**Files:**
- Modify: `docs/plugins/authoring.md`

- [ ] **Step 1: Add the capabilities to the Capabilities table**

In `docs/plugins/authoring.md`, under "### Capabilities", add two rows:

```markdown
| `workspace:read` | `manifold.workspace.activeProject`, `activeSession`, `workspaceFolders`, `onDidChange*` |
| `agent:control` | `manifold.agents.activeAgent` — drive the active session's agent. **Built-in plugins only.** |
| `lm` | `manifold.lm` — one-shot language-model requests via the active session runtime. **Built-in plugins only.** |
```

(Replace the existing `workspace:read` row with the updated one above so `workspaceFolders` is listed.)

- [ ] **Step 2: Add API reference sections**

After the `### manifold.workspace` section, add:

```markdown
### `manifold.agents` *(capability `agent:control`, built-in plugins only)*

```typescript
manifold.agents.activeAgent: AgentSession | undefined
interface AgentSession {
  readonly sessionId: string
  runTurn(prompt: string, opts?: { budgetSeconds?: number; clearContext?: boolean }, token?: CancellationToken): Promise<'ended' | 'timeout' | 'aborted'>
}
```

`runTurn` sends `prompt` to the live agent (optionally `/clear`-ing first) and resolves
when the agent's turn ends, times out (`budgetSeconds`, default 300), or is cancelled via
the `CancellationToken`.

### `manifold.lm` *(capability `lm`, built-in plugins only)*

```typescript
manifold.lm.selectChatModels(): Promise<LanguageModelChat[]>
interface LanguageModelChat {
  readonly id: string
  sendRequest(prompt: string, opts?: { timeoutMs?: number }, token?: CancellationToken): Promise<{ text: string }>
}
```

Phase A is one-shot (non-streaming). `selectChatModels()` returns the active session's
runtime model (or `[]` when no session is active).
```

Also add to the `### manifold.workspace` section: `manifold.workspace.workspaceFolders: readonly WorkspaceFolder[] | undefined` (the active session's worktree, where `WorkspaceFolder = { name, uri }` and `uri` is the worktree fs path).

- [ ] **Step 3: Commit**

```bash
git add docs/plugins/authoring.md
git commit -m "docs(plugins): document agent:control, lm, and workspaceFolders APIs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9 (optional): Dev harness plugin for manual verification

A real end-to-end check of `runTurn`/`lm` needs a live agent session, which automated tests can't provide. This optional task adds a throwaway built-in plugin to exercise the path in `npm run dev`.

**Files:**
- Create: `resources/plugins/manifold.privileged-harness/package.json`
- Create: `resources/plugins/manifold.privileged-harness/src/plugin.ts`

- [ ] **Step 1: Manifest**

Create `resources/plugins/manifold.privileged-harness/package.json`:

```json
{
  "name": "privileged-harness",
  "publisher": "manifold",
  "version": "0.0.1",
  "displayName": "Privileged API Harness",
  "engines": { "manifold": "^0.3.0" },
  "main": "./out/plugin.js",
  "activationEvents": ["onCommand:manifold.privileged-harness.probe"],
  "capabilities": ["agent:control", "lm", "workspace:read"],
  "contributes": { "commands": [{ "command": "manifold.privileged-harness.probe", "title": "Harness: Probe Privileged APIs" }] }
}
```

- [ ] **Step 2: Entry**

Create `resources/plugins/manifold.privileged-harness/src/plugin.ts`:

```ts
import type { ManifoldContext } from 'manifold'
const manifold = require('manifold') as typeof import('manifold')

export function activate(context: ManifoldContext): void {
  context.subscriptions.push(manifold.commands.registerCommand('manifold.privileged-harness.probe', async () => {
    const folders = manifold.workspace.workspaceFolders
    const models = await manifold.lm.selectChatModels()
    const agent = manifold.agents.activeAgent
    return {
      worktree: folders?.[0]?.uri ?? null,
      model: models[0]?.id ?? null,
      hasAgent: Boolean(agent),
      agentSessionId: agent?.sessionId ?? null,
    }
  }))
}

export function deactivate(): void {}
```

- [ ] **Step 3: Build + manual verify**

Run: `npm run build:plugins`
Expected: builds the harness (`…built N plugin(s): … privileged-harness …`).

Run: `npm run dev`, then trigger the `manifold.privileged-harness.probe` command (via the command path used for contributed commands). With an active agent session, confirm it returns a non-null `worktree`, a `model` id, and `hasAgent: true`. Confirm `~/.manifold/debug.log` shows no capability/restriction errors.

- [ ] **Step 4: Decide keep-or-remove + commit**

Keep it as a documented sample, or remove the folder. Either way, commit:

```bash
git add resources/plugins/manifold.privileged-harness 2>/dev/null; git add -A
git commit -m "chore(plugins): privileged-api dev harness (manual verification)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Whole-feature verification

**Files:** none (verification only)

- [ ] **Step 1: Full gates**

Run, expecting all green / no-new-errors:
- `npx vitest run src/main/plugins src/plugin-host src/shared/plugins` → green.
- `npm run typecheck:node` and `npm run typecheck:web` → no new errors in touched files vs. the baseline captured at the start.
- Optionally the full suite: `npm test`.

- [ ] **Step 2: Assert core loop is untouched**

Run: `git diff --name-only main... -- src/main/loop src/renderer/components/loop src/main/ipc/loop-handlers.ts`
Expected: **empty** (Phase A changes nothing under the loop feature).

- [ ] **Step 3: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "test(plugins): Phase A verification fixups

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- `manifold.agents` / `runTurn` (invented, server-side heuristic) → Tasks 1, 2, 6, 7. ✓
- `manifold.lm` (VS Code-shaped, one-shot) → Tasks 1, 3, 6, 7. ✓
- `workspace.workspaceFolders` (rides `workspace:read`) → Tasks 1, 5, 7. ✓
- New capabilities `agent:control`/`lm` + builtin-origin restriction → Tasks 1, 4. ✓
- RPC plumbing + main-side services reuse (`createWaitForTurnEnd` heuristic, `aiGenerate`) → Tasks 2, 3, 6, 7. ✓
- Cancellation via `$cancelTurn` + `AbortController` → Tasks 2, 6. ✓
- Tests at every layer + integration round-trip → Tasks 1–6; manual harness → Task 9. ✓
- Docs → Task 8. ✓
- Core loop untouched → asserted in Task 10 Step 2. ✓

**Placeholder scan:** none — every step has concrete code/commands. Two spots flag a verify-then-pick (LM `runtime.id` vs `session.runtimeId` in Task 3; in-scope variable names in Task 7 Step 5) — each gives the exact decision rule and the assertion that must hold, not a vague "figure it out."

**Type consistency:** `TurnOutcome` (`'ended'|'timeout'|'aborted'`) defined in Task 1 and reused in Tasks 2/6/7. `buildGatedApi(capabilities, origin, shared, factories)` signature defined in Task 4 and matched at the only runtime caller (Task 7 Step 2) and the test (Task 4). `HOST_AGENTS`/`HOST_LM` constants (Task 1) used identically in host APIs (Task 6) and main services (Task 7). `SessionInfo.worktreePath` (Task 1) produced in `plugin-manager.setActiveContext` (Task 7) and consumed in `workspace-api` (Task 5). `AgentControlService`/`LmService` interfaces (Tasks 2/3) match the `ExtensionHost` constructor params and service registrations (Task 7).

**Scope:** additive only; no edits under `src/main/loop` or `src/renderer/components/loop`; Phase B/C (moving loop) explicitly excluded.
