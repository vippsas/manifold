# Agent-Independent Terminals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user open shells with no agent running, with a VS Code-style tabbed terminal panel ("+" for a new terminal, all terminals equal and closable) whose terminal set is scoped per workspace checkout and survives closing the panel.

**Architecture:** Terminal state moves out of the `ShellTabs` component into a module-level store keyed by the workspace checkout path (cwd). A pure `resolveShellCwd` helper derives that path from workspace/project state instead of from an agent session, which removes the agent coupling. The panel's two-class model (one special "main" shell plus "extra" shells) collapses into one flat list.

**Tech Stack:** Electron, React 18 (`useSyncExternalStore`), TypeScript, xterm.js, vitest + @testing-library/react, node-pty (unchanged).

**Spec:** `docs/superpowers/specs/2026-08-05-agentless-terminals-design.md`

---

## Orientation for the implementer

Read this before Task 1. It is the context you cannot get from the diffs.

**What a "shell session" is here.** Shells are not a separate subsystem. `shell:create` makes an ordinary session in the main process with `runtimeId: '__shell__'` (`src/main/session/session-resume.ts:93-179`) and returns `{ sessionId }`. From then on the renderer talks to it over the same `agent:input` / `agent:output` / `agent:resize` / `agent:replay` channels an agent uses. **This plan changes no main-process code except one TypeScript interface** (Task 8).

**Two different terminals exist.** `TerminalPane` renders an *agent's own* PTY in the agent panel — do not touch it. `ShellTabs` renders the Shell panel's auxiliary shells. This plan is entirely about the latter.

**Why the store is module-level.** Closing the Shell panel unmounts `ShellTabs` (dockview removes the panel; `dock-layout-no-remount.test.tsx:68-71` asserts `getPanel('shell')` is `undefined` after `hidePanel`). Today `useCleanupOnUnmount` kills every PTY at that moment, so collapsing the panel kills a running dev server. Module scope is what makes the terminals outlive the component.

**Do not reintroduce a kill-on-unmount.** Several existing hooks kill PTYs in effect cleanup. All of them are deleted here on purpose. Main already reaps every PTY on quit (`src/main/app/app-lifecycle.ts:96-97`).

**Running tests** (see the repo's `testing` skill): always `npm test`, never `npx vitest`, because `pretest` rebuilds `better-sqlite3` for the Node ABI. One file: `npm test -- path/to/file.test.ts`.

**A `useSyncExternalStore` trap.** `getSnapshot` must return a **referentially stable** value between mutations, or React re-renders forever. Every store mutation in this plan replaces the entry object; every read returns the stored object (or one shared frozen `EMPTY`), never a freshly built one.

---

## File structure

**Created:**

| File | Responsibility |
|------|----------------|
| `src/renderer/components/terminal/shell-cwd.ts` | Pure: workspace/project state → the terminal scope path. |
| `src/renderer/components/terminal/shell-cwd.test.ts` | Tests for the above. |
| `src/renderer/components/terminal/shell-terminal-store.ts` | All terminal state: the per-cwd map, the open sequence, persistence, the `agent:exit` listener. |
| `src/renderer/components/terminal/shell-terminal-store.test.ts` | Tests for the above. |

**Modified:** `ShellTabs.tsx`, `ShellTabControls.tsx`, `ShellHeaderActions.tsx`, `shell-header-controls.ts`, `ShellTabs.styles.ts`, `dock-panels.tsx`, `dock-panel-types.ts`, `App.tsx`, `ActivityBar.tsx`, `shell-tab-store.ts` (one interface), plus tests and three architecture docs.

**Deleted:** `src/renderer/hooks/terminal/useShellSession.ts`, `useShellSession.test.ts`, `src/renderer/components/terminal/shell-tabs-hooks.ts`.

**Task order is dependency-driven.** Tasks 1–4 add unused-but-tested modules (tree stays green). Task 5 is the renderer swap and must land as one commit because the types are coupled. Tasks 6–8 clean up behind it.

---

### Task 1: `resolveShellCwd` — the scope path

**Files:**
- Create: `src/renderer/components/terminal/shell-cwd.ts`
- Test: `src/renderer/components/terminal/shell-cwd.test.ts`

**Why this shape:** it reproduces the chain the agent panel already uses (`dock-agent-panel.tsx:131-147`). The critical rule is that the *path* comes from the workspace's **primary** project (`projectIds[0]`), never from `activeProjectId` — clicking a folder row inside a multi-repo workspace changes `activeProjectId` (`App.tsx:351-353`), and keying off it would swap the terminal set inside one workspace. `activeProjectId` is used only to *find* the workspace when none is focused.

Note `worktreePaths` is **absent on a home workspace** (`src/shared/workspace-types.ts:7-10`), so the project-path fallback is the common case, not an edge case.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/terminal/shell-cwd.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { resolveShellCwd } from './shell-cwd'

const projects: Project[] = [
  { id: 'p1', name: 'storefront', path: '/repos/storefront' },
  { id: 'p2', name: 'payments', path: '/repos/payments' },
] as unknown as Project[]

function workspace(over: Partial<Workspace> = {}): Workspace {
  return {
    id: 'w1',
    name: 'checkout',
    projectIds: ['p1', 'p2'],
    createdAt: '2026-08-05',
    ...over,
  } as Workspace
}

describe('resolveShellCwd', () => {
  it('prefers the focused workspace primary checkout', () => {
    const ws = workspace({ worktreePaths: { p1: '/worktrees/checkout/storefront' } })
    expect(resolveShellCwd([ws], 'w1', 'p2', projects)).toBe('/worktrees/checkout/storefront')
  })

  it('falls back to the primary project path on a home workspace', () => {
    expect(resolveShellCwd([workspace()], 'w1', null, projects)).toBe('/repos/storefront')
  })

  it('finds the workspace holding the active project when none is focused', () => {
    expect(resolveShellCwd([workspace()], null, 'p2', projects)).toBe('/repos/storefront')
  })

  it('does not change when the active project changes within one workspace', () => {
    const ws = workspace()
    expect(resolveShellCwd([ws], 'w1', 'p1', projects))
      .toBe(resolveShellCwd([ws], 'w1', 'p2', projects))
  })

  it('returns null when no workspace resolves', () => {
    expect(resolveShellCwd([], null, null, projects)).toBeNull()
  })

  it('returns null when the primary project is unknown', () => {
    expect(resolveShellCwd([workspace({ projectIds: ['ghost'] })], 'w1', null, projects)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/renderer/components/terminal/shell-cwd.test.ts`
Expected: FAIL — cannot resolve `./shell-cwd`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/components/terminal/shell-cwd.ts`:

```ts
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

/** Where the Shell panel's terminals run, and the key their set is stored under.
 *
 *  Deliberately a copy of the chain in `dock-agent-panel.tsx:131-147` rather
 *  than a shared extraction — reworking the agent panel is out of scope here.
 *
 *  The path always comes from the workspace's *primary* project. `activeProjectId`
 *  only helps find the workspace: selecting a different repo row inside a
 *  multi-repo workspace must not swap the terminal set. */
export function resolveShellCwd(
  workspaces: Workspace[],
  activeWorkspaceId: string | null | undefined,
  activeProjectId: string | null | undefined,
  projects: Project[],
): string | null {
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
    ?? workspaces.find((w) => !!activeProjectId && w.projectIds.includes(activeProjectId))
  if (!workspace) return null
  const primaryId = workspace.projectIds[0]
  return workspace.worktreePaths?.[primaryId]
    ?? projects.find((p) => p.id === primaryId)?.path
    ?? null
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/renderer/components/terminal/shell-cwd.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/terminal/shell-cwd.ts src/renderer/components/terminal/shell-cwd.test.ts
git commit -m "feat(terminal): resolve shell cwd from workspace instead of agent"
```

---

### Task 2: Terminal store — state, mutations, persistence

**Files:**
- Create: `src/renderer/components/terminal/shell-terminal-store.ts`
- Test: `src/renderer/components/terminal/shell-terminal-store.test.ts`

This task builds the data structure and its synchronous mutations. The async open sequence is Task 3 and the `agent:exit` listener is Task 4; leave both out for now.

**Design notes you need:**
- One entry per cwd. `state` is a three-value machine (`'idle' | 'opening' | 'ready'`), not a pair of booleans — Task 3 depends on it.
- Persistence writes only when `state === 'ready'`, which is what stops a half-finished restore from overwriting good data on disk.
- Closing the active terminal activates its **neighbour** (previous, else next, else null).
- `getScope(null)` returns a shared frozen `EMPTY` so callers need no null-checks and `useSyncExternalStore` stays stable.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/terminal/shell-terminal-store.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addTerminal, closeTerminal, getScope, resetShellTerminalStore,
  setActiveTerminal, subscribeShellTerminals,
} from './shell-terminal-store'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  resetShellTerminalStore()
  let n = 0
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'shell:create') return Promise.resolve({ sessionId: `s${++n}` })
    return Promise.resolve(undefined)
  })
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => () => {}),
  }
})

