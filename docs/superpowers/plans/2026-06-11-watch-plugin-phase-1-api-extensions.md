# Watch-as-a-Plugin — Phase 1: Plugin-System Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the three plugin-system capabilities the watch plugin needs — `agent:spawn` (sibling-session control), `transcription:read` (core AI-service settings), and per-view `frameSources` CSP — with no watch-module changes.

**Architecture:** Each privileged surface follows the established Phase-A pattern: capability enum (`src/shared/plugins/manifest.ts`) → host-side capability gate (`src/plugin-host/gated-api.ts`) → main-side `assertBuiltin` re-validation in `ExtensionHost`. `frameSources` flows manifest → scan → `WebviewContentStore` → `buildCsp`. Reveal flows plugin → main → `plugins:reveal-session` push → `useAppEffects` → `openSiblingPanel`.

**Tech Stack:** TypeScript, Electron utilityProcess RPC (`src/shared/plugins/rpc.ts`), vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-watch-plugin-design.md` (PR 1 section).

**Branch:** `watch-plugin/phase-1-api-extensions` (already created; spec committed).

**Environment notes:**
- Worktree has a symlinked `node_modules` (from `~/git/manifold`). Four editor suites fail locally with "Denied ID" `pdf.worker?url` — known local artifact, green on CI. Establish a baseline before changes.
- `npm run typecheck` is a no-op; use `npm run typecheck:web` (baseline 53 errors) and `npm run typecheck:node` (baseline 21 errors).
- Run single test files with `npx vitest run <path>`.

---

### Task 1: Capability enum — `agent:spawn` + `transcription:read`

**Files:**
- Modify: `src/shared/plugins/manifest.ts:7,14`
- Test: `src/main/plugins/manifest.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the capabilities describe-block in `src/main/plugins/manifest.test.ts` (match surrounding style; the file already has cases like `accepts known capabilities`):

```ts
it('accepts the agent:spawn and transcription:read capabilities', () => {
  const r = parseManifest({
    name: 'watch', publisher: 'manifold', version: '0.0.1',
    engines: { manifold: '^0.3.0' },
    capabilities: ['agent:spawn', 'transcription:read'],
  })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.manifest.capabilities).toEqual(['agent:spawn', 'transcription:read'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/plugins/manifest.test.ts`
Expected: FAIL — `unknown capability "agent:spawn"`.

- [ ] **Step 3: Extend the enum**

In `src/shared/plugins/manifest.ts` replace lines 7 and 14:

```ts
export const CAPABILITIES = ['storage', 'workspace:read', 'configuration', 'agent:control', 'agent:spawn', 'lm', 'transcription:read'] as const
```

```ts
export const BUILTIN_ONLY_CAPABILITIES = ['agent:control', 'agent:spawn', 'lm', 'transcription:read'] as const satisfies readonly Capability[]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/main/plugins/manifest.test.ts src/plugin-host/gated-api.test.ts`
Expected: PASS (gated-api tests confirm no regression in existing gating).

- [ ] **Step 5: Commit**

```bash
git add src/shared/plugins/manifest.ts src/main/plugins/manifest.test.ts
git commit -m "feat(plugins): add agent:spawn and transcription:read capabilities (builtin-only)"
```

---

### Task 2: Move `AiServiceSettings` to the plugin API types

**Files:**
- Modify: `src/shared/plugins/api-types.ts` (add types)
- Modify: `src/shared/watch-types.ts:1-16` (re-export)

- [ ] **Step 1: Add the types to `src/shared/plugins/api-types.ts`** (after the `LanguageModelChat` block, before `WorkspaceFolder`):

```ts
/** App-level AI-service settings (transcription + chat keys), shared with core
 *  consumers (settings UI, verdict-recorder, prompt-summarizer). Exposed to
 *  built-in plugins via `manifold.transcription` (gated by `transcription:read`). */
export type AiServiceProvider = 'openai' | 'azure' | 'none'

export interface AiServiceSettings {
  provider: AiServiceProvider
  openaiApiKey?: string
  azureApiKey?: string
  azureEndpoint?: string
  azureDeployment?: string          // transcription deployment (existing)
  chatModel?: string                // text/chat model (default 'gpt-5.1')
  azureChatDeployment?: string      // Azure chat deployment (no default)
}
```

- [ ] **Step 2: Replace the definition in `src/shared/watch-types.ts`**

Replace lines 1–16 (the `AiServiceProvider`/`AiServiceSettings` definitions and deprecated aliases) with:

```ts
import type { AiServiceProvider, AiServiceSettings } from './plugins/api-types'

export type { AiServiceProvider, AiServiceSettings } from './plugins/api-types'

/** @deprecated Use AiServiceSettings. Kept as alias during migration. */
export type TranscriptionSettings = AiServiceSettings
/** @deprecated Use AiServiceProvider. */
export type TranscriptionProvider = AiServiceProvider
```

- [ ] **Step 3: Verify typecheck is at baseline**

Run: `npm run typecheck:web 2>&1 | tail -3 && npm run typecheck:node 2>&1 | tail -3`
Expected: web ≤ 53 errors, node ≤ 21 errors — same counts as the pre-change baseline (every existing import of `AiServiceSettings`/`TranscriptionSettings` from `shared/watch-types` still resolves via the re-export).

- [ ] **Step 4: Commit**

```bash
git add src/shared/plugins/api-types.ts src/shared/watch-types.ts
git commit -m "refactor(shared): re-home AiServiceSettings to plugin api-types"
```

---

### Task 3: Main-side `AgentSpawnService`

