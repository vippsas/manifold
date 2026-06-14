# Worktrees Overview — Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a builtin-only `workspace:manage` plugin capability backed by a pure, unit-tested `worktree-overview-service` that lists every Manifold-managed worktree across all registered repos (with status/ahead-behind/dirty/last-commit/locked), removes one (guarded), and prunes stale ones.

**Architecture:** A dependency-injected main service (`createWorktreeOverviewService`) over `ProjectRegistry` + `SessionManager` + `WorktreeManager` + git status helpers — testable with plain fakes. It is surfaced to built-in plugins via the existing privileged-API pattern (capability → `ManifoldApi.worktrees` → plugin-host factory → RPC → main service registered in `ExtensionHost` behind `assertBuiltin`). No UI in this phase.

**Tech Stack:** TypeScript, Electron main process, vitest. Follows the `agents`/`lm` privileged-API precedent (PR #443).

This is Phase 1 of the #744 plan set (see `docs/superpowers/specs/2026-06-14-worktrees-global-plugin-design.md`). Follow-ups: P-home-layer (navigation), P-global-view (`scope:'global'` routing), P-plugin (`manifold.worktrees` webview).

---

## File Structure

- **Create** `src/main/git/worktree-status.ts` — git helpers: `getWorktreeDirty`, `getWorktreeLastCommitISO`.
- **Create** `src/main/git/worktree-status.test.ts` — unit tests (mock `./git-exec`).
- **Create** `src/main/plugins/worktree-overview-service.ts` — the DI service + `WorktreeOverviewDeps`.
- **Create** `src/main/plugins/worktree-overview-service.test.ts` — unit tests with fakes.
- **Modify** `src/shared/plugins/api-types.ts` — add `WorktreeStatus`, `WorktreeOverviewEntry`, `ManifoldApi.worktrees`.
- **Modify** `src/shared/plugins/manifest.ts` — add `'workspace:manage'` capability (builtin-only).
- **Modify** `src/shared/plugins/rpc.ts` — add `HOST_WORKTREES` constant.
- **Create** `src/plugin-host/worktrees-api.ts` — plugin-host factory wrapping the RPC proxy.
- **Modify** `src/plugin-host/gated-api.ts` — add `worktrees` factory + gated getter.
- **Modify** `src/plugin-host/index.ts` — wire the `worktrees` factory.
- **Modify** `src/main/plugins/extension-host.ts` — accept the service, register `HOST_WORKTREES`.
- **Modify** `src/main/plugins/plugin-manager.ts` — construct the service, pass to `ExtensionHost`.
- **Modify** `src/main/app/index.ts` — pass `worktreeManager` + `projectRegistry` to `PluginManager`.

---

### Task 1: git status helpers

**Files:**
- Create: `src/main/git/worktree-status.ts`
- Test: `src/main/git/worktree-status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/git/worktree-status.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./git-exec', () => ({ gitExec: vi.fn() }))

import { gitExec } from './git-exec'
import { getWorktreeDirty, getWorktreeLastCommitISO } from './worktree-status'

const mockGitExec = vi.mocked(gitExec)

describe('worktree-status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dirty when porcelain output is non-empty', async () => {
    mockGitExec.mockResolvedValue(' M src/file.ts\n')
    expect(await getWorktreeDirty('/wt')).toBe(true)
    expect(mockGitExec).toHaveBeenCalledWith(['status', '--porcelain'], '/wt')
  })

  it('clean when porcelain output is empty', async () => {
    mockGitExec.mockResolvedValue('')
    expect(await getWorktreeDirty('/wt')).toBe(false)
  })

  it('treats git failure as not-dirty', async () => {
    mockGitExec.mockRejectedValue(new Error('boom'))
    expect(await getWorktreeDirty('/wt')).toBe(false)
  })

  it('returns trimmed ISO commit date', async () => {
    mockGitExec.mockResolvedValue('2026-06-10T12:00:00+02:00\n')
    expect(await getWorktreeLastCommitISO('/wt')).toBe('2026-06-10T12:00:00+02:00')
    expect(mockGitExec).toHaveBeenCalledWith(['log', '-1', '--format=%cI'], '/wt')
  })

  it('returns null when there are no commits / on error', async () => {
    mockGitExec.mockRejectedValue(new Error('no head'))
    expect(await getWorktreeLastCommitISO('/wt')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/main/git/worktree-status.test.ts`
Expected: FAIL — cannot resolve `./worktree-status`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/git/worktree-status.ts
import { gitExec } from './git-exec'

/** True when the worktree has uncommitted changes (staged or unstaged). */
export async function getWorktreeDirty(worktreePath: string): Promise<boolean> {
  try {
    const out = await gitExec(['status', '--porcelain'], worktreePath)
    return out.trim().length > 0
  } catch {
    return false
  }
}

/** ISO-8601 date of the worktree's last commit, or null if none / on error. */
export async function getWorktreeLastCommitISO(worktreePath: string): Promise<string | null> {
  try {
    const out = await gitExec(['log', '-1', '--format=%cI'], worktreePath)
    const trimmed = out.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run src/main/git/worktree-status.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/git/worktree-status.ts src/main/git/worktree-status.test.ts
git commit -m "feat(git): worktree dirty + last-commit status helpers (#744)"
```

---

### Task 2: shared types — `WorktreeStatus`, `WorktreeOverviewEntry`

**Files:**
- Modify: `src/shared/plugins/api-types.ts`

- [ ] **Step 1: Add the types** (place above `export interface ManifoldApi`)

```ts
export type WorktreeStatus = 'active' | 'idle' | 'stale'

/** One Manifold-managed worktree in the overview. */
export interface WorktreeOverviewEntry {
  worktreePath: string
  projectId: string
  projectName: string
  branch: string
  /** active = a live agent owns it; idle = managed, no live agent; stale = directory gone. */
  status: WorktreeStatus
  /** The owning agent session, when one exists. */
  sessionId: string | null
  ahead: number
  behind: number
  dirty: boolean
  lastCommitISO: string | null
  locked: boolean
}
```

> v1 note: the spec's `unpushed` is represented by `ahead > 0` (a slight, safe over-guard); no separate field.

- [ ] **Step 2: Typecheck**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.node.json`
Expected: no new errors from this file (baseline node errors are pre-existing; see project memory `project_typecheck_gates`).

- [ ] **Step 3: Commit**

```bash
git add src/shared/plugins/api-types.ts
git commit -m "feat(plugins): WorktreeOverviewEntry shared type (#744)"
```

---

### Task 3: `worktree-overview-service.list()`

**Files:**
- Create: `src/main/plugins/worktree-overview-service.ts`
- Test: `src/main/plugins/worktree-overview-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/plugins/worktree-overview-service.test.ts
import { describe, it, expect } from 'vitest'
import { createWorktreeOverviewService, type WorktreeOverviewDeps } from './worktree-overview-service'
import type { Project, AgentSession } from '../../shared/types'

function project(over: Partial<Project> = {}): Project {
  return { id: 'p1', name: 'manifold', path: '/repos/manifold', baseBranch: 'main', addedAt: '', kind: 'git', ...over }
}
function session(over: Partial<AgentSession> = {}): AgentSession {
  return { id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'feat', worktreePath: '/wt/a', status: 'running', pid: 123, additionalDirs: [], ...over }
}

function deps(over: Partial<WorktreeOverviewDeps> = {}): WorktreeOverviewDeps {
  return {
    listProjects: () => [project()],
    listSessions: () => [],
    listWorktrees: async () => [{ branch: 'feat', path: '/wt/a' }],
    getAheadBehind: async () => ({ ahead: 0, behind: 0 }),
    getDirty: async () => false,
    getLastCommitISO: async () => '2026-06-10T12:00:00Z',
    readMeta: async () => ({ runtimeId: 'claude' }),
    removeWorktree: async () => {},
    pathExists: () => true,
    ...over,
  }
}

describe('worktree-overview-service.list', () => {
  it('marks active when a live agent owns the worktree', async () => {
    const svc = createWorktreeOverviewService(deps({ listSessions: () => [session({ worktreePath: '/wt/a', pid: 123 })] }))
    const [entry] = await svc.list()
    expect(entry.status).toBe('active')
    expect(entry.sessionId).toBe('s1')
    expect(entry.projectName).toBe('manifold')
    expect(entry.branch).toBe('feat')
  })

  it('marks idle when managed but no live agent', async () => {
    const svc = createWorktreeOverviewService(deps({ listSessions: () => [] }))
    const [entry] = await svc.list()
    expect(entry.status).toBe('idle')
    expect(entry.sessionId).toBeNull()
  })

  it('marks idle when a session exists but its process is dead (pid null)', async () => {
    const svc = createWorktreeOverviewService(deps({ listSessions: () => [session({ worktreePath: '/wt/a', pid: null })] }))
    const [entry] = await svc.list()
    expect(entry.status).toBe('idle')
  })

  it('marks stale when the directory is gone and skips git calls', async () => {
    let gitCalled = false
    const svc = createWorktreeOverviewService(deps({
      pathExists: () => false,
      getAheadBehind: async () => { gitCalled = true; return { ahead: 1, behind: 0 } },
    }))
    const [entry] = await svc.list()
    expect(entry.status).toBe('stale')
    expect(entry.ahead).toBe(0)
    expect(entry.dirty).toBe(false)
    expect(gitCalled).toBe(false)
  })

  it('reads locked from worktree meta and ignores non-git projects', async () => {
    const svc = createWorktreeOverviewService(deps({
      listProjects: () => [project(), project({ id: 'p2', name: 'plain', path: '/repos/plain', kind: 'folder' })],
      readMeta: async () => ({ runtimeId: 'claude', locked: true }),
    }))
    const entries = await svc.list()
    expect(entries).toHaveLength(1)
    expect(entries[0].locked).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest run src/main/plugins/worktree-overview-service.test.ts`
Expected: FAIL — cannot resolve `./worktree-overview-service`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/plugins/worktree-overview-service.ts
import type { Project, AgentSession, AheadBehind } from '../../shared/types'
import type { WorktreeOverviewEntry, WorktreeStatus } from '../../shared/plugins/api-types'
import type { WorktreeInfo } from '../git/worktree-manager'
import type { WorktreeMeta } from '../git/worktree-meta'
import { isGitProject } from '../../shared/project-kind'

export interface WorktreeOverviewDeps {
  listProjects(): Project[]
  listSessions(): AgentSession[]
  listWorktrees(projectPath: string): Promise<WorktreeInfo[]>
  getAheadBehind(worktreePath: string, baseBranch: string): Promise<AheadBehind>
  getDirty(worktreePath: string): Promise<boolean>
  getLastCommitISO(worktreePath: string): Promise<string | null>
  readMeta(worktreePath: string): Promise<WorktreeMeta | null>
  removeWorktree(projectPath: string, worktreePath: string): Promise<void>
  pathExists(p: string): boolean
}

export interface WorktreeOverviewService {
  list(): Promise<WorktreeOverviewEntry[]>
  remove(worktreePath: string, opts?: { force?: boolean }): Promise<void>
  pruneStale(): Promise<string[]>
}

export function createWorktreeOverviewService(deps: WorktreeOverviewDeps): WorktreeOverviewService {
  const gitProjects = (): Project[] => deps.listProjects().filter((p) => isGitProject(p))

  async function locate(worktreePath: string): Promise<Project | null> {
    for (const project of gitProjects()) {
      let worktrees: WorktreeInfo[]
      try { worktrees = await deps.listWorktrees(project.path) } catch { continue }
      if (worktrees.some((w) => w.path === worktreePath)) return project
    }
    return null
  }

  return {
    async list(): Promise<WorktreeOverviewEntry[]> {
      const sessionsByPath = new Map(deps.listSessions().map((s) => [s.worktreePath, s]))
      const out: WorktreeOverviewEntry[] = []
      for (const project of gitProjects()) {
        let worktrees: WorktreeInfo[]
        try { worktrees = await deps.listWorktrees(project.path) } catch { continue }
        for (const wt of worktrees) {
          const session = sessionsByPath.get(wt.path)
          const exists = deps.pathExists(wt.path)
          const meta = await deps.readMeta(wt.path)
          let status: WorktreeStatus
          if (!exists) status = 'stale'
          else if (session && session.pid != null) status = 'active'
          else status = 'idle'
          const ab = exists ? await deps.getAheadBehind(wt.path, project.baseBranch) : { ahead: 0, behind: 0 }
          out.push({
            worktreePath: wt.path,
            projectId: project.id,
            projectName: project.name,
            branch: wt.branch,
            status,
            sessionId: session?.id ?? null,
            ahead: ab.ahead,
            behind: ab.behind,
            dirty: exists ? await deps.getDirty(wt.path) : false,
            lastCommitISO: exists ? await deps.getLastCommitISO(wt.path) : null,
            locked: meta?.locked ?? false,
          })
        }
      }
      return out
    },

    async remove(worktreePath, opts): Promise<void> {
      const project = await locate(worktreePath)
      if (!project) throw new Error(`worktree not found: ${worktreePath}`)
      const meta = await deps.readMeta(worktreePath)
      if (meta?.locked) throw new Error(`worktree is locked: ${worktreePath}`)
      if (deps.pathExists(worktreePath) && !opts?.force) {
        const dirty = await deps.getDirty(worktreePath)
        const { ahead } = await deps.getAheadBehind(worktreePath, project.baseBranch)
        if (dirty || ahead > 0) {
          throw new Error(`GUARD: ${worktreePath} has uncommitted or unpushed changes; pass force to remove`)
        }
      }
      await deps.removeWorktree(project.path, worktreePath)
    },

    async pruneStale(): Promise<string[]> {
      const removed: string[] = []
      for (const project of gitProjects()) {
        let worktrees: WorktreeInfo[]
        try { worktrees = await deps.listWorktrees(project.path) } catch { continue }
        for (const wt of worktrees) {
          if (deps.pathExists(wt.path)) continue
          const meta = await deps.readMeta(wt.path)
          if (meta?.locked) continue
          try { await deps.removeWorktree(project.path, wt.path); removed.push(wt.path) } catch { /* per-row: skip failures */ }
        }
      }
      return removed
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest run src/main/plugins/worktree-overview-service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/plugins/worktree-overview-service.ts src/main/plugins/worktree-overview-service.test.ts
git commit -m "feat(plugins): worktree-overview-service list() (#744)"
```

---

### Task 4: `remove()` guard + `pruneStale()` tests

**Files:**
- Modify: `src/main/plugins/worktree-overview-service.test.ts`

(The implementation from Task 3 already includes `remove`/`pruneStale`; this task adds their tests.)

- [ ] **Step 1: Append tests**

```ts
describe('worktree-overview-service.remove', () => {
  it('refuses a dirty worktree without force', async () => {
    const svc = createWorktreeOverviewService(deps({ getDirty: async () => true }))
    await expect(svc.remove('/wt/a')).rejects.toThrow(/uncommitted or unpushed/)
  })

  it('refuses a worktree that is ahead of base without force', async () => {
    const svc = createWorktreeOverviewService(deps({ getAheadBehind: async () => ({ ahead: 2, behind: 0 }) }))
    await expect(svc.remove('/wt/a')).rejects.toThrow(/uncommitted or unpushed/)
  })

  it('removes a dirty worktree when force is set', async () => {
    let removed = ''
    const svc = createWorktreeOverviewService(deps({ getDirty: async () => true, removeWorktree: async (_p, wt) => { removed = wt } }))
    await svc.remove('/wt/a', { force: true })
    expect(removed).toBe('/wt/a')
  })

  it('refuses to remove a locked worktree even with force', async () => {
    const svc = createWorktreeOverviewService(deps({ readMeta: async () => ({ runtimeId: 'c', locked: true }) }))
    await expect(svc.remove('/wt/a', { force: true })).rejects.toThrow(/locked/)
  })

  it('removes a clean idle worktree directly', async () => {
    let removed = ''
    const svc = createWorktreeOverviewService(deps({ removeWorktree: async (_p, wt) => { removed = wt } }))
    await svc.remove('/wt/a')
    expect(removed).toBe('/wt/a')
  })
})

describe('worktree-overview-service.pruneStale', () => {
  it('removes only dir-gone, unlocked worktrees and returns their paths', async () => {
    const removed: string[] = []
    const svc = createWorktreeOverviewService(deps({
      listWorktrees: async () => [
        { branch: 'gone', path: '/wt/gone' },
        { branch: 'live', path: '/wt/live' },
        { branch: 'locked', path: '/wt/locked' },
      ],
      pathExists: (p) => p === '/wt/live',
      readMeta: async (p) => (p === '/wt/locked' ? { runtimeId: 'c', locked: true } : { runtimeId: 'c' }),
      removeWorktree: async (_p, wt) => { removed.push(wt) },
    }))
    const result = await svc.pruneStale()
    expect(removed).toEqual(['/wt/gone'])
    expect(result).toEqual(['/wt/gone'])
  })
})
```

- [ ] **Step 2: Run tests**

Run: `node_modules/.bin/vitest run src/main/plugins/worktree-overview-service.test.ts`
Expected: PASS (11 tests total).

- [ ] **Step 3: Commit**

```bash
git add src/main/plugins/worktree-overview-service.test.ts
git commit -m "test(plugins): worktree-overview-service remove guard + pruneStale (#744)"
```

---

### Task 5: capability + RPC constant + API namespace

**Files:**
- Modify: `src/shared/plugins/manifest.ts`
- Modify: `src/shared/plugins/rpc.ts`
- Modify: `src/shared/plugins/api-types.ts`

- [ ] **Step 1: Add the capability** (`manifest.ts`)

```ts
export const CAPABILITIES = ['storage', 'workspace:read', 'workspace:manage', 'configuration', 'agent:control', 'agent:spawn', 'lm', 'transcription:read'] as const
```

```ts
export const BUILTIN_ONLY_CAPABILITIES = ['workspace:manage', 'agent:control', 'agent:spawn', 'lm', 'transcription:read'] as const satisfies readonly Capability[]
```

- [ ] **Step 2: Add the RPC constant** (`rpc.ts`, after `HOST_TRANSCRIPTION`)

```ts
export const HOST_WORKTREES = 'HostWorktrees'       // main, called by host (list/remove/prune managed worktrees)
```

- [ ] **Step 3: Add the API namespace** (`api-types.ts`, inside `ManifoldApi`, after `transcription`)

```ts
  worktrees: {
    /** [workspace:manage] All Manifold-managed worktrees across all registered repos. */
    list(): Promise<WorktreeOverviewEntry[]>
    /** [workspace:manage] Remove one managed worktree. Rejects on uncommitted/unpushed/locked unless `force`. */
    remove(worktreePath: string, opts?: { force?: boolean }): Promise<void>
    /** [workspace:manage] Remove all stale (directory-gone) managed worktrees; returns removed paths. */
    pruneStale(): Promise<string[]>
  }
```

- [ ] **Step 4: Typecheck**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.node.json 2>&1 | grep -E "manifest|rpc|api-types" || echo "no new errors in changed files"`
Expected: `no new errors in changed files`.

- [ ] **Step 5: Commit**

```bash
git add src/shared/plugins/manifest.ts src/shared/plugins/rpc.ts src/shared/plugins/api-types.ts
git commit -m "feat(plugins): workspace:manage capability + worktrees API surface (#744)"
```

---

### Task 6: plugin-host factory + gated-api wiring

**Files:**
- Create: `src/plugin-host/worktrees-api.ts`
- Modify: `src/plugin-host/gated-api.ts`
- Modify: `src/plugin-host/index.ts`

- [ ] **Step 1: Create the factory** (`src/plugin-host/worktrees-api.ts`)

```ts
import { HOST_WORKTREES, type RpcEndpoint } from '../shared/plugins/rpc'
import type { ManifoldApi, WorktreeOverviewEntry } from '../shared/plugins/api-types'

interface HostWorktreesProxy {
  $list(pluginId: string): Promise<WorktreeOverviewEntry[]>
  $remove(pluginId: string, worktreePath: string, opts: { force?: boolean } | undefined): Promise<void>
  $pruneStale(pluginId: string): Promise<string[]>
}

export function createWorktreesApi(endpoint: RpcEndpoint, pluginId: string): ManifoldApi['worktrees'] {
  const host = endpoint.getProxy<HostWorktreesProxy>(HOST_WORKTREES)
  return {
    list: () => host.$list(pluginId),
    remove: (worktreePath, opts) => host.$remove(pluginId, worktreePath, opts),
    pruneStale: () => host.$pruneStale(pluginId),
  }
}
```

- [ ] **Step 2: Wire `gated-api.ts`** — add to `GatedFactories`:

```ts
  worktrees: () => ManifoldApi['worktrees']
```

and add the gated getter (after the `transcription` getter):

```ts
    get worktrees(): ManifoldApi['worktrees'] { requireCap('workspace:manage'); return factories.worktrees() },
```

- [ ] **Step 3: Wire `index.ts`** — add to the factories object passed to `buildGatedApi`:

```ts
    worktrees: () => createWorktreesApi(endpoint, t.id),
```

and add the import at the top:

```ts
import { createWorktreesApi } from './worktrees-api'
```

- [ ] **Step 4: Typecheck**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.node.json 2>&1 | grep -E "worktrees-api|gated-api|plugin-host/index" || echo "no new errors in changed files"`
Expected: `no new errors in changed files`.

- [ ] **Step 5: Commit**

```bash
git add src/plugin-host/worktrees-api.ts src/plugin-host/gated-api.ts src/plugin-host/index.ts
git commit -m "feat(plugin-host): worktrees API factory + capability gate (#744)"
```

---

### Task 7: main-side service registration + dependency injection

**Files:**
- Modify: `src/main/plugins/extension-host.ts`
- Modify: `src/main/plugins/plugin-manager.ts`
- Modify: `src/main/app/index.ts`

- [ ] **Step 1: `extension-host.ts`** — import the type, accept it in the constructor, register the service.

Import:

```ts
import type { WorktreeOverviewService } from './worktree-overview-service'
import { HOST_WORKTREES } from '../../shared/plugins/rpc'
```

Add a constructor parameter (after `agentSpawn`):

```ts
    private readonly worktrees: WorktreeOverviewService,
```

Register the service alongside the existing `endpoint.registerService(HOST_AGENTS, …)` block:

```ts
endpoint.registerService(HOST_WORKTREES, {
  $list: (pluginId: string) => { this.assertBuiltin(pluginId, 'workspace:manage'); return this.worktrees.list() },
  $remove: (pluginId: string, worktreePath: string, opts: { force?: boolean } | undefined) => { this.assertBuiltin(pluginId, 'workspace:manage'); return this.worktrees.remove(worktreePath, opts) },
  $pruneStale: (pluginId: string) => { this.assertBuiltin(pluginId, 'workspace:manage'); return this.worktrees.pruneStale() },
})
```

- [ ] **Step 2: `plugin-manager.ts`** — construct the service and pass it to `ExtensionHost`. Add params `worktreeManager: WorktreeManager` and `projectRegistry: ProjectRegistry` to the constructor (after `gitOps`), import what's needed, and build the service:

```ts
import { createWorktreeOverviewService } from './worktree-overview-service'
import { getWorktreeDirty, getWorktreeLastCommitISO } from '../git/worktree-status'
import { readWorktreeMeta } from '../git/worktree-meta'
import type { WorktreeManager } from '../git/worktree-manager'
import type { ProjectRegistry } from '../store/project-registry'
import * as fs from 'node:fs'
```

In the constructor body, before `this.host = new ExtensionHost(...)`:

```ts
const worktreeOverview = createWorktreeOverviewService({
  listProjects: () => projectRegistry.listProjects(),
  listSessions: () => this.sessionManager.listSessions(),
  listWorktrees: (p) => worktreeManager.listWorktrees(p),
  getAheadBehind: (wt, base) => gitOps.getAheadBehind(wt, base),
  getDirty: (wt) => getWorktreeDirty(wt),
  getLastCommitISO: (wt) => getWorktreeLastCommitISO(wt),
  readMeta: (wt) => readWorktreeMeta(wt),
  removeWorktree: (proj, wt) => worktreeManager.removeWorktree(proj, wt),
  pathExists: (p) => fs.existsSync(p),
})
```

and update the `ExtensionHost` construction to pass it:

```ts
this.host = new ExtensionHost(new PluginStorageStore(storagePath), agentControl, lm, agentSpawn, worktreeOverview)
```

- [ ] **Step 3: `app/index.ts`** — pass the two new args to `PluginManager`:

```ts
const pluginManager = new PluginManager(settingsStore.getSettings().storagePath, settingsStore, sessionManager, gitOps, worktreeManager, projectRegistry)
```

- [ ] **Step 4: Update any other `new ExtensionHost(` call sites (e.g. tests)**

Run: `git grep -n "new ExtensionHost(" -- src`
For each hit besides `plugin-manager.ts`, add a 5th argument: a stub service `{ list: async () => [], remove: async () => {}, pruneStale: async () => [] }`.

- [ ] **Step 5: Typecheck + run the plugin test suites**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.node.json 2>&1 | grep -E "extension-host|plugin-manager|app/index" || echo "no new errors in changed files"`
Run: `node_modules/.bin/vitest run src/main/plugins src/main/git/worktree-status.test.ts`
Expected: typecheck clean for changed files; all plugin + status tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/plugins/extension-host.ts src/main/plugins/plugin-manager.ts src/main/app/index.ts
git commit -m "feat(plugins): register worktree-overview service for builtin plugins (#744)"
```

---

## Self-Review

- **Spec coverage:** list/status/ahead-behind/dirty/last-commit/locked (Task 3), remove guard (Task 4), pruneStale (Task 4), capability gating builtin-only (Tasks 5–7). UI surfaces (home layer, plugin webview) are explicitly later phases. ✅
- **Placeholders:** none — every step has complete code. ✅
- **Type consistency:** `WorktreeOverviewEntry`/`WorktreeStatus` defined once (Task 2), consumed by service (Task 3), API (Task 5), factory (Task 6). `createWorktreeOverviewService`/`WorktreeOverviewDeps`/`WorktreeOverviewService` names consistent across tasks. `HOST_WORKTREES` defined Task 5, used Tasks 6–7. ✅
- **Deviation noted:** spec `unpushed` → `ahead > 0` (Task 2 note). Update the spec's data-model line in the same PR for consistency.