describe('shell terminal store', () => {
  it('returns a stable empty snapshot for an unknown or null cwd', () => {
    expect(getScope(null)).toBe(getScope('/a'))
    expect(getScope('/a').terminals).toEqual([])
    expect(getScope('/a').state).toBe('idle')
  })

  it('adds a terminal, labels it, and makes it active', async () => {
    await addTerminal('/a', 'manifold')
    const scope = getScope('/a')
    expect(scope.terminals).toEqual([{ sessionId: 's1', label: 'Manifold 1', mode: 'manifold' }])
    expect(scope.activeSessionId).toBe('s1')
  })

  it('keeps two cwds independent', async () => {
    await addTerminal('/a', 'manifold')
    await addTerminal('/b', 'system')
    expect(getScope('/a').terminals).toHaveLength(1)
    expect(getScope('/b').terminals[0].label).toBe('System 1')
  })

  it('never renumbers: the counter is monotonic per cwd', async () => {
    await addTerminal('/a', 'manifold')
    await addTerminal('/a', 'manifold')
    closeTerminal('/a', 's1')
    await addTerminal('/a', 'manifold')
    expect(getScope('/a').terminals.map((t) => t.label)).toEqual(['Manifold 2', 'Manifold 3'])
  })

  it('kills the pty when a terminal is closed by the user', async () => {
    await addTerminal('/a', 'manifold')
    closeTerminal('/a', 's1')
    expect(mockInvoke).toHaveBeenCalledWith('shell:kill', 's1')
    expect(getScope('/a').terminals).toEqual([])
  })

  it('does not kill the pty when the shell exited on its own', async () => {
    await addTerminal('/a', 'manifold')
    closeTerminal('/a', 's1', { kill: false })
    expect(mockInvoke).not.toHaveBeenCalledWith('shell:kill', 's1')
  })

  it('activates the neighbour when the active terminal is closed', async () => {
    await addTerminal('/a', 'manifold')
    await addTerminal('/a', 'manifold')
    await addTerminal('/a', 'manifold')
    setActiveTerminal('/a', 's2')
    closeTerminal('/a', 's2')
    expect(getScope('/a').activeSessionId).toBe('s1')
    closeTerminal('/a', 's1')
    expect(getScope('/a').activeSessionId).toBe('s3')
    closeTerminal('/a', 's3')
    expect(getScope('/a').activeSessionId).toBeNull()
  })

  it('notifies subscribers and swaps the entry identity on mutation', async () => {
    const listener = vi.fn()
    subscribeShellTerminals(listener)
    const before = getScope('/a')
    await addTerminal('/a', 'manifold')
    expect(listener).toHaveBeenCalled()
    expect(getScope('/a')).not.toBe(before)
  })

  it('persists tabs only once the scope is ready', async () => {
    await addTerminal('/a', 'manifold')
    expect(mockInvoke).not.toHaveBeenCalledWith('shell-tabs:set', expect.anything(), expect.anything())

    getScope('/a').state = 'ready'   // Task 3 sets this via the open sequence
    await addTerminal('/a', 'system')
    expect(mockInvoke).toHaveBeenCalledWith('shell-tabs:set', '/a', {
      tabs: [
        { label: 'Manifold 1', cwd: '/a', mode: 'manifold' },
        { label: 'System 2', cwd: '/a', mode: 'system' },
      ],
      counter: 3,
    })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/renderer/components/terminal/shell-terminal-store.test.ts`
Expected: FAIL — cannot resolve `./shell-terminal-store`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/components/terminal/shell-terminal-store.ts`:

```ts
export type ShellMode = 'manifold' | 'system'

export interface ShellTerminal {
  sessionId: string
  label: string
  mode: ShellMode
}

/** One terminal set, keyed by the workspace checkout path it runs in.
 *
 *  `state` sequences the async open: `'idle'` means nothing has tried yet,
 *  `'opening'` means a restore-or-create is in flight (and blocks a second one,
 *  including StrictMode's double-mount), `'ready'` means the set is settled —
 *  an empty `'ready'` scope is one the user deliberately emptied, and must not
 *  be repopulated. */
export interface ShellScope {
  terminals: ShellTerminal[]
  counter: number
  activeSessionId: string | null
  state: 'idle' | 'opening' | 'ready'
  /** Message from a failed open, read by the panel's error strip. */
  error: string | null
}

const EMPTY: ShellScope = Object.freeze({
  terminals: Object.freeze([]) as unknown as ShellTerminal[],
  counter: 1,
  activeSessionId: null,
  state: 'idle',
  error: null,
})

const scopes = new Map<string, ShellScope>()
const listeners = new Set<() => void>()

/** Snapshot for `useSyncExternalStore`: the stored object, or one shared frozen
 *  empty. Never build a fresh object here — an unstable snapshot loops React. */
export function getScope(cwd: string | null): ShellScope {
  if (!cwd) return EMPTY
  return scopes.get(cwd) ?? EMPTY
}

export function subscribeShellTerminals(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(): void {
  for (const listener of listeners) listener()
}

function entry(cwd: string): ShellScope {
  const existing = scopes.get(cwd)
  if (existing) return existing
  const created: ShellScope = {
    terminals: [], counter: 1, activeSessionId: null, state: 'idle', error: null,
  }
  scopes.set(cwd, created)
  return created
}

/** Replace the entry object (snapshot identity must change), persist if settled,
 *  then notify.
 *
 *  `persist: false` is for a failed open: the scope must still reach `'ready'`
 *  so the user can retry, but writing its empty terminal list would erase the
 *  saved tabs we failed to restore. */
function updateScope(
  cwd: string,
  patch: Partial<ShellScope>,
  options?: { persist?: boolean },
): void {
  const next: ShellScope = { ...entry(cwd), ...patch }
  scopes.set(cwd, next)
  if (next.state === 'ready' && options?.persist !== false) {
    void window.electronAPI.invoke('shell-tabs:set', cwd, {
      tabs: next.terminals.map((t) => ({ label: t.label, cwd, mode: t.mode })),
      counter: next.counter,
    }).catch(() => {})
  }
  emit()
}

export function label(mode: ShellMode, counter: number): string {
  return `${mode === 'system' ? 'System' : 'Manifold'} ${counter}`
}

/** Errors live on the scope, never in component state: the panel unmounts every
 *  time it is closed, so a component-held message would be lost on close and a
 *  component-held "dismissed" flag would reset on reopen — resurrecting an error
 *  the user already dismissed. A successful add clears it. */
export async function addTerminal(cwd: string, mode: ShellMode): Promise<void> {
  try {
    const result = await window.electronAPI.invoke('shell:create', cwd, { mode }) as { sessionId: string }
    const current = entry(cwd)
    const terminal: ShellTerminal = {
      sessionId: result.sessionId,
      label: label(mode, current.counter),
      mode,
    }
    updateScope(cwd, {
      terminals: [...current.terminals, terminal],
      counter: current.counter + 1,
      activeSessionId: terminal.sessionId,
      error: null,
    })
  } catch (e) {
    updateScope(cwd, { error: e instanceof Error ? e.message : String(e) }, { persist: false })
  }
}

export function dismissScopeError(cwd: string): void {
  updateScope(cwd, { error: null }, { persist: false })
}

/** Close a terminal. `kill: false` is for a shell that already exited on its
 *  own (an `agent:exit` we're reacting to), where there is no PTY left to kill. */
export function closeTerminal(cwd: string, sessionId: string, options?: { kill?: boolean }): void {
  const current = entry(cwd)
  const index = current.terminals.findIndex((t) => t.sessionId === sessionId)
  if (index === -1) return
  if (options?.kill !== false) {
    void window.electronAPI.invoke('shell:kill', sessionId).catch(() => {})
  }
  const terminals = current.terminals.filter((t) => t.sessionId !== sessionId)
  const activeSessionId = current.activeSessionId === sessionId
    ? (terminals[index - 1] ?? terminals[index])?.sessionId ?? null
    : current.activeSessionId
  updateScope(cwd, { terminals, activeSessionId })
}

export function setActiveTerminal(cwd: string, sessionId: string): void {
  updateScope(cwd, { activeSessionId: sessionId })
}

/** Test-only: drop scope state between cases. Deliberately does *not* clear
 *  `listeners` — that would detach a live `useSyncExternalStore` subscription
 *  and leave a rendered component silently frozen. */
export function resetShellTerminalStore(): void {
  scopes.clear()
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/renderer/components/terminal/shell-terminal-store.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/terminal/shell-terminal-store.ts src/renderer/components/terminal/shell-terminal-store.test.ts
git commit -m "feat(terminal): add cwd-keyed terminal store with neighbour activation"
```

---

### Task 3: The open sequence

**Files:**
- Modify: `src/renderer/components/terminal/shell-terminal-store.ts`
- Test: `src/renderer/components/terminal/shell-terminal-store.test.ts`

`openScope(cwd)` runs when the panel shows a cwd. It must satisfy four constraints at once, which is why the ordering is exact:

1. **Never create twice.** `state` is set to `'opening'` synchronously *before the first await*. Under `<React.StrictMode>` (`src/renderer/index.tsx:16`) effects run setup → cleanup → setup, so a check that happens after an await always double-spawns. This is trap #1 in `docs/architecture/gotchas.md`.
2. **Never respawn a deliberately-emptied scope.** The guard is `state !== 'idle'`, *not* "terminals is empty".
3. **Never wedge a scope.** `finally` sets `'ready'` even when the IPC rejects, so the next "+" works.
4. **Carry the restored counter.** Otherwise a restored set renumbers from 1 and collides with existing labels.

- [ ] **Step 1: Write the failing tests**

Append to `src/renderer/components/terminal/shell-terminal-store.test.ts`:

```ts
describe('openScope', () => {
  it('creates exactly one terminal when nothing is saved', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.resolve({ sessionId: 's1' })
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    expect(getScope('/a').terminals).toHaveLength(1)
    expect(getScope('/a').state).toBe('ready')
  })

  it('restores a saved set, carries its counter, and does not also auto-create', async () => {
    let n = 0
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') {
        return Promise.resolve({
          tabs: [{ label: 'Manifold 1', cwd: '/a', mode: 'manifold' },
                 { label: 'System 2', cwd: '/a', mode: 'system' }],
          counter: 3,
        })
      }
      if (channel === 'shell:create') return Promise.resolve({ sessionId: `r${++n}` })
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    expect(getScope('/a').terminals.map((t) => t.label)).toEqual(['Manifold 1', 'System 2'])
    expect(getScope('/a').counter).toBe(3)
  })

  it('is idempotent under a double-mount: two concurrent opens create one terminal', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.resolve({ sessionId: 's1' })
      return Promise.resolve(undefined)
    })
    await Promise.all([openScope('/a'), openScope('/a')])
    expect(mockInvoke.mock.calls.filter((c) => c[0] === 'shell:create')).toHaveLength(1)
  })

  it('does not respawn a scope the user emptied', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.resolve({ sessionId: 's1' })
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    closeTerminal('/a', 's1')
    await openScope('/a')
    expect(getScope('/a').terminals).toEqual([])
    expect(mockInvoke.mock.calls.filter((c) => c[0] === 'shell:create')).toHaveLength(1)
  })

  it('reaches ready after a failed create, records the error, and keeps saved tabs', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.reject(new Error('spawn failed'))
      return Promise.resolve(undefined)
    })
    await expect(openScope('/a')).resolves.toBeUndefined()
    expect(getScope('/a').state).toBe('ready')
    expect(getScope('/a').terminals).toEqual([])
    expect(getScope('/a').error).toBe('spawn failed')
    // An empty list must not overwrite what we failed to restore.
    expect(mockInvoke).not.toHaveBeenCalledWith('shell-tabs:set', expect.anything(), expect.anything())
  })

  it('does not persist while the scope is still opening', async () => {
    const calls: string[] = []
    mockInvoke.mockImplementation((channel: string) => {
      calls.push(channel)
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.resolve({ sessionId: 's1' })
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    // The only shell-tabs:set is the one the finally emits, after shell:create.
    expect(calls.filter((c) => c === 'shell-tabs:set')).toHaveLength(1)
    expect(calls.indexOf('shell-tabs:set')).toBeGreaterThan(calls.indexOf('shell:create'))
  })

  it('keeps saved tabs and reports when every one of them fails to spawn', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') {
        return Promise.resolve({ tabs: [{ label: 'Manifold 1', cwd: '/a', mode: 'manifold' }], counter: 2 })
      }
      if (channel === 'shell:create') return Promise.reject(new Error('no such directory'))
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    expect(getScope('/a').error).toBe('no such directory')
    expect(mockInvoke).not.toHaveBeenCalledWith('shell-tabs:set', expect.anything(), expect.anything())
  })

  it('clears a recorded error once a terminal is successfully added', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.reject(new Error('spawn failed'))
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    expect(getScope('/a').error).toBe('spawn failed')

    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell:create') return Promise.resolve({ sessionId: 's9' })
      return Promise.resolve(undefined)
    })
    await addTerminal('/a', 'manifold')
    expect(getScope('/a').error).toBeNull()
  })

  it('records a failed add without throwing, and dismisses per scope', async () => {
    mockInvoke.mockImplementation(() => Promise.reject(new Error('nope')))
    await expect(addTerminal('/a', 'manifold')).resolves.toBeUndefined()
    expect(getScope('/a').error).toBe('nope')
    expect(getScope('/b').error).toBeNull()
    dismissScopeError('/a')
    expect(getScope('/a').error).toBeNull()
  })

  it('skips a saved tab that fails to spawn', async () => {
    mockInvoke.mockImplementation((channel: string, _cwd?: unknown, opts?: unknown) => {
      if (channel === 'shell-tabs:get') {
        return Promise.resolve({
          tabs: [{ label: 'Manifold 1', cwd: '/a', mode: 'manifold' },
                 { label: 'System 2', cwd: '/a', mode: 'system' }],
          counter: 3,
        })
      }
      if (channel === 'shell:create') {
        return (opts as { mode: string }).mode === 'system'
          ? Promise.reject(new Error('nope'))
          : Promise.resolve({ sessionId: 'ok' })
      }
      return Promise.resolve(undefined)
    })
    await openScope('/a')
    expect(getScope('/a').terminals.map((t) => t.label)).toEqual(['Manifold 1'])
  })
})
```

Add `openScope` and `dismissScopeError` to the import at the top of the file.

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- src/renderer/components/terminal/shell-terminal-store.test.ts`
Expected: FAIL — `openScope is not a function`.

- [ ] **Step 3: Implement `openScope`**

Add to `shell-terminal-store.ts`:

```ts
interface SavedShellState {
  tabs: { label: string; cwd: string; mode?: ShellMode }[]
  counter: number
}

/** Populate a scope the first time the panel shows it: restore what was saved,
 *  or create one shell. Runs at most once per cwd per session.
 *
 *  Order is load-bearing — see the plan's Task 3 notes. In short: the `'opening'`
 *  marker is set before the first await (StrictMode double-mount safety), the
 *  guard tests `state`, never emptiness (a scope the user emptied stays empty),
 *  and `finally` always reaches `'ready'` (a failed spawn must not wedge the cwd). */
export async function openScope(cwd: string): Promise<void> {
  const current = entry(cwd)
  if (current.state !== 'idle') return
  scopes.set(cwd, { ...current, state: 'opening' })

  let openError: string | null = null
  try {
    const saved = await window.electronAPI.invoke('shell-tabs:get', cwd) as SavedShellState | null
    if (saved && saved.tabs.length > 0) {
      const terminals: ShellTerminal[] = []
      let lastFailure: string | null = null
      for (const tab of saved.tabs) {
        const mode: ShellMode = tab.mode === 'system' ? 'system' : 'manifold'
        try {
          const result = await window.electronAPI.invoke('shell:create', cwd, { mode }) as { sessionId: string }
          terminals.push({ sessionId: result.sessionId, label: tab.label, mode })
        } catch (e) {
          // One dead tab shouldn't sink the restore — but all of them should.
          lastFailure = e instanceof Error ? e.message : String(e)
        }
      }
      if (terminals.length === 0) {
        // Every saved tab failed (a checkout that no longer exists, typically).
        // Report it, and let the `finally` skip the persist so we don't
        // overwrite the very tabs we just failed to restore.
        openError = lastFailure ?? 'Could not restore terminals'
        return
      }
      scopes.set(cwd, {
        ...entry(cwd),
        terminals,
        counter: saved.counter,
        activeSessionId: terminals[0]?.sessionId ?? null,
      })
      return
    }

    const result = await window.electronAPI.invoke('shell:create', cwd, { mode: 'manifold' }) as { sessionId: string }
    scopes.set(cwd, {
      ...entry(cwd),
      terminals: [{ sessionId: result.sessionId, label: label('manifold', 1), mode: 'manifold' }],
      counter: 2,
      activeSessionId: result.sessionId,
    })
  } catch (e) {
    openError = e instanceof Error ? e.message : String(e)
  } finally {
    updateScope(cwd, { state: 'ready', error: openError }, { persist: openError === null })
  }
}
```

**Two notes for the implementer.** The intermediate writes use `scopes.set` rather than `updateScope` on purpose — persistence must not fire while `state === 'opening'`. And the `finally` passes `persist: false` when the open failed: the scope still becomes usable, but an empty terminal list must not overwrite the saved tabs we just failed to restore.


- [ ] **Step 4: Run the tests**

Run: `npm test -- src/renderer/components/terminal/shell-terminal-store.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/terminal/shell-terminal-store.ts src/renderer/components/terminal/shell-terminal-store.test.ts
git commit -m "feat(terminal): sequence terminal restore and auto-create per scope"
```

---

### Task 4: Remove a tab when its shell exits

**Files:**
- Modify: `src/renderer/components/terminal/shell-terminal-store.ts`
- Test: `src/renderer/components/terminal/shell-terminal-store.test.ts`

Type `exit` in a terminal and its PTY dies; main emits `agent:exit` with `{ sessionId, code }` (`src/main/session/session-stream-wirer.ts:162`, allow-listed at `src/preload/index.ts:149`). Nothing listens today, so the tab would stay and render a session main no longer has.

**The listener must live in the store, not in `ShellTabs`** — a component listener is unregistered exactly when the panel is closed, which is now a normal state with live PTYs behind it.

**But it must not be armed at import time.** `vitest.setup.ts` only imports jest-dom, and tests assign `window.electronAPI` in `beforeEach` (`ShellTabs.test.tsx:14-25`), which runs *after* ESM imports evaluate. A top-level `window.electronAPI.on(...)` throws on import; a `?.` guard silently never registers. Arm it lazily on first use instead.

- [ ] **Step 1: Write the failing test**

Append to `shell-terminal-store.test.ts`:

```ts
describe('agent:exit', () => {
  it('drops the tab whose shell exited, without killing it again', async () => {
    const handlers: Record<string, (payload: unknown) => void> = {}
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: mockInvoke,
      on: (channel: string, handler: (...args: unknown[]) => void) => {
        handlers[channel] = handler as (payload: unknown) => void
        return () => {}
      },
    }

    await addTerminal('/a', 'manifold')
    await addTerminal('/a', 'manifold')
    handlers['agent:exit']({ sessionId: 's1', code: 0 })

    expect(getScope('/a').terminals.map((t) => t.sessionId)).toEqual(['s2'])
    expect(mockInvoke).not.toHaveBeenCalledWith('shell:kill', 's1')
  })

  it('ignores an exit for a session it does not own', async () => {
    const handlers: Record<string, (payload: unknown) => void> = {}
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: mockInvoke,
      on: (channel: string, handler: (...args: unknown[]) => void) => {
        handlers[channel] = handler as (payload: unknown) => void
        return () => {}
      },
    }
    await addTerminal('/a', 'manifold')
    expect(() => handlers['agent:exit']({ sessionId: 'someone-elses-agent', code: 0 })).not.toThrow()
    expect(getScope('/a').terminals).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- src/renderer/components/terminal/shell-terminal-store.test.ts -t "agent:exit"`
Expected: FAIL — `handlers['agent:exit'] is not a function` (nothing subscribed).

- [ ] **Step 3: Implement lazy arming**

Add to `shell-terminal-store.ts`, and call `ensureExitSubscription()` as the first line of both `openScope` and `addTerminal`:

```ts
let exitSubscribed = false

/** Arm the exit listener on first use, never at import time: tests install
 *  `window.electronAPI` in `beforeEach`, which runs after module evaluation, so
 *  a top-level subscribe would throw on import.
 *
 *  The flag is set *after* a successful subscribe — set it first and a throwing
 *  `on` would latch the module into "already subscribed" with no listener. */
function ensureExitSubscription(): void {
  if (exitSubscribed) return
  window.electronAPI.on('agent:exit', (...args: unknown[]) => {
    const { sessionId } = args[0] as { sessionId: string }
    for (const [cwd, scope] of scopes) {
      if (scope.terminals.some((t) => t.sessionId === sessionId)) {
        closeTerminal(cwd, sessionId, { kill: false })
      }
    }
  })
  exitSubscribed = true
}
```

Extend `resetShellTerminalStore()` with `exitSubscribed = false`.

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/renderer/components/terminal/shell-terminal-store.test.ts`
Expected: PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/terminal/shell-terminal-store.ts src/renderer/components/terminal/shell-terminal-store.test.ts
git commit -m "feat(terminal): drop a terminal tab when its shell exits"
```

---

### Task 5: The renderer swap

**Files:**
- Modify: `src/renderer/components/terminal/ShellTabs.tsx`
- Modify: `src/renderer/components/terminal/ShellTabControls.tsx`
- Modify: `src/renderer/components/terminal/ShellHeaderActions.tsx`
- Modify: `src/renderer/components/terminal/shell-header-controls.ts`
- Modify: `src/renderer/components/terminal/ShellTabs.styles.ts`
- Modify: `src/renderer/components/editor/editor-shell/dock-panels.tsx:116-128`
- Modify: `src/renderer/components/DockPreview.fixture.tsx:45-52`
- Delete: `src/renderer/components/terminal/shell-tabs-hooks.ts`
- Test: `src/renderer/components/terminal/ShellTabs.test.tsx` and `ShellHeaderActions.test.tsx` (both rewritten)

**This lands as one commit** — `ShellHeaderControls` is the shared type between `ShellTabs` and the header, so its shape change and both consumers must move together or the tree won't typecheck.

**What each piece becomes:**

- `ShellTabs` holds no terminal state and no error state. It reads `getScope(cwd)` through `useSyncExternalStore`, calls `openScope(cwd)` in an effect, renders one `<ShellTerminalView>` per terminal (all mounted, only the active one `display: block`, as today), and registers header controls.
- `ShellTabControls` maps the flat list. Its hardcoded "Shell" button (`:18-23`) is gone.
- `ShellHeaderActions` gets three controls: `+` (immediate), `⌄` (the existing menu), and a kill button. **Two** things currently hide it must go: the `!canAddShell && !showShellTabs` early return (`:57`) *and* the `{controls.canAddShell && (…)}` wrapper around the buttons (`:66`). Remove only the first and the controls still vanish with no workspace, which is what spec §3 forbids. The `activePanel?.id !== 'shell'` return (`:55`) stays.
- `dock-panels.tsx` `ShellPanel` computes the cwd itself from dock state it already has.

**Note on a deliberate divergence from spec §2:** the spec lists an `onKillActive` handler on `ShellHeaderControls`. This plan drops it — the header already knows `activeSessionId`, so it can call `onCloseTerminal(activeSessionId)` and the extra handler earns nothing.

- [ ] **Step 1: Rewrite the controls contract**

`src/renderer/components/terminal/shell-header-controls.ts` — replace the interface (the pub/sub below it is unchanged):

```ts
import type { ShellMode, ShellTerminal } from './shell-terminal-store'

export interface ShellHeaderControls {
  canAddShell: boolean
  terminals: ShellTerminal[]
  activeSessionId: string | null
  onSetActiveTerminal: (sessionId: string) => void
  onCloseTerminal: (sessionId: string) => void
  onAddShell: (mode: ShellMode) => void
}
```

- [ ] **Step 2: Write the failing tests**

Rewrite `src/renderer/components/terminal/ShellTabs.test.tsx`. Keep the existing `vi.mock` of `useTerminal`, add `resetShellTerminalStore()` to `beforeEach`, and **extend the `electronAPI` stub with `on`** — the current stub is `invoke`-only (`ShellTabs.test.tsx:22-25`), and Task 4 made `ensureExitSubscription()` the first thing `openScope` does, so without this every test throws `window.electronAPI.on is not a function` before a shell is ever created:

```ts
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => () => {}),
  }
```

Then cover:

```ts
it('opens a terminal with no agent session', async () => {
  render(<ShellTabs cwd="/worktrees/checkout" scrollbackLines={1000} />)
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('shell:create', '/worktrees/checkout', { mode: 'manifold' }))
})

it('creates exactly one terminal under StrictMode', async () => {
  renderWithStrictMode(<ShellTabs cwd="/worktrees/checkout" scrollbackLines={1000} />)
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('shell:create', expect.anything(), expect.anything()))
  expect(mockInvoke.mock.calls.filter((c) => c[0] === 'shell:create')).toHaveLength(1)
  expect(mockInvoke).not.toHaveBeenCalledWith('shell:kill', expect.anything())
})

it('shows the empty state and no shell:create when no workspace resolves', () => {
  render(<ShellTabs cwd={null} scrollbackLines={1000} />)
  expect(screen.getByText(/select a workspace/i)).toBeInTheDocument()
  expect(mockInvoke).not.toHaveBeenCalledWith('shell:create', expect.anything(), expect.anything())
})

it('surfaces a failed open in the error strip', async () => {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'shell-tabs:get') return Promise.resolve(null)
    if (channel === 'shell:create') return Promise.reject(new Error('spawn failed'))
    return Promise.resolve(undefined)
  })
  render(<ShellTabs cwd="/gone" scrollbackLines={1000} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('spawn failed')
})
```

The header controls (`+`, chevron, kill) are tested in `ShellHeaderActions.test.tsx` — Step 6a — not here, because they need the header rendered and control registration awaited.

Import `renderWithStrictMode` from `../../test-utils/strict-mode.test-helpers` (note: the helper is in `strict-mode.test-helpers.tsx:25`, **not** in `strict-mode.test.tsx`).

- [ ] **Step 3: Run and watch them fail**

Run: `npm test -- src/renderer/components/terminal/ShellTabs.test.tsx`
Expected: FAIL — `ShellTabs` still requires `worktreeSessionId` / `projectSessionId`.

- [ ] **Step 4: Rewrite `ShellTabs.tsx`**

```tsx
import React, { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { ITheme } from '@xterm/xterm'
import { useTerminal } from '../../hooks/terminal/useTerminal'
import { shellTabStyles as styles } from './ShellTabs.styles'
import { registerShellHeaderControls, unregisterShellHeaderControls } from './shell-header-controls'
import {
  addTerminal, closeTerminal, dismissScopeError, getScope, openScope,
  setActiveTerminal, subscribeShellTerminals, type ShellMode,
} from './shell-terminal-store'

interface ShellTabsProps {
  cwd: string | null
  scrollbackLines: number
  terminalFontFamily?: string
  xtermTheme?: ITheme
}

function ShellTerminalView({
  sessionId, scrollbackLines, terminalFontFamily, xtermTheme, isActive,
}: {
  sessionId: string; scrollbackLines: number; terminalFontFamily?: string
  xtermTheme?: ITheme; isActive: boolean
}): React.JSX.Element {
  const { containerRef } = useTerminal({ sessionId, scrollbackLines, terminalFontFamily, xtermTheme })
  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className="terminal-host"
      style={{ ...styles.terminalContainer, display: isActive ? 'block' : 'none' }}
    />
  )
}