**Files:**
- Create: `src/main/plugins/agent-spawn-service.ts`
- Test: `src/main/plugins/agent-spawn-service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/plugins/agent-spawn-service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createAgentSpawnService } from './agent-spawn-service'

function fakeSm(overrides: Record<string, unknown> = {}): {
  createSession: ReturnType<typeof vi.fn>
  killSession: ReturnType<typeof vi.fn>
  sendInput: ReturnType<typeof vi.fn>
  getSession: ReturnType<typeof vi.fn>
} {
  return {
    createSession: vi.fn(async (opts: unknown) => ({ id: 'sib-1', ...(opts as object) })),
    killSession: vi.fn(async () => undefined),
    sendInput: vi.fn(),
    getSession: vi.fn(() => ({
      id: 'base-1', projectId: 'p1', runtimeId: 'claude',
      worktreePath: '/wt/base', status: 'waiting',
    })),
    ...overrides,
  }
}

describe('createAgentSpawnService', () => {
  it('spawnSibling derives project/runtime/worktree from the base session', async () => {
    const sm = fakeSm()
    const svc = createAgentSpawnService(sm as never)
    const res = await svc.spawnSibling('base-1', { title: 'Watching: intro', groupId: 'run-1' })
    expect(res).toEqual({ sessionId: 'sib-1' })
    expect(sm.createSession).toHaveBeenCalledWith({
      projectId: 'p1', runtimeId: 'claude', prompt: 'Watching: intro',
      existingWorktreePath: '/wt/base', groupId: 'run-1',
    })
  })

  it('spawnSibling rejects when the base session does not exist', async () => {
    const sm = fakeSm({ getSession: vi.fn(() => undefined) })
    const svc = createAgentSpawnService(sm as never)
    await expect(svc.spawnSibling('nope')).rejects.toThrow('no session nope')
  })

  it('sendText passes raw input through to the session manager', () => {
    const sm = fakeSm()
    const svc = createAgentSpawnService(sm as never)
    svc.sendText('sib-1', '/watch:watch "/work" question')
    expect(sm.sendInput).toHaveBeenCalledWith('sib-1', '/watch:watch "/work" question')
  })

  it('whenReady resolves true once the session status is waiting', async () => {
    let calls = 0
    const sm = fakeSm({
      getSession: vi.fn(() => ({ status: ++calls >= 3 ? 'waiting' : 'running' })),
    })
    const svc = createAgentSpawnService(sm as never, { sleep: async () => undefined })
    await expect(svc.whenReady('sib-1', 30_000)).resolves.toBe(true)
    expect(calls).toBe(3)
  })

  it('whenReady resolves false on timeout', async () => {
    let t = 0
    const sm = fakeSm({ getSession: vi.fn(() => ({ status: 'running' })) })
    const svc = createAgentSpawnService(sm as never, {
      sleep: async () => undefined,
      now: () => (t += 200),
    })
    await expect(svc.whenReady('sib-1', 1_000)).resolves.toBe(false)
  })

  it('whenReady resolves false when the session disappears', async () => {
    const sm = fakeSm({ getSession: vi.fn(() => undefined) })
    const svc = createAgentSpawnService(sm as never, { sleep: async () => undefined })
    await expect(svc.whenReady('gone', 1_000)).resolves.toBe(false)
  })

  it('getStatus maps a missing session to "missing"', () => {
    const sm = fakeSm({ getSession: vi.fn(() => undefined) })
    const svc = createAgentSpawnService(sm as never)
    expect(svc.getStatus('gone')).toBe('missing')
  })

  it('getStatus passes live statuses through', () => {
    const sm = fakeSm()
    const svc = createAgentSpawnService(sm as never)
    expect(svc.getStatus('base-1')).toBe('waiting')
  })

  it('kill delegates to killSession', async () => {
    const sm = fakeSm()
    const svc = createAgentSpawnService(sm as never)
    await svc.kill('sib-1')
    expect(sm.killSession).toHaveBeenCalledWith('sib-1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/plugins/agent-spawn-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/plugins/agent-spawn-service.ts`**

```ts
// src/main/plugins/agent-spawn-service.ts
// Main-side service backing the builtin-only `agent:spawn` capability: spawn a
// sibling agent session next to a base session and drive its PTY with raw input.
// Mirrors what src/main/watch/playlist-runner.ts does today; the watch plugin
// calls this surface via manifold.agents instead of SessionManager directly.
import type { SessionManager } from '../session/session-manager'

type SessionAccess = Pick<SessionManager, 'createSession' | 'killSession' | 'sendInput' | 'getSession'>

const READY_POLL_MS = 250
const DEFAULT_READY_TIMEOUT_MS = 30_000

/** AgentStatus plus 'missing' for a session that no longer exists. */
export type SpawnedSessionStatus = 'running' | 'waiting' | 'done' | 'error' | 'missing'

export interface AgentSpawnService {
  spawnSibling(baseSessionId: string, opts?: { title?: string; groupId?: string }): Promise<{ sessionId: string }>
  sendText(sessionId: string, text: string): void
  /** Resolve true once the session's TUI prompt is rendered (status 'waiting');
   *  false on timeout or if the session disappears. Callers may proceed on false
   *  (matching the watch playlist-runner's non-fatal ready timeout). */
  whenReady(sessionId: string, timeoutMs?: number): Promise<boolean>
  getStatus(sessionId: string): SpawnedSessionStatus
  kill(sessionId: string): Promise<void>
}

export interface AgentSpawnServiceOptions {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export function createAgentSpawnService(sm: SessionAccess, options: AgentSpawnServiceOptions = {}): AgentSpawnService {
  const now = options.now ?? ((): number => Date.now())
  const sleep = options.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)))

  return {
    async spawnSibling(baseSessionId, opts) {
      const base = sm.getSession(baseSessionId)
      if (!base) throw new Error(`no session ${baseSessionId}`)
      const sibling = await sm.createSession({
        projectId: base.projectId,
        runtimeId: base.runtimeId,
        prompt: opts?.title ?? 'Plugin agent',
        existingWorktreePath: base.worktreePath,
        groupId: opts?.groupId,
      })
      return { sessionId: sibling.id }
    },
    sendText(sessionId, text) {
      sm.sendInput(sessionId, text)
    },
    async whenReady(sessionId, timeoutMs = DEFAULT_READY_TIMEOUT_MS) {
      const deadline = now() + timeoutMs
      while (now() < deadline) {
        const s = sm.getSession(sessionId)
        if (!s) return false
        if (s.status === 'waiting') return true
        await sleep(READY_POLL_MS)
      }
      return false
    },
    getStatus(sessionId) {
      return sm.getSession(sessionId)?.status ?? 'missing'
    },
    async kill(sessionId) {
      await sm.killSession(sessionId)
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/plugins/agent-spawn-service.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/plugins/agent-spawn-service.ts src/main/plugins/agent-spawn-service.test.ts
git commit -m "feat(plugins): main-side AgentSpawnService for sibling-session control"
```

