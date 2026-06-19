# Statistics Reset Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Reset button to the Statistics panel that deletes the active project's captured verdicts after a native confirmation dialog.

**Architecture:** Mirror the just-added `window.openExternal` capability. A new builtin-only `verdicts:write` capability exposes `manifold.verdicts.clearProject(projectId)` (plugin-host client → `HOST_VERDICTS.$clearProject` → `VerdictStore.deleteByProject`). The sandboxed webview posts a `reset` message; the statistics host runs the confirmation (`manifold.window.showWarningMessage`) and, on confirm, clears the project and refreshes the panel.

**Tech Stack:** TypeScript, Electron main + plugin-host RPC, React (plugin webview), Vitest.

## Global Constraints

- Token-only colors in styles — `var(--token-name)`, never hardcoded hex (design system).
- `verdicts:write` is builtin-only (added to `BUILTIN_ONLY_CAPABILITIES`); host handlers gate with `assertBuiltin(pluginId, 'verdicts:write')`.
- Stacked on branch `fix-statistics-pr-link-clickable` (PR #785); base for the new PR is `main`.
- Run tests with `npm test -- <path>` (never `npx vitest`).

---

### Task 1: `verdicts:write` capability + `manifold.verdicts.clearProject`

**Files:**
- Modify: `src/shared/plugins/manifest.ts` — add `verdicts:write` to `CAPABILITIES` and `BUILTIN_ONLY_CAPABILITIES`.
- Modify: `src/shared/plugins/api-types.ts` — add `clearProject(projectId)` to the `verdicts` namespace.
- Modify: `src/plugin-host/verdicts-api.ts` — add the client method + `$clearProject` proxy.
- Modify: `src/main/plugins/verdict-read-service.ts` — add `deleteByProject` to the service interface (rename `VerdictReadService` → `VerdictService`).
- Modify: `src/main/plugins/extension-host.ts` — `HOST_VERDICTS.$clearProject` handler (gated); update the `verdicts` field type.
- Modify: `src/main/app/index.ts` — no change needed (VerdictStore already satisfies the wider interface).
- Test: `src/plugin-host/verdicts-api.test.ts` (create) — round-trip; `src/main/plugins/extension-host-gated-integration.test.ts` (modify) — `verdicts:write` gating if a gating test exists, else add to `extension-host.test.ts`.

**Interfaces:**
- Produces: `manifold.verdicts.clearProject(projectId: string): Promise<void>`; `VerdictService.deleteByProject(projectId: string): void`; `HOST_VERDICTS.$clearProject(pluginId, projectId): Promise<void>`.

- [ ] **Step 1: Add the capability** in `manifest.ts`:

```ts
export const CAPABILITIES = ['storage', 'workspace:read', 'workspace:manage', 'configuration', 'agent:control', 'agent:spawn', 'lm', 'transcription:read', 'verdicts:read', 'verdicts:write'] as const
// ...
export const BUILTIN_ONLY_CAPABILITIES = ['workspace:manage', 'agent:control', 'agent:spawn', 'lm', 'transcription:read', 'verdicts:read', 'verdicts:write'] as const satisfies readonly Capability[]
```

- [ ] **Step 2: Extend the API type** in `api-types.ts` `verdicts` namespace:

```ts
  verdicts: {
    /** [verdicts:read] Recorded session verdicts for a project (most-recent-capped). */
    listByProject(projectId: string, limit?: number): Promise<VerdictRecord[]>
    /** [verdicts:write] Delete all captured verdicts for a project. */
    clearProject(projectId: string): Promise<void>
  }
```

- [ ] **Step 3: Widen the service interface** in `verdict-read-service.ts`:

```ts
export interface VerdictService {
  listByProject(projectId: string, limit?: number): VerdictRecord[]
  deleteByProject(projectId: string): void
}
```
Update the export name everywhere it's imported (`extension-host.ts`).

- [ ] **Step 4: Write the failing client test** `src/plugin-host/verdicts-api.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RpcEndpoint, HOST_VERDICTS, type RpcMessage } from '../shared/plugins/rpc'
import { createVerdictsApi } from './verdicts-api'

function wire() {
  let host!: RpcEndpoint; let main!: RpcEndpoint
  main = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => void host.handleMessage(m)) })
  host = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => void main.handleMessage(m)) })
  return { host, main }
}

describe('createVerdictsApi.clearProject', () => {
  it('forwards pluginId + projectId to HOST_VERDICTS.$clearProject', async () => {
    const { host, main } = wire()
    const calls: Array<[string, string]> = []
    main.registerService(HOST_VERDICTS, {
      $listByProject: () => Promise.resolve([]),
      $clearProject: (pluginId: string, projectId: string) => { calls.push([pluginId, projectId]); return Promise.resolve() },
    })
    const api = createVerdictsApi(host, 'manifold.statistics')
    await api.clearProject('p1')
    expect(calls).toEqual([['manifold.statistics', 'p1']])
  })
})
```

- [ ] **Step 5: Run it, expect FAIL** — `npm test -- src/plugin-host/verdicts-api.test.ts` (clearProject undefined).

- [ ] **Step 6: Implement the client** in `verdicts-api.ts`:

```ts
interface HostVerdictsProxy {
  $listByProject(pluginId: string, projectId: string, limit: number | undefined): Promise<VerdictRecord[]>
  $clearProject(pluginId: string, projectId: string): Promise<void>
}

export function createVerdictsApi(endpoint: RpcEndpoint, pluginId: string): ManifoldApi['verdicts'] {
  const host = endpoint.getProxy<HostVerdictsProxy>(HOST_VERDICTS)
  return {
    listByProject: (projectId, limit) => host.$listByProject(pluginId, projectId, limit),
    clearProject: (projectId) => host.$clearProject(pluginId, projectId),
  }
}
```

- [ ] **Step 7: Implement the host handler** in `extension-host.ts` `HOST_VERDICTS` service:

```ts
    endpoint.registerService(HOST_VERDICTS, {
      $listByProject: (pluginId: string, projectId: string, limit: number | undefined) => { this.assertBuiltin(pluginId, 'verdicts:read'); return this.verdicts.listByProject(projectId, limit) },
      $clearProject: (pluginId: string, projectId: string) => { this.assertBuiltin(pluginId, 'verdicts:write'); this.verdicts.deleteByProject(projectId) },
    })
```
Change the field type `private readonly verdicts: VerdictService` (import the renamed interface).

- [ ] **Step 8: Run client + typecheck** — `npm test -- src/plugin-host/verdicts-api.test.ts` (PASS), `npm run typecheck:node` (clean).

- [ ] **Step 9: Commit** — `git commit -m "feat: add verdicts:write capability + verdicts.clearProject"`

---

### Task 2: Statistics host — confirm-and-reset flow

**Files:**
- Modify: `resources/plugins/manifold.statistics/src/protocol.ts` — add `{ type: 'reset' }` to `WebviewMsg` + guard.
- Modify: `resources/plugins/manifold.statistics/src/webview-host.ts` — add `confirmReset` + `clearProject` options; handle `reset`.
- Modify: `resources/plugins/manifold.statistics/src/plugin.ts` — wire `confirmReset` (showWarningMessage) + `clearProject`.
- Test: `resources/plugins/manifold.statistics/src/webview-host.test.ts` (create).

**Interfaces:**
- Consumes: `manifold.verdicts.clearProject` (Task 1), `manifold.window.showWarningMessage`.
- Produces: webview→host message `{ type: 'reset' }`; host `StatisticsHostOptions` gains `confirmReset(projectId, name, count): Promise<boolean>` and `clearProject(projectId): Promise<void>`.

- [ ] **Step 1: Extend the protocol** in `protocol.ts`:

```ts
export type WebviewMsg =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'open-external'; url: string }
  | { type: 'reset' }
```
Add `type === 'reset'` to the `true` branch in `isWebviewMsg`.

- [ ] **Step 2: Write the failing host test** `webview-host.test.ts`:

```ts
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { createWebviewHost } from '../webview-host'
import type { WebviewView } from 'manifold'

function resolveWith(host: { provider: { resolveWebviewView(v: WebviewView): void } }) {
  const handlers: Array<(m: unknown) => void> = []
  const view = { webview: {
    html: '', postMessage: vi.fn(),
    onDidReceiveMessage: (l: (m: unknown) => void) => { handlers.push(l); return { dispose() {} } },
  } } as unknown as WebviewView
  host.provider.resolveWebviewView(view)
  return { send: (m: unknown) => handlers.forEach((h) => h(m)) }
}

describe('statistics host reset', () => {
  it('clears the project and refreshes when confirmed', async () => {
    const clearProject = vi.fn(async () => {})
    const confirmReset = vi.fn(async () => true)
    const list = vi.fn(async () => [])
    const host = createWebviewHost({
      readBundle: () => '', activeProjectId: () => 'p1', list,
      openExternal: () => {}, clearProject, confirmReset,
    })
    const { send } = resolveWith(host)
    send({ type: 'reset' })
    await new Promise((r) => setTimeout(r, 0))
    expect(confirmReset).toHaveBeenCalled()
    expect(clearProject).toHaveBeenCalledWith('p1')
  })

  it('does nothing when cancelled', async () => {
    const clearProject = vi.fn(async () => {})
    const host = createWebviewHost({
      readBundle: () => '', activeProjectId: () => 'p1', list: async () => [],
      openExternal: () => {}, clearProject, confirmReset: async () => false,
    })
    const { send } = resolveWith(host)
    send({ type: 'reset' })
    await new Promise((r) => setTimeout(r, 0))
    expect(clearProject).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run it, expect FAIL** — `npm test -- resources/plugins/manifold.statistics/src/webview-host.test.ts` (options/handler missing).

- [ ] **Step 4: Implement the host** in `webview-host.ts` — extend `StatisticsHostOptions`:

```ts
  /** Open a PR URL in the browser on behalf of the sandboxed webview. */
  openExternal: (url: string) => void
  /** Confirm the destructive reset (native dialog). Resolves true to proceed. */
  confirmReset: (projectId: string) => Promise<boolean>
  /** Delete all captured verdicts for a project. */
  clearProject: (projectId: string) => Promise<void>
```
And in `onDidReceiveMessage`:

```ts
      v.webview.onDidReceiveMessage((raw: unknown) => {
        if (!isWebviewMsg(raw)) return
        if (raw.type === 'open-external') { opts.openExternal(raw.url); return }
        if (raw.type === 'reset') { void handleReset(); return }
        void sendInit()
      })
```
Add `handleReset` (closure over `opts`/`sendInit`):

```ts
  const handleReset = async (): Promise<void> => {
    const projectId = opts.activeProjectId()
    if (!projectId) return
    if (!(await opts.confirmReset(projectId))) return
    await opts.clearProject(projectId)
    await sendInit()
  }
```

- [ ] **Step 5: Wire `plugin.ts`** — pass `confirmReset` + `clearProject`:

```ts
    openExternal: (url) => { void manifold.window.openExternal(url) },
    confirmReset: async (projectId) => {
      const p = manifold.workspace.activeProject
      const records = await manifold.verdicts.listByProject(projectId)
      const name = p?.name ?? 'this project'
      const choice = await manifold.window.showWarningMessage(
        `Delete all ${records.length} captured session${records.length === 1 ? '' : 's'} for ${name}? This can't be undone.`,
        'Delete', 'Cancel',
      )
      return choice === 'Delete'
    },
    clearProject: (projectId) => manifold.verdicts.clearProject(projectId),
```

- [ ] **Step 6: Run host test + build plugins** — `npm test -- resources/plugins/manifold.statistics/src/webview-host.test.ts` (PASS); `node scripts/build-plugins.mjs`.

- [ ] **Step 7: Commit** — `git commit -m "feat(statistics): host-side confirm-and-reset flow"`

---

### Task 3: Statistics webview — Reset button

**Files:**
- Modify: `resources/plugins/manifold.statistics/src/webview/use-statistics-bridge.ts` — add `reset()`.
- Modify: `resources/plugins/manifold.statistics/src/webview/StatisticsPanel.tsx` — header Reset button (disabled when no project / 0 records).
- Modify: `resources/plugins/manifold.statistics/src/webview/styles.ts` — `resetButton` style (destructive tint, tokens only).
- Test: `resources/plugins/manifold.statistics/src/webview/StatisticsPanel.test.tsx` — Reset posts `{type:'reset'}`; disabled at 0 sessions.

**Interfaces:**
- Consumes: protocol `{ type: 'reset' }` (Task 2).
- Produces: `StatisticsBridge.reset(): void`.

- [ ] **Step 1: Add `reset` to the bridge** in `use-statistics-bridge.ts`:

```ts
function postToHost(msg: { type: 'ready' | 'refresh' | 'reset' } | { type: 'open-external'; url: string }): void { parent.postMessage(msg, '*') }
// in the returned object:
    reset: () => postToHost({ type: 'reset' }),
```
Add `reset: () => void` to `StatisticsBridge`.

- [ ] **Step 2: Add the `resetButton` style** in `styles.ts` (after `refreshButton`):

```ts
  resetButton: {
    background: 'var(--control-bg)',
    border: '1px solid color-mix(in srgb, var(--status-error) 40%, var(--control-border))',
    color: 'var(--status-error)',
    height: 'var(--control-height)',
    borderRadius: 'var(--radius-sm)',
    padding: '0 var(--space-sm)',
    fontSize: 'var(--type-ui-caption)',
    fontFamily: 'var(--font-sans)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    cursor: 'pointer',
    transition: 'background 200ms ease, color 200ms ease',
  },
  resetButtonDisabled: {
    opacity: 0.4,
    cursor: 'default',
  },
```

- [ ] **Step 3: Write the failing UI test** in `StatisticsPanel.test.tsx`:

```ts
  it('reset button posts a reset message and is disabled with no sessions', () => {
    const post = vi.spyOn(window, 'postMessage')
    render(<StatisticsPanel />)
    init([]) // no records
    const resetEmpty = screen.getByRole('button', { name: /reset/i }) as HTMLButtonElement
    expect(resetEmpty.disabled).toBe(true)
    cleanup()

    const post2 = vi.spyOn(window, 'postMessage')
    render(<StatisticsPanel />)
    init([record({ sessionId: 'a' })])
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(post2).toHaveBeenCalledWith({ type: 'reset' }, '*')
    post.mockRestore(); post2.mockRestore()
  })
```

- [ ] **Step 4: Run it, expect FAIL** — `npm test -- resources/plugins/manifold.statistics/src/webview/StatisticsPanel.test.tsx`.

- [ ] **Step 5: Render the button** in `StatisticsPanel.tsx` header. Destructure `reset` and gate on `records`:

```tsx
  const { records, projectId, error, loaded, refreshing, refresh, openExternal, reset } = useStatisticsBridge()
  const canReset = !!projectId && records.length > 0
```
In the header, before the Refresh button:

```tsx
        <button
          type="button"
          style={canReset ? s.resetButton : { ...s.resetButton, ...s.resetButtonDisabled }}
          onClick={() => reset()}
          disabled={!canReset}
        >
          Reset
        </button>
```

- [ ] **Step 6: Run UI test + typecheck:web** — `npm test -- resources/plugins/manifold.statistics` (PASS); `npm run typecheck:web` (clean).

- [ ] **Step 7: Commit** — `git commit -m "feat(statistics): Reset button in the panel header"`

---

### Task 4: Docs + full verification

**Files:**
- Modify: `docs/architecture/plugin-api.md` — document `verdicts:write` / `clearProject`.

- [ ] **Step 1: Update the doc** — add `verdicts:write` to the capability/namespace list and bump `updated:` if needed.
- [ ] **Step 2: Build plugins** — `node scripts/build-plugins.mjs`.
- [ ] **Step 3: Full suite + typechecks** — `npm test` (green except the 4 known worktree-symlink suites), `npm run typecheck:node`, `npm run typecheck:web`.
- [ ] **Step 4: Commit** — `git commit -m "docs: document verdicts:write / clearProject"`

## Self-Review

- **Spec coverage:** capability (T1), API (T1), confirmation dialog host-side (T2), button + disabled state (T3), docs (T4). ✓
- **Type consistency:** `clearProject(projectId)` / `deleteByProject(projectId)` / `$clearProject(pluginId, projectId)` consistent across T1–T2. `confirmReset(projectId)` consistent T2↔plugin.ts. ✓
- **No placeholders:** all steps carry concrete code. ✓