export function ShellTabs({
  cwd, scrollbackLines, terminalFontFamily, xtermTheme,
}: ShellTabsProps): React.JSX.Element {
  // No local error state: the panel unmounts on close, so anything held here
  // would either vanish or come back from the dead on reopen. The store owns
  // both the message and its dismissal, scoped to the cwd that produced it.
  const scope = useSyncExternalStore(subscribeShellTerminals, () => getScope(cwd))

  useEffect(() => {
    if (!cwd) return
    void openScope(cwd)
  }, [cwd])

  const addShell = useCallback((mode: ShellMode) => {
    if (cwd) void addTerminal(cwd, mode)
  }, [cwd])

  const closeShell = useCallback((sessionId: string) => {
    if (cwd) closeTerminal(cwd, sessionId)
  }, [cwd])

  const selectShell = useCallback((sessionId: string) => {
    if (cwd) setActiveTerminal(cwd, sessionId)
  }, [cwd])

  const headerControls = React.useMemo(() => ({
    canAddShell: Boolean(cwd),
    terminals: scope.terminals,
    activeSessionId: scope.activeSessionId,
    onSetActiveTerminal: selectShell,
    onCloseTerminal: closeShell,
    onAddShell: addShell,
  }), [cwd, scope.terminals, scope.activeSessionId, selectShell, closeShell, addShell])

  useEffect(() => {
    registerShellHeaderControls(headerControls)
    return () => unregisterShellHeaderControls(headerControls)
  }, [headerControls])

  return (
    <div style={styles.wrapper}>
      {scope.error && cwd && (
        <div style={styles.errorStrip} role="alert">
          {scope.error}
          <button type="button" style={styles.errorDismiss} onClick={() => dismissScopeError(cwd)}>×</button>
        </div>
      )}
      <div style={styles.terminalArea}>
        {scope.terminals.length === 0 && (
          <div style={styles.emptyState}>
            {cwd
              ? <button type="button" onClick={() => addShell('manifold')}>New Terminal</button>
              : 'Select a workspace to open a terminal'}
          </div>
        )}
        {scope.terminals.map((terminal) => (
          <ShellTerminalView
            key={terminal.sessionId}
            sessionId={terminal.sessionId}
            scrollbackLines={scrollbackLines}
            terminalFontFamily={terminalFontFamily}
            xtermTheme={xtermTheme}
            isActive={scope.activeSessionId === terminal.sessionId}
          />
        ))}
      </div>
    </div>
  )
}
```

Add these to `ShellTabs.styles.ts`. Do not skip this: `shellTabStyles` is typed `Record<string, React.CSSProperties>`, so a missing key silently yields `style={undefined}` with no compiler error.

```ts
  errorStrip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '4px 8px',
    fontSize: 'inherit',
    color: 'var(--text-primary)',
    background: 'var(--bg-elevated)',
    borderBottom: '1px solid var(--border)',
  },
  errorDismiss: {
    padding: 0,
    fontSize: '14px',
    lineHeight: 1,
    color: 'var(--text-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
```

- [ ] **Step 5: Rewrite `ShellTabControls.tsx`** to map `terminals`, comparing against `activeSessionId`, calling `onSetActiveTerminal` / `onCloseTerminal`. Drop the hardcoded "Shell" button.

- [ ] **Step 6: Update `ShellHeaderActions.tsx`**

- Delete the `if (!controls.canAddShell && !showShellTabs) return null` line (`:57`); keep the `activePanel?.id !== 'shell'` guard (`:55`).
- **Also delete the `{controls.canAddShell && (…)}` wrapper around the buttons (`:66`).** Two separate things hide the header today; removing only the early return leaves the controls invisible with no workspace, which is what spec §3 forbids. Rely on `disabled` instead.
- `+` button: `onClick={() => controls.onAddShell('manifold')}`, `disabled={!controls.canAddShell}`.
- New chevron button next to it, `aria-label="Shell options"`, which toggles the existing menu (move the current `onClick={() => setMenuOpen(...)}` and `aria-haspopup`/`aria-expanded` onto it).
- New kill button, `aria-label="Kill Terminal"`, `disabled={!controls.activeSessionId}`, calling `controls.onCloseTerminal(controls.activeSessionId!)`.
- Render `ShellTabControls` when `controls.terminals.length > 1`.

- [ ] **Step 6a: Rewrite `ShellHeaderActions.test.tsx`**

This is a rewrite, not a patch. Four sites break, not just the controls literal at `:25-32`:

- `:43` — `getByRole('button', { name: 'Shell' })` is the hardcoded main tab Step 5 deletes.
- `:45-46` — the tab-order assertions are built on that main tab.
- `:60` — asserts `onSetActiveTab('extra-shell-2')`, using the retired `extra-<id>` scheme.
- The fixture registers **one** terminal, but the strip now renders only when there is more than one, so it won't exist at all.

Register **two** terminals in the controls, assert `onSetActiveTerminal('shell-2')`, and add the spec's Testing item 8 coverage here: `+` calls `onAddShell('manifold')` with no menu opening; the chevron opens both menu items; the kill button calls `onCloseTerminal(activeSessionId)`; and the kill button is `disabled` when `terminals` is empty and `activeSessionId` is null.

- [ ] **Step 6b: Update `DockPreview.fixture.tsx:45-52`**

It passes a real object literal to `registerShellHeaderControls`, so unlike the `as unknown as DockAppState` dock fixtures it gets full property checking — leave it and `npm run typecheck` fails. Give it two terminals so the Task 9 screenshot shows the tab strip and an enabled kill button:

```ts
registerShellHeaderControls({
  canAddShell: true,
  terminals: [
    { sessionId: 'shell-1', label: 'Manifold 1', mode: 'manifold' },
    { sessionId: 'shell-2', label: 'System 2', mode: 'system' },
  ],
  activeSessionId: 'shell-1',
  onSetActiveTerminal: () => {},
  onCloseTerminal: () => {},
  onAddShell: () => {},
})
```

- [ ] **Step 7: Point `ShellPanel` at the resolver** — `dock-panels.tsx:116-128`, importing the helper alongside the existing `ShellTabs` import at `:7` (`import { resolveShellCwd } from '../../terminal/shell-cwd'`):

```tsx
function ShellPanel(): React.JSX.Element {
  const s = useDockState()
  const cwd = resolveShellCwd(s.workspaces, s.activeWorkspaceId, s.activeProjectId, s.projects)
  return (
    <ShellTabs
      cwd={cwd}
      scrollbackLines={s.scrollbackLines}
      terminalFontFamily={s.terminalFontFamily}
      xtermTheme={s.xtermTheme}
    />
  )
}
```

- [ ] **Step 8: Delete the old hooks module**

```bash
git rm src/renderer/components/terminal/shell-tabs-hooks.ts
```

All six hooks in it (`useSyncCacheOnAgentChange`, `useKeepCacheInSync`, `usePersistTabs`, `useRestoreTabsFromDisk`, `usePersistOnChange`, `useCleanupOnUnmount`) are now in the store. Its stale comment at `:70-73` — claiming the panel remounts on session switch — goes with it.

**Two files still import types from it and must be repointed to `./shell-terminal-store` first**, or the build breaks: `ShellHeaderActions.tsx:8` (`ShellMode`) and `ShellTabControls.tsx:2` (`ExtraShell` → `ShellTerminal`).

- [ ] **Step 9: Run the terminal tests**

Run: `npm test -- src/renderer/components/terminal/`
Expected: PASS.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: **clean.** This task leaves the tree fully green — the three dock-state fields removed in Task 6 are merely unused after this commit (an unused interface field and an unused write are not errors), so nothing is left failing. Any error you see here is real: most likely a missed import repoint from Step 8 or the fixture in Step 6b.

- [ ] **Step 11: Commit**

```bash
git add -A src/renderer/components/terminal src/renderer/components/editor/editor-shell/dock-panels.tsx
git commit -m "feat(terminal): flatten shell panel onto the cwd-keyed store"
```

---

### Task 6: Drop the agent-derived wiring

**Files:**
- Modify: `src/renderer/components/editor/editor-shell/dock-panel-types.ts:73-75`
- Modify: `src/renderer/App.tsx:10`, `:192-195`, `:334-335`
- Delete: `src/renderer/hooks/terminal/useShellSession.ts`, `src/renderer/hooks/terminal/useShellSession.test.ts`
- Test: `dock-panels.test.tsx`, `EditorPaneActions.test.tsx`, `src/renderer/DockTab.test.tsx:53-55` (note: at the `src/renderer` root, not under `components/`)

These three dock-state fields now have no readers: `worktreeShellSessionId`, `projectShellSessionId`, `worktreeCwd`.

- [ ] **Step 1: Remove the fields** from `dock-panel-types.ts:73-75` (including the `// Shell` comment above them).

- [ ] **Step 2: Remove the App wiring** — the `useShellSessions` import (`App.tsx:10`), the four lines at `:192-195` (`worktreeShellCwd`, `shellProjectCwd`, `shellSessionKey`, and the `useShellSessions` call), and the three assignments at `:334-335`.

- [ ] **Step 3: Delete the hook and its test**

```bash
git rm src/renderer/hooks/terminal/useShellSession.ts src/renderer/hooks/terminal/useShellSession.test.ts
```

- [ ] **Step 4: Update the three test fixtures** — drop the same three fields from `dock-panels.test.tsx`, `EditorPaneActions.test.tsx`, and `DockTab.test.tsx:53-55`.

**Find them by grep, not by compiler output.** All three fixtures end in `as unknown as DockAppState` (`dock-panels.test.tsx:128`, `DockTab.test.tsx:86`, `EditorPaneActions.test.tsx:78`), which suppresses excess- and missing-property checks — a leftover field compiles happily. Run:

```bash
rg 'worktreeShellSessionId|projectShellSessionId|worktreeCwd' src
```

Expected after this task: no matches.

- [ ] **Step 5: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(terminal): remove agent-derived shell session wiring"
```

---

### Task 7: Ungate the rail

**Files:**
- Modify: `src/renderer/components/ActivityBar.tsx:82-84`, `:94`
- Test: `src/renderer/components/ActivityBar.test.tsx`

- [ ] **Step 1: Amend the existing test**

Do **not** add a new test — there is already one asserting the opposite at `ActivityBar.test.tsx:118-127`, and leaving it would fail the suite. Move `'Shell'` into the enabled list:

```ts
  it('disables session-dependent panels when no session is active', () => {
    renderRail(makeDockLayout(), { hasActiveSession: false })

    for (const label of ['Explorer', 'Source Control', 'Search', 'Agent', 'Shell']) {
      expect(screen.getByRole('button', { name: label })).toBeEnabled()
    }
    expect(screen.getByRole('button', { name: 'Editor' })).toBeDisabled()
  })
```

That is exactly the spec's Testing item 7.

- [ ] **Step 2: Run and watch it fail**

Run: `npm test -- src/renderer/components/ActivityBar.test.tsx`
Expected: FAIL — the Shell button is disabled.

- [ ] **Step 3: Drop `sessionOnly: true`** from the shell entry at `:94`, and narrow the comment at `:82-84` to the editor. That comment currently justifies the gate by pointing at the status bar, which no longer has a shell toggle (`src/renderer/components/git/StatusBar.test.tsx:118` asserts its absence).

- [ ] **Step 4: Run**

Run: `npm test -- src/renderer/components/ActivityBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/ActivityBar.tsx src/renderer/components/ActivityBar.test.tsx
git commit -m "feat(shell): allow opening the shell panel without an agent"
```

---

### Task 8: Type fix and documentation

**Files:**
- Modify: `src/main/store/shell-tab-store.ts:6-9`
- Modify: `docs/architecture/renderer.md`, `docs/architecture/store.md`

- [ ] **Step 1: Add the missing field.** `SavedShellTab` is `{ label, cwd }`, but the renderer has always written a `mode` too, and it survives via the `{ ...t }` spread at `:59`/`:65`. Make the type honest:

```ts
export interface SavedShellTab {
  label: string
  cwd: string
  mode?: 'manifold' | 'system'
}
```

- [ ] **Step 2: Update the docs** (`CLAUDE.md` §5 — code changes update their covering page in the same PR; bump each page's `updated:`):
  - `renderer.md` — rail gating (`:60-63`), the Shell panel's `+`/chevron/kill and flat tabs (`:128-129`, `:242`), and that terminals now survive closing the panel.
  - `store.md` — `:29` and `:130` describe `ShellTabStore` as keyed "per agent"; it is keyed per workspace checkout path.

  Two pages the spec mentions need **no** change, checked so you don't go looking: `gotchas.md` (the panel-close-kills-PTYs behaviour was never indexed there, and its `covers:` list has no terminal path) and `ipc.md` (its `shell:*` references are channel routing and imply nothing agent-scoped; no channel changes here anyway).

- [ ] **Step 3: Lint the wiki**

Run: `bash scripts/wiki-lint.sh`
Expected: no STALE entry for the pages you touched.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs(terminal): sync architecture pages with agentless terminals"
```

---

### Task 9: Verify it for real

Tests prove code correctness, not feature correctness. `CLAUDE.md` §4 requires seeing renderer changes work before calling them done.

- [ ] **Step 1: Full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: both clean.

- [ ] **Step 2: Component screenshot** — header chrome only

Run: `npm run screenshot:component DockPreview --theme <your theme>`
Check: `+`, chevron, and kill render in the shell panel header, correctly spaced, with kill disabled when empty. The fixture mounts the shell panel as a placeholder (`DockPreview.fixture.tsx:34`), so it cannot show a live terminal — that's Step 3.

- [ ] **Step 3: Drive the built app**

Run: `npm run build && npm run drive:app`

With **no agent running**, confirm each of:
1. The Shell rail icon is enabled and opens the panel.
2. A live prompt appears, in the workspace checkout directory (`pwd` to confirm).
3. `+` adds a second terminal and switches to it; the tab strip appears at two.
4. The chevron offers a System shell and creates one.
5. The kill button closes terminals down to the empty state; reopening the panel does **not** respawn one.
6. `exit` in a terminal removes its tab.
7. Start `sleep 300`, close the Shell panel, reopen it — **the process is still running**. This is the regression this work exists to fix.
8. Switch workspace: a different terminal set appears. Switch back: the first set is intact.

- [ ] **Step 4: Commit any fixes, then open the PR**

Use the repo's `gh-create-pr` skill. Link the spec (`docs/superpowers/specs/2026-08-05-agentless-terminals-design.md`) in the PR body and list what Step 3 verified.

---

## Risks

**xterm resize on tab switch.** Terminals are hidden with `display: none`, as today. If a switched-to terminal renders at the wrong size, that's the FitAddon not re-fitting on display change — check `useTerminal`'s resize observer rather than reworking the tab model.

**PTY accumulation.** Terminals for a workspace stay alive after switching away, by design. Visiting many workspaces in one session leaves many PTYs. Main reaps them on quit (`app-lifecycle.ts:96-97`). If this proves heavy in practice, an idle-eviction policy is a separate change.

**Restore storm.** A workspace with many saved tabs spawns them serially on first open. Existing behaviour, unchanged, but now includes what used to be the main shell.