---

### Task 4: ExtensionHost wiring — HOST_AGENTS extension, HOST_TRANSCRIPTION, reveal push

**Files:**
- Modify: `src/shared/plugins/rpc.ts:27` (new service constant)
- Modify: `src/main/plugins/extension-host.ts` (constructor, services)
- Modify: `src/main/plugins/plugin-manager.ts:53-58` (construction + resolver)
- Test: `src/main/plugins/extension-host.test.ts` (construction helper + new cases)

- [ ] **Step 1: Add the RPC constant**

In `src/shared/plugins/rpc.ts` after the `HOST_LM` line (line 27):

```ts
export const HOST_TRANSCRIPTION = 'HostTranscription' // main, called by host (read app AI-service settings)
```

- [ ] **Step 2: Write the failing tests**

In `src/main/plugins/extension-host.test.ts`, first update the construction helper at line 89 to thread an `agentSpawn` fake (4th constructor argument, before `now`):

```ts
  return new ExtensionHost(
    { get: vi.fn(), update: vi.fn() },
    agentControl as never,
    lm as never,
    agentSpawn as never,
    now,
  ) as unknown as HostForTest
```

Add an `agentSpawn` fake next to the existing `agentControl`/`lm` fakes (match the file's existing fake style and threading — the helper takes them as parameters or module-level consts; mirror exactly how `agentControl` is provided), e.g.:

```ts
const agentSpawn = {
  spawnSibling: vi.fn(async () => ({ sessionId: 'sib-1' })),
  sendText: vi.fn(),
  whenReady: vi.fn(async () => true),
  getStatus: vi.fn(() => 'waiting'),
  kill: vi.fn(async () => undefined),
}
```

Then add test cases following the file's existing HOST_AGENTS `$runTurn` gating tests (same fake-child RPC-call pattern — copy the structure of the existing `$runTurn` builtin/non-builtin cases and adjust method + args):

1. `$spawnSibling` from a **builtin** plugin id → delegates to `agentSpawn.spawnSibling` and replies `{ sessionId: 'sib-1' }`.
2. `$spawnSibling` from a **non-builtin** plugin id → rejects with `"agent:spawn" is restricted to built-in plugins`.
3. `$reveal` from a builtin plugin id → calls the `send` function with `('plugins:reveal-session', 'sess-9', 'My title')`.
4. `HostTranscription.$get` from a builtin plugin id → returns the resolver value (set a resolver returning `{ provider: 'openai', openaiApiKey: 'k' }`).
5. `HostTranscription.$get` from a non-builtin plugin id → rejects with `"transcription:read" is restricted to built-in plugins`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/main/plugins/extension-host.test.ts`
Expected: FAIL — constructor arity / unknown service methods.

- [ ] **Step 4: Implement the wiring in `src/main/plugins/extension-host.ts`**

Imports (top of file): add `HOST_TRANSCRIPTION` to the rpc import list; add:

```ts
import type { AgentSpawnService } from './agent-spawn-service'
import type { AiServiceSettings } from '../../shared/plugins/api-types'
```

Constructor (line 51) — add the 4th parameter:

```ts
  constructor(
    private readonly storage: PluginStorageStore,
    private readonly agentControl: AgentControlService,
    private readonly lm: LmService,
    private readonly agentSpawn: AgentSpawnService,
    now: () => number = () => Date.now(),
  ) {
    this.now = now
  }
```

Field + setter (next to `getConfig`/`setConfigResolver`, lines 41/60):

```ts
  private getTranscription: (() => AiServiceSettings | undefined) | null = null
```

```ts
  setTranscriptionResolver(fn: () => AiServiceSettings | undefined): void { this.getTranscription = fn }
```

Extend the `HOST_AGENTS` registration (line 160) — keep `$runTurn`/`$cancelTurn` as-is and add:

```ts
      $spawnSibling: (pluginId: string, baseSessionId: string, opts: { title?: string; groupId?: string } | undefined) => { this.assertBuiltin(pluginId, 'agent:spawn'); return this.agentSpawn.spawnSibling(baseSessionId, opts) },
      $sendText: (pluginId: string, sessionId: string, text: string) => { this.assertBuiltin(pluginId, 'agent:spawn'); this.agentSpawn.sendText(sessionId, text) },
      $whenReady: (pluginId: string, sessionId: string, timeoutMs: number | undefined) => { this.assertBuiltin(pluginId, 'agent:spawn'); return this.agentSpawn.whenReady(sessionId, timeoutMs) },
      $getStatus: (pluginId: string, sessionId: string) => { this.assertBuiltin(pluginId, 'agent:spawn'); return this.agentSpawn.getStatus(sessionId) },
      $kill: (pluginId: string, sessionId: string) => { this.assertBuiltin(pluginId, 'agent:spawn'); return this.agentSpawn.kill(sessionId) },
      $reveal: (pluginId: string, sessionId: string, title: string | undefined) => { this.assertBuiltin(pluginId, 'agent:spawn'); this.send?.('plugins:reveal-session', sessionId, title) },
```

Register the new service after the `HOST_LM` registration (line 167):

```ts
    endpoint.registerService(HOST_TRANSCRIPTION, {
      $get: (pluginId: string) => { this.assertBuiltin(pluginId, 'transcription:read'); return this.getTranscription?.() },
    })
```

- [ ] **Step 5: Wire construction in `src/main/plugins/plugin-manager.ts`**

Import: `import { createAgentSpawnService } from './agent-spawn-service'`. In the constructor (lines 53–58):

```ts
    const agentControl = createAgentControlService(this.sessionManager)
    const lm = createLmService(this.sessionManager, gitOps)
    const agentSpawn = createAgentSpawnService(this.sessionManager)
    this.host = new ExtensionHost(new PluginStorageStore(storagePath), agentControl, lm, agentSpawn)
    this.host.setConfigResolver((id, key) => this.getConfigValue(id, key))
    this.host.setEnabledResolver((id) => this.isEnabled(id))
    this.host.setOriginResolver((id) => this.plugins.find((p) => p.id === id)?.origin)
    this.host.setTranscriptionResolver(() => this.settings.getSettings().transcription)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/main/plugins/extension-host.test.ts src/main/plugins/extension-host-gated-integration.test.ts src/main/plugins/plugin-manager.test.ts`
Expected: PASS (fix any other `new ExtensionHost(` call sites the run surfaces — `git grep -n "new ExtensionHost"` to confirm only plugin-manager.ts and the test helper).

- [ ] **Step 7: Commit**

```bash
git add src/shared/plugins/rpc.ts src/main/plugins/extension-host.ts src/main/plugins/extension-host.test.ts src/main/plugins/plugin-manager.ts
git commit -m "feat(plugins): wire agent:spawn + transcription:read services into ExtensionHost"
```

---

### Task 5: Host-side API — `manifold.agents` spawn surface + `manifold.transcription`

**Files:**
- Modify: `src/shared/plugins/api-types.ts` (AgentSession + ManifoldApi)
- Modify: `src/plugin-host/agents-api.ts`
- Create: `src/plugin-host/transcription-api.ts`
- Modify: `src/plugin-host/gated-api.ts`
- Modify: `src/plugin-host/index.ts:71-80`
- Test: `src/plugin-host/gated-api.test.ts`, `src/plugin-host/agents-api.test.ts` (create)

- [ ] **Step 1: Extend the API types in `src/shared/plugins/api-types.ts`**

Add next to `TurnOutcome` (line 14):

```ts
/** Live status of a (possibly spawned) agent session; 'missing' = no such session. */
export type SpawnedSessionStatus = 'running' | 'waiting' | 'done' | 'error' | 'missing'
```

Replace the `AgentSession` interface (lines 18–26):

```ts
/** A live agent session a built-in plugin can drive. VS Code has no agent-turn
 *  concept, so this is Manifold-specific. `runTurn` is gated by `agent:control`;
 *  the raw-PTY methods (sendText/whenReady/getStatus/kill/reveal) by `agent:spawn`. */
export interface AgentSession {
  readonly sessionId: string
  /** [agent:control] Send a prompt to the live agent and resolve when its turn ends. */
  runTurn(
    prompt: string,
    opts?: { budgetSeconds?: number; clearContext?: boolean },
    token?: CancellationToken,
  ): Promise<TurnOutcome>
  /** [agent:spawn] Raw PTY input passthrough; the caller owns typing rhythm
   *  (text, delay, then '\r'). */
  sendText(text: string): Promise<void>
  /** [agent:spawn] True once the TUI prompt is rendered (status 'waiting');
   *  false on timeout/missing — callers may proceed (non-fatal). */
  whenReady(timeoutMs?: number): Promise<boolean>
  /** [agent:spawn] */
  getStatus(): Promise<SpawnedSessionStatus>
  /** [agent:spawn] Best-effort session kill. */
  kill(): Promise<void>
  /** [agent:spawn] Ask the app to open this session's panel in the dock. */
  reveal(title?: string): Promise<void>
}
```

Replace the `agents` member of `ManifoldApi` (lines 113–116):

```ts
  agents: {
    readonly activeAgent: AgentSession | undefined
    getAgent(sessionId: string): AgentSession | undefined
    /** [agent:spawn] Spawn a sibling session sharing the base session's
     *  project/runtime/worktree (derived main-side). */
    spawnSibling(baseSessionId: string, opts?: { title?: string; groupId?: string }): Promise<AgentSession>
  }
```

Add a `transcription` member to `ManifoldApi` after `lm` (line 122):

```ts
  transcription: {
    /** [transcription:read] App-level AI-service settings (undefined when unconfigured). */
    get(): Promise<AiServiceSettings | undefined>
  }
```

(`AiServiceSettings` is defined in this same file since Task 2.)

- [ ] **Step 2: Write the failing host-side tests**

Create `src/plugin-host/agents-api.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createAgentsApi } from './agents-api'
import { CapabilityError } from './gated-api'

function makeEndpoint(): { proxy: Record<string, ReturnType<typeof vi.fn>>; endpoint: { getProxy: () => unknown } } {
  const proxy = {
    $runTurn: vi.fn(async () => 'ended'),
    $cancelTurn: vi.fn(async () => undefined),
    $spawnSibling: vi.fn(async () => ({ sessionId: 'sib-1' })),
    $sendText: vi.fn(async () => undefined),
    $whenReady: vi.fn(async () => true),
    $getStatus: vi.fn(async () => 'waiting'),
    $kill: vi.fn(async () => undefined),
    $reveal: vi.fn(async () => undefined),
  }
  return { proxy, endpoint: { getProxy: () => proxy } }
}

const workspace = { activeSessionId: 'active-1' }

describe('createAgentsApi capability split', () => {
  it('spawnSibling threads pluginId and returns a full AgentSession', async () => {
    const { proxy, endpoint } = makeEndpoint()
    const api = createAgentsApi(endpoint as never, workspace as never, 'manifold.watch', new Set(['agent:spawn']))
    const agent = await api.spawnSibling('base-1', { title: 'T', groupId: 'g' })
    expect(proxy.$spawnSibling).toHaveBeenCalledWith('manifold.watch', 'base-1', { title: 'T', groupId: 'g' })
    expect(agent.sessionId).toBe('sib-1')
    await agent.sendText('hello')
    expect(proxy.$sendText).toHaveBeenCalledWith('manifold.watch', 'sib-1', 'hello')
    await expect(agent.whenReady(5_000)).resolves.toBe(true)
    await expect(agent.getStatus()).resolves.toBe('waiting')
    await agent.reveal('Title')
    expect(proxy.$reveal).toHaveBeenCalledWith('manifold.watch', 'sib-1', 'Title')
    await agent.kill()
    expect(proxy.$kill).toHaveBeenCalledWith('manifold.watch', 'sib-1')
  })

  it('spawnSibling throws CapabilityError without agent:spawn', async () => {
    const { endpoint } = makeEndpoint()
    const api = createAgentsApi(endpoint as never, workspace as never, 'manifold.loop', new Set(['agent:control']))
    await expect(api.spawnSibling('base-1')).rejects.toThrow(CapabilityError)
  })

  it('runTurn throws CapabilityError without agent:control', async () => {
    const { endpoint } = makeEndpoint()
    const api = createAgentsApi(endpoint as never, workspace as never, 'manifold.watch', new Set(['agent:spawn']))
    const agent = api.getAgent('s-1')
    expect(agent).toBeDefined()
    await expect(agent!.runTurn('hi')).rejects.toThrow(CapabilityError)
  })

  it('sendText throws CapabilityError without agent:spawn', async () => {
    const { endpoint } = makeEndpoint()
    const api = createAgentsApi(endpoint as never, workspace as never, 'manifold.loop', new Set(['agent:control']))
    const agent = api.getAgent('s-1')
    await expect(agent!.sendText('x')).rejects.toThrow(CapabilityError)
  })
})
```

In `src/plugin-host/gated-api.test.ts`, add cases following the existing per-namespace gating tests (copy the structure used for `agents`/`lm` — fake factories, `buildGatedApi([...caps], origin, shared, factories)`):

1. `agents` getter is reachable with **only** `agent:spawn` (no `agent:control`).
2. `agents` getter still reachable with only `agent:control` (regression).
3. `agents` getter throws `CapabilityError` with neither.
4. `agents` getter throws `RestrictedCapabilityError` for `origin: 'user'` with `agent:spawn`.
5. `transcription` getter requires `transcription:read`; restricted for non-builtin; reachable for builtin.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/plugin-host/agents-api.test.ts src/plugin-host/gated-api.test.ts`
Expected: FAIL — signatures/namespaces missing.

- [ ] **Step 4: Implement**

Rewrite `src/plugin-host/agents-api.ts`:

```ts
// src/plugin-host/agents-api.ts
import { HOST_AGENTS, type RpcEndpoint } from '../shared/plugins/rpc'
import type { AgentSession, CancellationToken, ManifoldApi, SpawnedSessionStatus, TurnOutcome } from '../shared/plugins/api-types'
import type { Capability } from '../shared/plugins/manifest'
import { CapabilityError } from './gated-api'
import type { WorkspaceContext } from './workspace-api'

interface HostAgentsProxy {
  $runTurn(pluginId: string, sessionId: string, prompt: string, opts: { budgetSeconds?: number; clearContext?: boolean } | undefined): Promise<TurnOutcome>
  $cancelTurn(pluginId: string, sessionId: string): Promise<void>
  $spawnSibling(pluginId: string, baseSessionId: string, opts: { title?: string; groupId?: string } | undefined): Promise<{ sessionId: string }>
  $sendText(pluginId: string, sessionId: string, text: string): Promise<void>
  $whenReady(pluginId: string, sessionId: string, timeoutMs: number | undefined): Promise<boolean>
  $getStatus(pluginId: string, sessionId: string): Promise<SpawnedSessionStatus>
  $kill(pluginId: string, sessionId: string): Promise<void>
  $reveal(pluginId: string, sessionId: string, title: string | undefined): Promise<void>
}

/** The namespace gate (gated-api) admits callers holding either `agent:control`
 *  or `agent:spawn`; each method re-checks its own capability here so a plugin
 *  holding only one of the two can't reach the other's surface. The main side
 *  independently re-validates builtin origin per method (see ExtensionHost). */
export function createAgentsApi(
  endpoint: RpcEndpoint,
  workspace: WorkspaceContext,
  pluginId: string,
  caps: ReadonlySet<Capability>,
): ManifoldApi['agents'] {
  const host = endpoint.getProxy<HostAgentsProxy>(HOST_AGENTS)
  function requireCap(cap: Capability): void {
    if (!caps.has(cap)) throw new CapabilityError(cap)
  }
  const makeAgent = (sessionId: string): AgentSession | undefined => {
    if (!sessionId) return undefined
    return {
      sessionId,
      async runTurn(prompt, opts, token?: CancellationToken): Promise<TurnOutcome> {
        requireCap('agent:control')
        const sub = token?.onCancellationRequested(() => { void host.$cancelTurn(pluginId, sessionId) })
        try {
          return await host.$runTurn(pluginId, sessionId, prompt, opts)
        } finally {
          sub?.dispose()
        }
      },
      async sendText(text: string): Promise<void> {
        requireCap('agent:spawn')
        await host.$sendText(pluginId, sessionId, text)
      },
      whenReady(timeoutMs?: number): Promise<boolean> {
        requireCap('agent:spawn')
        return host.$whenReady(pluginId, sessionId, timeoutMs)
      },
      getStatus(): Promise<SpawnedSessionStatus> {
        requireCap('agent:spawn')
        return host.$getStatus(pluginId, sessionId)
      },
      async kill(): Promise<void> {
        requireCap('agent:spawn')
        await host.$kill(pluginId, sessionId)
      },
      async reveal(title?: string): Promise<void> {
        requireCap('agent:spawn')
        await host.$reveal(pluginId, sessionId, title)
      },
    }
  }

  return {
    get activeAgent(): AgentSession | undefined {
      const sessionId = workspace.activeSessionId
      return sessionId ? makeAgent(sessionId) : undefined
    },
    getAgent(sessionId: string): AgentSession | undefined {
      return makeAgent(sessionId)
    },
    async spawnSibling(baseSessionId, opts): Promise<AgentSession> {
      requireCap('agent:spawn')
      const { sessionId } = await host.$spawnSibling(pluginId, baseSessionId, opts)
      const agent = makeAgent(sessionId)
      if (!agent) throw new Error('spawnSibling returned an empty session id')
      return agent
    },
  }
}
```

Create `src/plugin-host/transcription-api.ts`:

```ts
// src/plugin-host/transcription-api.ts
import { HOST_TRANSCRIPTION, type RpcEndpoint } from '../shared/plugins/rpc'
import type { AiServiceSettings, ManifoldApi } from '../shared/plugins/api-types'

interface HostTranscriptionProxy {
  $get(pluginId: string): Promise<AiServiceSettings | undefined>
}

export function createTranscriptionApi(endpoint: RpcEndpoint, pluginId: string): ManifoldApi['transcription'] {
  const host = endpoint.getProxy<HostTranscriptionProxy>(HOST_TRANSCRIPTION)
  return {
    get: () => host.$get(pluginId),
  }
}
```

In `src/plugin-host/gated-api.ts`:

```ts
export interface GatedFactories {
  storage: () => ManifoldApi['storage']
  workspace: () => ManifoldApi['workspace']
  configuration: () => ManifoldApi['configuration']
  agents: (caps: ReadonlySet<Capability>) => ManifoldApi['agents']
  lm: () => ManifoldApi['lm']
  transcription: () => ManifoldApi['transcription']
}
```

and in `buildGatedApi`'s returned object:

```ts
    // The agents namespace is shared by two capabilities: `agent:control` (runTurn)
    // and `agent:spawn` (sibling spawn + raw PTY). Either admits the namespace; the
    // factory receives the declared caps so each method re-checks its own.
    get agents(): ManifoldApi['agents'] {
      if (!caps.has('agent:control') && !caps.has('agent:spawn')) throw new CapabilityError('agent:control')
      if (caps.has('agent:control')) requireCap('agent:control')
      if (caps.has('agent:spawn')) requireCap('agent:spawn')
      return factories.agents(caps)
    },
    get lm(): ManifoldApi['lm'] { requireCap('lm'); return factories.lm() },
    get transcription(): ManifoldApi['transcription'] { requireCap('transcription:read'); return factories.transcription() },
```

In `src/plugin-host/index.ts` (lines 71–80), update the factory wiring:

```ts
  const manifold = buildGatedApi(t.capabilities ?? [], t.origin ?? 'user', { commands: makeCommandsApi(t.id), window: windowApi }, {
    storage: () => createStorageApi(endpoint, t.id),
    workspace: () => workspaceContext.makeApi(),
    configuration: () => configContext.makeApi(endpoint, t.id),
    // Bind the privileged agent/lm/transcription RPCs to this plugin's id so the
    // main side can re-validate the caller's origin at the trust boundary (a
    // host-local gate is not authoritative — the plugin shares this process).
    agents: (caps) => createAgentsApi(endpoint, workspaceContext, t.id, caps),
    lm: () => createLmApi(endpoint, workspaceContext, t.id),
    transcription: () => createTranscriptionApi(endpoint, t.id),
  })
```

with `import { createTranscriptionApi } from './transcription-api'` added to the imports.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/plugin-host/`
Expected: PASS (including pre-existing gated-api, privileged-api-rpc, activator suites).

- [ ] **Step 6: Commit**

```bash
git add src/shared/plugins/api-types.ts src/plugin-host/agents-api.ts src/plugin-host/agents-api.test.ts src/plugin-host/transcription-api.ts src/plugin-host/gated-api.ts src/plugin-host/gated-api.test.ts src/plugin-host/index.ts
git commit -m "feat(plugins): manifold.agents spawn surface + manifold.transcription namespace"
```

---

### Task 6: Manifest `frameSources` validation

**Files:**
- Modify: `src/shared/plugins/manifest.ts:19-30` (view contribution type)
- Modify: `src/main/plugins/manifest.ts:56-71` (parser)
- Test: `src/main/plugins/manifest.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/main/plugins/manifest.test.ts` (views describe-block):

```ts
const base = {
  name: 'watch', publisher: 'manifold', version: '0.0.1',
  engines: { manifold: '^0.3.0' },
}

it('accepts view frameSources that are exact https origins', () => {
  const r = parseManifest({
    ...base,
    contributes: { views: [{ id: 'v1', title: 'V', frameSources: ['https://www.youtube.com'] }] },
  })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.manifest.contributes?.views?.[0].frameSources).toEqual(['https://www.youtube.com'])
})

it.each([
  ['http origin', 'http://www.youtube.com'],
  ['path suffix', 'https://www.youtube.com/embed'],
  ['trailing slash', 'https://www.youtube.com/'],
  ['wildcard', 'https://*.youtube.com'],
  ['not a url', 'youtube.com'],
])('rejects frameSources entry: %s', (_label, src) => {
  const r = parseManifest({
    ...base,
    contributes: { views: [{ id: 'v1', title: 'V', frameSources: [src] }] },
  })
  expect(r.ok).toBe(false)
})

it('rejects non-array frameSources', () => {
  const r = parseManifest({
    ...base,
    contributes: { views: [{ id: 'v1', title: 'V', frameSources: 'https://www.youtube.com' }] },
  })
  expect(r.ok).toBe(false)
})

it('omits frameSources when not declared', () => {
  const r = parseManifest({ ...base, contributes: { views: [{ id: 'v1', title: 'V' }] } })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.manifest.contributes?.views?.[0].frameSources).toBeUndefined()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/plugins/manifest.test.ts`
Expected: FAIL — `frameSources` dropped by the parser (`toEqual` mismatch) and invalid entries not rejected.

- [ ] **Step 3: Implement**

`src/shared/plugins/manifest.ts` — add to `PluginViewContribution` (after `type`, line 29):

```ts
  /** Exact https origins this view's webview may embed in iframes (CSP frame-src).
   *  Omitted/empty = no frames allowed (the default CSP). */
  frameSources?: string[]
```

`src/main/plugins/manifest.ts` — above `parseManifest`, add:

```ts
/** frameSources entries widen the webview CSP, so they are validated strictly:
 *  each must be exactly an https origin (no path, query, wildcard, or trailing
 *  slash) — `new URL(v).origin === v` rejects every other shape. */
function isHttpsOrigin(value: string): boolean {
  let url: URL
  try { url = new URL(value) } catch { return false }
  return url.protocol === 'https:' && url.origin === value
}
```

Inside the views loop (after the `title` check, line 62), add:

```ts
      let frameSources: string[] | undefined
      if (view.frameSources !== undefined) {
        if (!Array.isArray(view.frameSources)) return { ok: false, error: `view "${String(view.id)}" "frameSources" must be an array` }
        for (const src of view.frameSources) {
          if (typeof src !== 'string' || !isHttpsOrigin(src)) {
            return { ok: false, error: `view "${String(view.id)}" invalid frameSources entry ${JSON.stringify(src)} (must be exactly an https:// origin)` }
          }
        }
        frameSources = view.frameSources as string[]
      }
```

and extend the pushed object:

```ts
      views.push({
        id: view.id,
        title: view.title,
        description: typeof view.description === 'string' ? view.description : undefined,
        launcher: typeof view.launcher === 'boolean' ? view.launcher : undefined,
        type: view.type === 'tree' || view.type === 'webview' ? view.type : undefined,
        frameSources,
      })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/plugins/manifest.test.ts src/main/plugins/scanner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/plugins/manifest.ts src/main/plugins/manifest.ts src/main/plugins/manifest.test.ts
git commit -m "feat(plugins): validate per-view frameSources in the manifest"
```

---

### Task 7: frameSources → CSP flow

**Files:**
- Modify: `src/main/plugins/webview-content-store.ts`
- Modify: `src/main/plugins/webview-protocol.ts:100-110,133-140`
- Modify: `src/main/plugins/plugin-manager.ts` (`scan()`)
- Test: `src/main/plugins/webview-protocol.test.ts`, `src/main/plugins/plugin-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/main/plugins/webview-protocol.test.ts` (follow the existing `buildCsp`/`renderWebviewResponse` test style):

```ts
it('buildCsp without frame sources matches the strict default (no frame-src)', () => {
  const csp = buildCsp('abc')
  expect(csp).not.toContain('frame-src')
  expect(csp).toContain("default-src 'none'")
})

it('buildCsp appends frame-src for declared origins', () => {
  const csp = buildCsp('abc', ['https://www.youtube.com', 'https://player.vimeo.com'])
  expect(csp).toContain('frame-src https://www.youtube.com https://player.vimeo.com')
})

it('renderWebviewResponse serves a frame-src CSP only for views with registered frame sources', () => {
  const store = new WebviewContentStore()
  store.set('with-frames', '<html></html>')
  store.set('plain', '<html></html>')
  store.setFrameSources('with-frames', ['https://www.youtube.com'])
  const withFrames = renderWebviewResponse(store, 'manifold-webview://view/with-frames?v=1')
  const plain = renderWebviewResponse(store, 'manifold-webview://view/plain?v=1')
  expect(withFrames.csp).toContain('frame-src https://www.youtube.com')
  expect(plain.csp).not.toContain('frame-src')
})
```

In `src/main/plugins/plugin-manager.test.ts`, add a case (follow the file's existing scan/fixture pattern — it builds plugin dirs on disk or stubs `scanPluginDir`; mirror that setup) asserting that after `scan()`, `webviewContentStore.getFrameSources('<view id>')` returns the manifest's `frameSources` for a view that declares them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/plugins/webview-protocol.test.ts src/main/plugins/plugin-manager.test.ts`
Expected: FAIL — `setFrameSources`/`getFrameSources` missing; `buildCsp` arity.

- [ ] **Step 3: Implement**

`src/main/plugins/webview-content-store.ts`:

```ts
// src/main/plugins/webview-content-store.ts
/** Holds the current HTML for each plugin webview, keyed by view id.
 *  Written by the extension host ($setHtml); read by the manifold-webview protocol handler.
 *  Also carries each view's manifest-declared frameSources (registered at plugin scan)
 *  so the protocol handler can widen the CSP frame-src for exactly that view. */
export class WebviewContentStore {
  private readonly html = new Map<string, string>()
  private readonly frameSources = new Map<string, string[]>()
  private version = 0

  set(viewId: string, html: string): number {
    this.html.set(viewId, html)
    return ++this.version
  }
  get(viewId: string): string | undefined { return this.html.get(viewId) }
  delete(viewId: string): void { this.html.delete(viewId) }

  setFrameSources(viewId: string, sources: string[]): void {
    if (sources.length > 0) this.frameSources.set(viewId, [...sources])
    else this.frameSources.delete(viewId)
  }
  getFrameSources(viewId: string): string[] | undefined { return this.frameSources.get(viewId) }
}

export const webviewContentStore = new WebviewContentStore()
```

`src/main/plugins/webview-protocol.ts` — `buildCsp` (line 100):

```ts
/** Restrictive, nonce-gated CSP for plugin webview content. `frameSources` (from the
 *  view's manifest contribution, validated as exact https origins) widens frame-src
 *  for that view only; without it no frames are allowed (default-src 'none'). */
export function buildCsp(nonce: string, frameSources?: readonly string[]): string {
  const directives = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    // 'unsafe-inline' styles are allowed for first-party plugins; revisit (CSS-selector exfil) before untrusted plugins.
    "style-src 'unsafe-inline'",
    "img-src data: blob: https:",
    "font-src data:",
    "connect-src 'none'",
  ]
  if (frameSources !== undefined && frameSources.length > 0) directives.push(`frame-src ${frameSources.join(' ')}`)
  return directives.join('; ')
}
```

and in `renderWebviewResponse` (line 139):

```ts
  return { status: 200, body: injectNonce(html, nonce, viewId), contentType: 'text/html; charset=utf-8', csp: buildCsp(nonce, store.getFrameSources(viewId)) }
```

`src/main/plugins/plugin-manager.ts` — `import { webviewContentStore } from './webview-content-store'` and at the end of `scan()` (after `this.plugins = ...`, before the error logging is fine too — order doesn't matter):

```ts
    // Register manifest-declared frameSources so the manifold-webview protocol can
    // widen CSP frame-src for exactly these views (see webview-protocol buildCsp).
    for (const p of this.plugins) {
      for (const v of p.manifest.contributes?.views ?? []) {
        webviewContentStore.setFrameSources(v.id, v.frameSources ?? [])
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/plugins/webview-protocol.test.ts src/main/plugins/plugin-manager.test.ts src/main/plugins/webview-protocol.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/plugins/webview-content-store.ts src/main/plugins/webview-protocol.ts src/main/plugins/plugin-manager.ts src/main/plugins/webview-protocol.test.ts src/main/plugins/plugin-manager.test.ts
git commit -m "feat(plugins): per-view frame-src CSP from manifest frameSources"
```

---

### Task 8: Renderer reveal wiring — `plugins:reveal-session`

**Files:**
- Modify: `src/preload/index.ts:181-185` (receive whitelist)
- Modify: `src/renderer/hooks/useAppEffects.ts` (listener)
- Test: `src/renderer/hooks/useAppEffects.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/renderer/hooks/useAppEffects.test.ts` (the file already fakes `window.electronAPI.on` and provides a `dockLayout` with `openSiblingPanel: vi.fn()` — follow how the existing `view:toggle-panel` case fires a registered listener):

```ts
it('opens the sibling panel on plugins:reveal-session', () => {
  renderUseAppEffects() // use the file's existing render/setup helper
  fireChannel('plugins:reveal-session', 'sess-42', 'Watching: intro') // file's listener-dispatch helper
  expect(dockLayout.openSiblingPanel).toHaveBeenCalledWith('sess-42', 'Watching: intro')
})

it('ignores reveal events without a session id', () => {
  renderUseAppEffects()
  fireChannel('plugins:reveal-session', undefined, 'x')
  expect(dockLayout.openSiblingPanel).not.toHaveBeenCalled()
})
```

(Adapt helper names to the file's actual setup — keep the two assertions as written.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/hooks/useAppEffects.test.ts`
Expected: FAIL — no listener registered for the channel.

- [ ] **Step 3: Implement**

`src/preload/index.ts` — add to the receive-channel whitelist (after `'plugins:contributions-changed'`, line 185):

```ts
  'plugins:reveal-session',
```

`src/renderer/hooks/useAppEffects.ts` — add next to the existing `view:toggle-panel` effect (line 72):

```ts
  // A plugin asked the app to surface an agent session's panel (manifold.agents
  // AgentSession.reveal — e.g. the watch plugin's "Open agent" button).
  useEffect(() => window.electronAPI.on('plugins:reveal-session', (...args: unknown[]) => {
    const [sessionId, title] = args as [unknown, unknown]
    if (typeof sessionId !== 'string' || sessionId.length === 0) return
    input.dockLayout.openSiblingPanel(sessionId, typeof title === 'string' ? title : undefined)
  }), [input.dockLayout.openSiblingPanel])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/hooks/useAppEffects.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/renderer/hooks/useAppEffects.ts src/renderer/hooks/useAppEffects.test.ts
git commit -m "feat(plugins): renderer handles plugins:reveal-session via openSiblingPanel"
```

---

### Task 9: Architecture docs

**Files:**
- Modify: `docs/architecture/plugins.md`
- Modify: `docs/architecture/plugin-api.md`

- [ ] **Step 1: Update `docs/architecture/plugin-api.md`**

- In the capability/namespace sections: add `agent:spawn` (builtin-only; `manifold.agents.spawnSibling` + `AgentSession.sendText/whenReady/getStatus/kill/reveal`) and `transcription:read` (builtin-only; `manifold.transcription.get()` returning the app-level `AiServiceSettings`). Note the namespace-gate nuance: `agents` admits either `agent:control` or `agent:spawn`, with per-method re-checks in `agents-api.ts`.
- In the contributions section: document `views[].frameSources` (exact https origins; widens that view's CSP `frame-src`).
- Verify every claim against the code written in Tasks 1–8 and cite `file:line`. Bump the page's `updated:` field to 2026-06-11.

- [ ] **Step 2: Update `docs/architecture/plugins.md`**

- Gating section: extend the builtin-only list with `agent:spawn`/`transcription:read`, cite the `assertBuiltin` call sites added in `extension-host.ts`.
- Webview section: describe the frameSources flow (scan → `webviewContentStore.setFrameSources` → `buildCsp` frame-src) with `file:line` cites. Bump `updated:`.

- [ ] **Step 3: Lint**

Run: `bash scripts/wiki-lint.sh`
Expected: no stale-page failures for the two touched pages.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/plugins.md docs/architecture/plugin-api.md
git commit -m "docs: cover agent:spawn, transcription:read, and frameSources in plugin pages"
```

---

### Task 10: Full verification + PR

- [ ] **Step 1: Full test suite**

Run: `npx vitest run 2>&1 | tail -20`
Expected: identical failures to the pre-change baseline only (the 4 known editor-suite "Denied ID pdf.worker?url" local failures); every plugin/preload/renderer-hook suite green.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:web 2>&1 | tail -3 && npm run typecheck:node 2>&1 | tail -3`
Expected: ≤ 53 web / ≤ 21 node errors (baseline; no new errors).

- [ ] **Step 3: Push and create the PR**

```bash
git fsck --no-dangling
git push -u origin watch-plugin/phase-1-api-extensions
gh pr create --title "feat(plugins): agent:spawn + transcription:read capabilities and per-view frameSources CSP" --body "$(cat <<'EOF'
## Summary
Phase 1 of the watch-as-a-plugin conversion (spec: docs/superpowers/specs/2026-06-11-watch-plugin-design.md). Adds the three plugin-system extensions the watch plugin needs — no watch-module changes:

- **`agent:spawn` capability (builtin-only):** `manifold.agents.spawnSibling()` plus `AgentSession.sendText/whenReady/getStatus/kill/reveal`, backed by a new main-side `AgentSpawnService`; `reveal` pushes `plugins:reveal-session` to the renderer which opens the session's dock panel.
- **`transcription:read` capability (builtin-only):** `manifold.transcription.get()` returning the core AI-service settings (keys stay in core's settings store).
- **Per-view `frameSources`:** manifest-declared exact https origins widen that view's webview CSP `frame-src` (default CSP unchanged for all other views).

All three follow the loop Phase-A gating pattern: capability enum → host-side gate → main-side `assertBuiltin` at the trust boundary.

## Test plan
- [ ] New unit tests: agent-spawn-service, agents-api capability split, gated-api namespaces, manifest frameSources validation, CSP rendering, reveal-session renderer wiring
- [ ] Full vitest suite at baseline; typecheck:web/:node at baseline

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** 1a → Tasks 3/4/5/8; 1b → Tasks 1/2/4/5; 1c → Tasks 6/7; tests/docs → Tasks 9/10. The spec's `getStatus` gains an `'error'` member beyond the spec text (`'running'|'waiting'|'done'|'missing'`) — deliberate fidelity to `AgentStatus`; spec updated not needed (superset).
- **Type consistency:** `SpawnedSessionStatus` defined once in api-types (Task 5) and re-derived in agent-spawn-service (Task 3) — the service's local type must stay assignable; both spell `'running' | 'waiting' | 'done' | 'error' | 'missing'`.
- **Placeholders:** Tasks 4 (extension-host tests), 7 (plugin-manager test), 8 (helper names), 9 (docs) intentionally defer to *existing in-file patterns* rather than inventing fixture code that may not match — the executor must read the named test file first and mirror its setup.
