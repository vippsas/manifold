# Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Superagent orchestrator with a passive multi-root **Workspace** — a named group of repos in which each agent gets all the repos as its working set (injected via each runtime's native multi-dir flag), with no orchestrator/MCP bridge/approval layer.

**Architecture:** Two phases. **Phase A** adds the Workspace backend *alongside* the existing Superagent code so the app keeps building and is independently testable. **Phase B** adds the Workspace UI, switches the app over, then deletes all Superagent code. Cross-repo access reuses the existing per-repo-worktree machinery (one branch per agent, a worktree per repo) and the existing `additionalDirs` field — flipped from "scraped out of Claude's output" to "pushed into any runtime at launch."

**Tech Stack:** Electron (main + preload + renderer), TypeScript, React, vitest, node-pty.

**Spec:** `docs/superpowers/designs/2026-06-02-workspaces-design.md`

### Deviations from the design doc (intentional)
- **No `--cd` for Codex/Copilot.** The PTY is already spawned with `cwd` = the primary worktree, which every runtime treats as its root, so only the *extra* dirs need flags. `working-set-args` emits only `--add-dir`/`--include-directories`.
- **`WorkspaceManager.remove()` deletes the record only (v1).** It does not auto-kill running agents. Each agent's worktrees are cleaned when that agent is killed (Task 6). The UI removes agents first. (Design success-criterion #5 is met per-agent, not via cascade.)

---

## Conventions

- **IPC naming:** `workspace:<action>` for invokes, `workspace:<event>` for push events.
- **Tests:** co-located `*.test.ts` using vitest. Run a single file with `npx vitest run <path>`. Per the project testing skill, if a suite fails to load `better-sqlite3`, run `npm run rebuild` (electron-rebuild) once, then retry.
- **Typecheck:** `npm run typecheck:node && npm run typecheck:web` (the bare `typecheck` is a no-op; the renderer baseline has ~55 pre-existing type errors — compare against baseline, don't expect zero).
- **Commit prefix:** `feat(workspace): …`, `refactor(workspace): …`, or `chore(workspace): …`.
- **Completion gate per task:** the "commit" step runs only after the task's tests and `npm run typecheck:node` pass.

---

# Phase A — Workspace backend

## Task 1: Shared types + session field additions

**Files:**
- Create: `src/shared/workspace-types.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/main/git/worktree-meta.ts:3-12`

- [ ] **Step 1: Create the workspace types**

Create `src/shared/workspace-types.ts`:
```ts
export interface Workspace {
  id: string
  name: string
  /** Ordered; projectIds[0] is the default primary repo (the agent's cwd). */
  projectIds: string[]
  createdAt: string
}

export interface WorkspaceCreateOptions {
  name: string
  projectIds: string[]
}

export interface WorkspaceSpawnAgentOptions {
  runtimeId: string
  prompt?: string
  branchName?: string
}
```

- [ ] **Step 2: Add fields to `AgentSession` and `SpawnAgentOptions`**

In `src/shared/types.ts`, in the `AgentSession` interface, after the `parentSuperagentId?: string` line, add:
```ts
  /** If set, this agent belongs to a workspace; its working set spans the workspace's repos. */
  workspaceId?: string
  /** projectId -> worktree path for every repo in this agent's working set (incl. primary). Used to tear down the full set. */
  workspaceWorktreePaths?: Record<string, string>
```

In the same file, in `SpawnAgentOptions`, after `existingWorktreePath?: string`, add:
```ts
  /** If set, the spawned session belongs to this workspace. */
  workspaceId?: string
  /** Extra repo roots (the workspace's other repos) injected into the runtime at launch and recorded on the session. */
  additionalDirs?: string[]
  /** projectId -> worktree path for the full working set, persisted for teardown. */
  workspaceWorktreePaths?: Record<string, string>
```

- [ ] **Step 3: Add fields to `WorktreeMeta`**

In `src/main/git/worktree-meta.ts`, in the `WorktreeMeta` interface, after `parentSuperagentId?: string`, add:
```ts
  workspaceId?: string
  workspaceWorktreePaths?: Record<string, string>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS (fields are optional; nothing consumes them yet).

- [ ] **Step 5: Commit**
```bash
git add src/shared/workspace-types.ts src/shared/types.ts src/main/git/worktree-meta.ts
git commit -m "feat(workspace): add Workspace types and session/worktree fields"
```

---

## Task 2: `WorkspaceStore` — JSON persistence

**Files:**
- Create: `src/main/workspace/workspace-store.ts`
- Test: `src/main/workspace/workspace-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/workspace/workspace-store.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { WorkspaceStore } from './workspace-store'
import type { Workspace } from '../../shared/workspace-types'

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return { id: 'w1', name: 'test', projectIds: ['p1'], createdAt: '2026-06-02T00:00:00.000Z', ...overrides }
}

describe('WorkspaceStore', () => {
  let tmpDir: string
  let storePath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-store-'))
    storePath = path.join(tmpDir, 'workspaces.json')
  })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('returns empty list when no file exists', () => {
    expect(new WorkspaceStore(storePath).list()).toEqual([])
  })
  it('persists and reloads workspaces', () => {
    const store = new WorkspaceStore(storePath)
    store.add(makeWorkspace({ id: 'w1' }))
    store.add(makeWorkspace({ id: 'w2', name: 'other' }))
    expect(new WorkspaceStore(storePath).list().map((w) => w.id).sort()).toEqual(['w1', 'w2'])
  })
  it('updates a workspace by id', () => {
    const store = new WorkspaceStore(storePath)
    store.add(makeWorkspace({ id: 'w1', name: 'a' }))
    expect(store.update('w1', { name: 'b' })?.name).toBe('b')
    expect(store.get('w1')?.name).toBe('b')
  })
  it('removes a workspace by id', () => {
    const store = new WorkspaceStore(storePath)
    store.add(makeWorkspace({ id: 'w1' }))
    expect(store.remove('w1')).toBe(true)
    expect(store.list()).toEqual([])
  })
  it('adds and removes a project id', () => {
    const store = new WorkspaceStore(storePath)
    store.add(makeWorkspace({ id: 'w1', projectIds: ['p1'] }))
    store.addProject('w1', 'p2')
    expect(store.get('w1')?.projectIds).toEqual(['p1', 'p2'])
    store.removeProject('w1', 'p1')
    expect(store.get('w1')?.projectIds).toEqual(['p2'])
  })
  it('tolerates a malformed file by starting empty', () => {
    fs.writeFileSync(storePath, 'not json')
    expect(new WorkspaceStore(storePath).list()).toEqual([])
  })
})
```

- [ ] **Step 2: Verify it fails**

Run: `npx vitest run src/main/workspace/workspace-store.test.ts`
Expected: FAIL — cannot find module `./workspace-store`.

- [ ] **Step 3: Implement `WorkspaceStore`**

Create `src/main/workspace/workspace-store.ts`:
```ts
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Workspace } from '../../shared/workspace-types'

export class WorkspaceStore {
  private workspaces: Workspace[]

  constructor(private readonly filePath: string) {
    this.workspaces = this.loadFromDisk()
  }

  private loadFromDisk(): Workspace[] {
    try {
      if (!fs.existsSync(this.filePath)) return []
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
      return Array.isArray(parsed) ? (parsed as Workspace[]) : []
    } catch {
      return []
    }
  }

  private writeToDisk(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.workspaces, null, 2))
  }

  list(): Workspace[] { return [...this.workspaces] }
  get(id: string): Workspace | undefined { return this.workspaces.find((w) => w.id === id) }

  add(workspace: Workspace): void {
    this.workspaces.push(workspace)
    this.writeToDisk()
  }

  update(id: string, partial: Partial<Workspace>): Workspace | undefined {
    const idx = this.workspaces.findIndex((w) => w.id === id)
    if (idx === -1) return undefined
    this.workspaces[idx] = { ...this.workspaces[idx], ...partial }
    this.writeToDisk()
    return this.workspaces[idx]
  }

  remove(id: string): boolean {
    const before = this.workspaces.length
    this.workspaces = this.workspaces.filter((w) => w.id !== id)
    if (this.workspaces.length === before) return false
    this.writeToDisk()
    return true
  }

  addProject(id: string, projectId: string): void {
    const w = this.workspaces.find((x) => x.id === id)
    if (!w || w.projectIds.includes(projectId)) return
    w.projectIds.push(projectId)
    this.writeToDisk()
  }

  removeProject(id: string, projectId: string): void {
    const w = this.workspaces.find((x) => x.id === id)
    if (!w) return
    const before = w.projectIds.length
    w.projectIds = w.projectIds.filter((p) => p !== projectId)
    if (w.projectIds.length !== before) this.writeToDisk()
  }
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx vitest run src/main/workspace/workspace-store.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**
```bash
git add src/main/workspace/workspace-store.ts src/main/workspace/workspace-store.test.ts
git commit -m "feat(workspace): add WorkspaceStore with JSON persistence"
```

---

## Task 3: `working-set-args` — per-runtime multi-dir flags

This is the crux: it maps the workspace's extra repo roots onto each CLI's flag. Verified flags: Claude `--add-dir <a> <b> …` (variadic), Codex/Copilot `--add-dir <dir>` (repeat per dir), Gemini `--include-directories a,b,c`.

**Files:**
- Create: `src/main/agent/working-set-args.ts`
- Test: `src/main/agent/working-set-args.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/agent/working-set-args.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildWorkingSetArgs } from './working-set-args'

describe('buildWorkingSetArgs', () => {
  const dirs = ['/w/web', '/w/shared']

  it('returns empty when there are no extra dirs', () => {
    expect(buildWorkingSetArgs('claude', [])).toEqual([])
    expect(buildWorkingSetArgs('gemini', [])).toEqual([])
  })
  it('claude uses one variadic --add-dir', () => {
    expect(buildWorkingSetArgs('claude', dirs)).toEqual(['--add-dir', '/w/web', '/w/shared'])
  })
  it('ollama-claude behaves like claude', () => {
    expect(buildWorkingSetArgs('ollama-claude', dirs)).toEqual(['--add-dir', '/w/web', '/w/shared'])
  })
  it('codex repeats --add-dir per dir', () => {
    expect(buildWorkingSetArgs('codex', dirs)).toEqual(['--add-dir', '/w/web', '--add-dir', '/w/shared'])
  })
  it('copilot repeats --add-dir per dir', () => {
    expect(buildWorkingSetArgs('copilot', dirs)).toEqual(['--add-dir', '/w/web', '--add-dir', '/w/shared'])
  })
  it('gemini uses a comma-joined --include-directories', () => {
    expect(buildWorkingSetArgs('gemini', dirs)).toEqual(['--include-directories', '/w/web,/w/shared'])
  })
  it('unknown runtime falls back to no extra args (single-root)', () => {
    expect(buildWorkingSetArgs('mystery', dirs)).toEqual([])
  })
})
```

- [ ] **Step 2: Verify it fails**

Run: `npx vitest run src/main/agent/working-set-args.test.ts`
Expected: FAIL — cannot find module `./working-set-args`.

- [ ] **Step 3: Implement**

Create `src/main/agent/working-set-args.ts`:
```ts
/**
 * Translate a workspace agent's extra repo roots into the launch flags for its
 * runtime. The PTY is spawned with cwd = the primary worktree, which every CLI
 * treats as its root, so only the *additional* dirs need flags here.
 */
export function buildWorkingSetArgs(runtimeId: string, additionalDirs: string[]): string[] {
  if (additionalDirs.length === 0) return []
  switch (runtimeId) {
    case 'claude':
    case 'ollama-claude':
      // Claude Code: --add-dir is variadic.
      return ['--add-dir', ...additionalDirs]
    case 'codex':
    case 'ollama-codex':
    case 'copilot':
      // Codex & Copilot: --add-dir takes a single dir; repeat it.
      return additionalDirs.flatMap((dir) => ['--add-dir', dir])
    case 'gemini':
      // Gemini CLI: --include-directories takes a comma-separated list.
      return ['--include-directories', additionalDirs.join(',')]
    default:
      return []
  }
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx vitest run src/main/agent/working-set-args.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**
```bash
git add src/main/agent/working-set-args.ts src/main/agent/working-set-args.test.ts
git commit -m "feat(workspace): add per-runtime working-set arg builder"
```

---

## Task 4: `workspace-worktrees` — build & tear down a per-agent worktree set

Self-contained copy of the (soon-to-be-deleted) fleet worktree logic, plus a helper that returns the ordered `{ primary, additionalDirs, worktreePaths }` working set and one that removes it.

**Files:**
- Create: `src/main/workspace/workspace-worktrees.ts`
- Test: `src/main/workspace/workspace-worktrees.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/workspace/workspace-worktrees.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import {
  buildWorkspaceWorkingSet,
  removeWorkspaceWorktrees,
  type WorkspaceProject,
  type WorktreeSetManager,
} from './workspace-worktrees'

function gitProject(id: string): WorkspaceProject {
  return { id, path: `/repo/${id}`, name: id, baseBranch: 'main', kind: 'git' }
}
function folderProject(id: string): WorkspaceProject {
  return { id, path: `/folder/${id}`, name: id, baseBranch: 'main', kind: 'folder' }
}

function makeManager(): WorktreeSetManager & { createWorktree: ReturnType<typeof vi.fn>; removeWorktree: ReturnType<typeof vi.fn> } {
  return {
    createWorktree: vi.fn(async (projectPath: string, _base: string, _name: string, branch?: string) => ({
      branch: branch ?? 'b', path: `${projectPath}/.wt/${branch}`,
    })),
    removeWorktree: vi.fn(async () => undefined),
    branchExists: vi.fn(async () => false),
  } as never
}

describe('buildWorkspaceWorkingSet', () => {
  it('creates a worktree per git repo; primary is the first project', async () => {
    const mgr = makeManager()
    const set = await buildWorkspaceWorkingSet(mgr, [gitProject('api'), gitProject('web')], 'manifold/x')
    expect(set.primary).toBe('/repo/api/.wt/manifold/x')
    expect(set.additionalDirs).toEqual(['/repo/web/.wt/manifold/x'])
    expect(set.worktreePaths).toEqual({
      api: '/repo/api/.wt/manifold/x',
      web: '/repo/web/.wt/manifold/x',
    })
  })

  it('passes non-git folders through as their own path', async () => {
    const mgr = makeManager()
    const set = await buildWorkspaceWorkingSet(mgr, [gitProject('api'), folderProject('docs')], 'manifold/x')
    expect(set.worktreePaths).toEqual({ api: '/repo/api/.wt/manifold/x', docs: '/folder/docs' })
    expect(mgr.createWorktree).toHaveBeenCalledTimes(1)
  })

  it('rolls back created worktrees if a later one fails', async () => {
    const mgr = makeManager()
    mgr.createWorktree
      .mockImplementationOnce(async () => ({ branch: 'x', path: '/repo/api/.wt/x' }))
      .mockImplementationOnce(async () => { throw new Error('boom') })
    await expect(buildWorkspaceWorkingSet(mgr, [gitProject('api'), gitProject('web')], 'x')).rejects.toThrow('boom')
    expect(mgr.removeWorktree).toHaveBeenCalledWith('/repo/api', '/repo/api/.wt/x')
  })
})

describe('removeWorkspaceWorktrees', () => {
  it('removes git worktrees and skips non-git passthrough paths', async () => {
    const mgr = makeManager()
    await removeWorkspaceWorktrees(
      mgr,
      { api: '/repo/api/.wt/x', docs: '/folder/docs' },
      (pid) => (pid === 'api' ? '/repo/api' : '/folder/docs'),
    )
    expect(mgr.removeWorktree).toHaveBeenCalledTimes(1)
    expect(mgr.removeWorktree).toHaveBeenCalledWith('/repo/api', '/repo/api/.wt/x')
  })
})
```

- [ ] **Step 2: Verify it fails**

Run: `npx vitest run src/main/workspace/workspace-worktrees.test.ts`
Expected: FAIL — cannot find module `./workspace-worktrees`.

- [ ] **Step 3: Implement**

Create `src/main/workspace/workspace-worktrees.ts`:
```ts
import { isGitProject } from '../../shared/project-kind'

export interface WorktreeSetManager {
  createWorktree: (projectPath: string, baseBranch: string, projectName: string, branchName?: string) => Promise<{ branch: string; path: string }>
  removeWorktree: (projectPath: string, worktreePath: string) => Promise<void>
  branchExists: (projectPath: string, branch: string) => Promise<boolean>
}

export interface WorkspaceProject {
  id: string
  path: string
  name: string
  baseBranch: string
  kind?: 'git' | 'folder'
}

export interface WorkspaceWorkingSet {
  primary: string
  additionalDirs: string[]
  /** projectId -> worktree path (or folder path for non-git projects). */
  worktreePaths: Record<string, string>
}

/** Find a branch name unused across every git repo in the set (base, base-2, base-3, …). */
export async function findAvailableWorkspaceBranch(
  worktreeManager: Pick<WorktreeSetManager, 'branchExists'>,
  projects: readonly WorkspaceProject[],
  baseBranch: string,
): Promise<string> {
  const isFree = async (candidate: string): Promise<boolean> => {
    for (const project of projects) {
      if (!isGitProject(project)) continue
      if (await worktreeManager.branchExists(project.path, candidate)) return false
    }
    return true
  }
  if (await isFree(baseBranch)) return baseBranch
  for (let i = 2; i < 1000; i++) {
    const candidate = `${baseBranch}-${i}`
    if (await isFree(candidate)) return candidate
  }
  throw new Error(`Could not find an unused branch name starting from ${baseBranch}`)
}

/** Create a worktree on `branchName` for each git repo; non-git folders pass through. */
export async function buildWorkspaceWorkingSet(
  worktreeManager: WorktreeSetManager,
  projects: WorkspaceProject[],
  branchName: string,
): Promise<WorkspaceWorkingSet> {
  const created: { projectPath: string; worktreePath: string }[] = []
  const worktreePaths: Record<string, string> = {}
  try {
    for (const project of projects) {
      if (!isGitProject(project)) {
        worktreePaths[project.id] = project.path
        continue
      }
      const info = await worktreeManager.createWorktree(project.path, project.baseBranch, project.name, branchName)
      created.push({ projectPath: project.path, worktreePath: info.path })
      worktreePaths[project.id] = info.path
    }
  } catch (err) {
    for (const { projectPath, worktreePath } of created) {
      try { await worktreeManager.removeWorktree(projectPath, worktreePath) } catch { /* ignore */ }
    }
    throw err
  }
  const ordered = projects.map((p) => worktreePaths[p.id])
  const [primary, ...additionalDirs] = ordered
  return { primary, additionalDirs, worktreePaths }
}

/** Remove every git worktree in the set; never touch non-git passthrough paths. */
export async function removeWorkspaceWorktrees(
  worktreeManager: Pick<WorktreeSetManager, 'removeWorktree'>,
  worktreePaths: Record<string, string>,
  getProjectPath: (projectId: string) => string | undefined,
): Promise<void> {
  for (const [projectId, worktreePath] of Object.entries(worktreePaths)) {
    const projectPath = getProjectPath(projectId)
    if (!projectPath) continue
    if (projectPath === worktreePath) continue // non-git passthrough — edited in place, never delete
    try { await worktreeManager.removeWorktree(projectPath, worktreePath) } catch { /* best-effort */ }
  }
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx vitest run src/main/workspace/workspace-worktrees.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**
```bash
git add src/main/workspace/workspace-worktrees.ts src/main/workspace/workspace-worktrees.test.ts
git commit -m "feat(workspace): add per-agent worktree set build/teardown"
```

---

## Task 5: Thread the working set through session creation

Make `SessionCreator` accept a pre-built working set: inject the runtime flags, record `additionalDirs`/`workspaceId`/`workspaceWorktreePaths` on the session, persist them to `WorktreeMeta`, and surface them on the public session and restore.

**Files:**
- Modify: `src/main/session/session-creator.ts` (imports; `:107-117`; `:158-166`; `:209-229`)
- Modify: `src/main/session/session-public.ts:4-22`
- Modify: `src/main/session/session-meta-persister.ts:5-14`
- Modify: `src/main/session/session-discovery.ts` (restore from meta)

- [ ] **Step 1: Import the arg builder in session-creator**

At the top of `src/main/session/session-creator.ts`, add:
```ts
import { buildWorkingSetArgs } from '../agent/working-set-args'
```

- [ ] **Step 2: Inject working-set flags before PTY spawn**

In `src/main/session/session-creator.ts`, immediately after the `else if (options.ollamaModel) { … }` block (currently ending line 117) and before the `debugLog(...)` on line 119, add:
```ts
    if (!options.nonInteractive && options.additionalDirs && options.additionalDirs.length > 0) {
      runtimeArgs.push(...buildWorkingSetArgs(options.runtimeId, options.additionalDirs))
    }
```

- [ ] **Step 3: Record fields on the session**

In `buildSession` (`src/main/session/session-creator.ts:209-229`), change `additionalDirs: [],` (line 223) to:
```ts
      additionalDirs: options.additionalDirs ?? [],
```
and, immediately after the `parentSuperagentId: options.parentSuperagentId,` line (225), add:
```ts
      workspaceId: options.workspaceId,
      workspaceWorktreePaths: options.workspaceWorktreePaths,
```

- [ ] **Step 4: Persist fields to WorktreeMeta**

In the `writeWorktreeMeta(...)` call (`src/main/session/session-creator.ts:158-166`), change `additionalDirs: existingMeta?.additionalDirs ?? [],` (line 163) to:
```ts
        additionalDirs: options.additionalDirs ?? existingMeta?.additionalDirs ?? [],
```
and after `parentSuperagentId: options.parentSuperagentId,` (line 165) add:
```ts
        workspaceId: options.workspaceId,
        workspaceWorktreePaths: options.workspaceWorktreePaths,
```

- [ ] **Step 5: Surface on public session + meta persister**

In `src/main/session/session-public.ts`, inside the returned object (after `parentSuperagentId: session.parentSuperagentId,`), add:
```ts
    workspaceId: session.workspaceId,
    workspaceWorktreePaths: session.workspaceWorktreePaths,
```

In `src/main/session/session-meta-persister.ts`, inside the `writeWorktreeMeta({...})` call (after `parentSuperagentId: session.parentSuperagentId,`), add:
```ts
    workspaceId: session.workspaceId,
    workspaceWorktreePaths: session.workspaceWorktreePaths,
```

- [ ] **Step 6: Restore on discovery**

In `src/main/session/session-discovery.ts`, find where a discovered session is built from `meta` (it already sets `additionalDirs: meta?.additionalDirs ?? []` around line 107). In that same session object literal, add:
```ts
          workspaceId: meta?.workspaceId,
          workspaceWorktreePaths: meta?.workspaceWorktreePaths,
```
(If there are multiple session-construction sites in this file, add the two lines only to the one that reads from `meta`; the empty-`additionalDirs: []` sites for fresh/non-worktree sessions don't need them.)

- [ ] **Step 7: Typecheck + existing session tests**

Run: `npm run typecheck:node`
Expected: PASS.
Run: `npx vitest run src/main/session/session-creator.test.ts`
Expected: PASS (existing behavior unchanged when the new options are absent).

- [ ] **Step 8: Commit**
```bash
git add src/main/session/session-creator.ts src/main/session/session-public.ts src/main/session/session-meta-persister.ts src/main/session/session-discovery.ts
git commit -m "feat(workspace): thread working set through session creation"
```

---

## Task 6: Tear down the full worktree set on kill

**Files:**
- Modify: `src/main/session/session-killer.ts` (import; `:41-43`)
- Test: `src/main/session/session-killer-workspace.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/session/session-killer-workspace.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { SessionKiller } from './session-killer'
import type { InternalSession } from './session-types'

function makeSession(over: Partial<InternalSession> = {}): InternalSession {
  return {
    id: 's1', projectId: 'api', runtimeId: 'claude', branchName: 'manifold/x',
    worktreePath: '/repo/api/.wt/x', status: 'running', pid: 1, ptyId: 'pty1',
    outputBuffer: '', additionalDirs: ['/repo/web/.wt/x', '/folder/docs'],
    workspaceId: 'w1',
    workspaceWorktreePaths: { api: '/repo/api/.wt/x', web: '/repo/web/.wt/x', docs: '/folder/docs' },
    ...over,
  } as InternalSession
}

function makeKiller(session: InternalSession) {
  const removeWorktree = vi.fn(async () => undefined)
  const projectPaths: Record<string, string> = { api: '/repo/api', web: '/repo/web', docs: '/folder/docs' }
  const killer = new SessionKiller({
    sessions: new Map([[session.id, session]]),
    ptyPool: { kill: vi.fn() } as never,
    worktreeManager: { removeWorktree } as never,
    projectRegistry: { getProject: (id: string) => ({ path: projectPaths[id] }) } as never,
    getFileWatcher: () => undefined,
    getMemoryCapture: () => null,
    getChatAdapter: () => null,
    notifySessionsChanged: vi.fn(),
  })
  return { killer, removeWorktree }
}

describe('SessionKiller — workspace agents', () => {
  it('removes every git worktree in the set and skips non-git passthrough', async () => {
    const session = makeSession()
    const { killer, removeWorktree } = makeKiller(session)
    await killer.killSession('s1')
    expect(removeWorktree).toHaveBeenCalledWith('/repo/api', '/repo/api/.wt/x')
    expect(removeWorktree).toHaveBeenCalledWith('/repo/web', '/repo/web/.wt/x')
    expect(removeWorktree).not.toHaveBeenCalledWith('/folder/docs', '/folder/docs')
    expect(removeWorktree).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Verify it fails**

Run: `npx vitest run src/main/session/session-killer-workspace.test.ts`
Expected: FAIL — killer currently calls `removeWorktreeIfUnused` (removes only the primary), so `web` is not removed.

- [ ] **Step 3: Add the workspace branch to `killSession`**

In `src/main/session/session-killer.ts`, add the import:
```ts
import { removeWorkspaceWorktrees } from '../workspace/workspace-worktrees'
```
Then replace the block at lines 41-43:
```ts
    if (session.projectId && !session.noWorktree) {
      await this.removeWorktreeIfUnused(session)
    }
```
with:
```ts
    if (session.workspaceWorktreePaths && Object.keys(session.workspaceWorktreePaths).length > 0) {
      await removeWorkspaceWorktrees(
        this.deps.worktreeManager,
        session.workspaceWorktreePaths,
        (pid) => this.deps.projectRegistry.getProject(pid)?.path,
      )
    } else if (session.projectId && !session.noWorktree) {
      await this.removeWorktreeIfUnused(session)
    }
```

- [ ] **Step 4: Verify it passes**

Run: `npx vitest run src/main/session/session-killer-workspace.test.ts`
Expected: PASS.
Run: `npx vitest run src/main/session/session-manager-kill.test.ts`
Expected: PASS (non-workspace kills unchanged).

- [ ] **Step 5: Commit**
```bash
git add src/main/session/session-killer.ts src/main/session/session-killer-workspace.test.ts
git commit -m "feat(workspace): remove full worktree set when a workspace agent is killed"
```

---

## Task 7: `WorkspaceManager` — lifecycle + spawn agent

**Files:**
- Create: `src/main/workspace/workspace-manager.ts`
- Test: `src/main/workspace/workspace-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/workspace/workspace-manager.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { WorkspaceManager } from './workspace-manager'
import { WorkspaceStore } from './workspace-store'

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
  let c = 0
  return { ...actual, randomUUID: () => `uuid-${++c}` }
})

function makeDeps(tmpDir: string) {
  const projects: Record<string, { id: string; name: string; path: string; baseBranch: string; kind: 'git' }> = {
    api: { id: 'api', name: 'api', path: '/repo/api', baseBranch: 'main', kind: 'git' },
    web: { id: 'web', name: 'web', path: '/repo/web', baseBranch: 'main', kind: 'git' },
  }
  const createSession = vi.fn(async (opts: Record<string, unknown>) => ({ id: 'sess-1', ...opts }))
  return {
    store: new WorkspaceStore(path.join(tmpDir, 'workspaces.json')),
    worktreeManager: {
      createWorktree: vi.fn(async (p: string, _b: string, _n: string, branch?: string) => ({ branch: branch ?? 'b', path: `${p}/.wt/${branch}` })),
      removeWorktree: vi.fn(async () => undefined),
      branchExists: vi.fn(async () => false),
    },
    projectRegistry: { getProject: (id: string) => projects[id] },
    sessionManager: { createSession, getSession: vi.fn(), killSession: vi.fn(async () => undefined) },
    emitListChanged: vi.fn(),
    _createSession: createSession,
  }
}

describe('WorkspaceManager', () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let manager: WorkspaceManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-mgr-'))
    deps = makeDeps(tmpDir)
    manager = new WorkspaceManager(deps as never)
  })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('creates and lists a workspace', () => {
    const w = manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    expect(w.id).toBe('uuid-1')
    expect(manager.list()).toHaveLength(1)
    expect(deps.emitListChanged).toHaveBeenCalled()
  })

  it('create rejects an empty project list', () => {
    expect(() => manager.create({ name: 'x', projectIds: [] })).toThrow(/project/i)
  })

  it('spawnAgent creates worktrees and a session with the working set', async () => {
    const w = manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    const session = await manager.spawnAgent(w.id, { runtimeId: 'claude' })
    expect(session.id).toBe('sess-1')
    expect(deps._createSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'api',
      runtimeId: 'claude',
      existingWorktreePath: '/repo/api/.wt/manifold/auth',
      additionalDirs: ['/repo/web/.wt/manifold/auth'],
      workspaceId: w.id,
      workspaceWorktreePaths: { api: '/repo/api/.wt/manifold/auth', web: '/repo/web/.wt/manifold/auth' },
    }))
  })

  it('remove deletes the workspace record', () => {
    const w = manager.create({ name: 'auth', projectIds: ['api'] })
    expect(manager.remove(w.id)).toBe(true)
    expect(manager.list()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Verify it fails**

Run: `npx vitest run src/main/workspace/workspace-manager.test.ts`
Expected: FAIL — cannot find module `./workspace-manager`.

- [ ] **Step 3: Implement**

Create `src/main/workspace/workspace-manager.ts`:
```ts
import { randomUUID } from 'node:crypto'
import type { AgentSession, Project, SpawnAgentOptions } from '../../shared/types'
import type { Workspace, WorkspaceCreateOptions, WorkspaceSpawnAgentOptions } from '../../shared/workspace-types'
import type { WorkspaceStore } from './workspace-store'
import {
  buildWorkspaceWorkingSet,
  findAvailableWorkspaceBranch,
  type WorkspaceProject,
  type WorktreeSetManager,
} from './workspace-worktrees'

export interface WorkspaceManagerDeps {
  store: WorkspaceStore
  worktreeManager: WorktreeSetManager
  projectRegistry: { getProject: (id: string) => Project | undefined }
  sessionManager: {
    createSession: (opts: SpawnAgentOptions) => Promise<AgentSession>
    getSession: (id: string) => AgentSession | undefined
    killSession: (id: string) => Promise<void>
  }
  emitListChanged: () => void
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'workspace'
}

export class WorkspaceManager {
  constructor(private readonly deps: WorkspaceManagerDeps) {}

  list(): Workspace[] { return this.deps.store.list() }
  get(id: string): Workspace | undefined { return this.deps.store.get(id) }

  create(options: WorkspaceCreateOptions): Workspace {
    if (options.projectIds.length === 0) throw new Error('A workspace must contain at least one project')
    const workspace: Workspace = {
      id: randomUUID(),
      name: options.name,
      projectIds: [...options.projectIds],
      createdAt: new Date().toISOString(),
    }
    this.deps.store.add(workspace)
    this.deps.emitListChanged()
    return workspace
  }

  remove(id: string): boolean {
    const removed = this.deps.store.remove(id)
    if (removed) this.deps.emitListChanged()
    return removed
  }

  addProject(id: string, projectId: string): void {
    this.deps.store.addProject(id, projectId)
    this.deps.emitListChanged()
  }

  removeProject(id: string, projectId: string): void {
    this.deps.store.removeProject(id, projectId)
    this.deps.emitListChanged()
  }

  async spawnAgent(workspaceId: string, options: WorkspaceSpawnAgentOptions): Promise<AgentSession> {
    const workspace = this.deps.store.get(workspaceId)
    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)
    if (workspace.projectIds.length === 0) throw new Error('Workspace has no projects')

    const projects: WorkspaceProject[] = workspace.projectIds.map((pid) => {
      const project = this.deps.projectRegistry.getProject(pid)
      if (!project) throw new Error(`Project not found: ${pid}`)
      return { id: project.id, path: project.path, name: project.name, baseBranch: project.baseBranch, kind: project.kind }
    })

    const baseBranch = options.branchName ?? `manifold/${slugify(workspace.name)}`
    const branchName = await findAvailableWorkspaceBranch(this.deps.worktreeManager, projects, baseBranch)
    const { primary, additionalDirs, worktreePaths } = await buildWorkspaceWorkingSet(this.deps.worktreeManager, projects, branchName)

    return this.deps.sessionManager.createSession({
      projectId: projects[0].id,
      runtimeId: options.runtimeId,
      prompt: options.prompt ?? '',
      branchName,
      existingWorktreePath: primary,
      additionalDirs,
      workspaceId,
      workspaceWorktreePaths: worktreePaths,
    })
  }
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx vitest run src/main/workspace/workspace-manager.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**
```bash
git add src/main/workspace/workspace-manager.ts src/main/workspace/workspace-manager.test.ts
git commit -m "feat(workspace): add WorkspaceManager lifecycle and spawnAgent"
```

---

## Task 8: IPC handlers + app wiring + preload allowlist

**Files:**
- Create: `src/main/ipc/workspace-handlers.ts`
- Modify: `src/main/ipc/types.ts` (`IpcDependencies`)
- Modify: `src/main/app/index.ts` (instantiate + add to `ipcDeps` + `emitListChanged`)
- Modify: `src/main/app/ipc-handlers.ts` (import + register)
- Modify: `src/preload/index.ts` (allowlists)

- [ ] **Step 1: Create the handlers**

Create `src/main/ipc/workspace-handlers.ts`:
```ts
import { ipcMain } from 'electron'
import type { WorkspaceCreateOptions, WorkspaceSpawnAgentOptions } from '../../shared/workspace-types'
import type { IpcDependencies } from './types'

export function registerWorkspaceHandlers(deps: IpcDependencies): void {
  const { workspaceManager } = deps

  ipcMain.handle('workspace:list', () => workspaceManager.list())

  ipcMain.handle('workspace:create', (_e, options: WorkspaceCreateOptions) => workspaceManager.create(options))

  ipcMain.handle('workspace:remove', (_e, id: string) => workspaceManager.remove(id))

  ipcMain.handle('workspace:add-project', (_e, id: string, projectId: string) => {
    workspaceManager.addProject(id, projectId)
  })

  ipcMain.handle('workspace:remove-project', (_e, id: string, projectId: string) => {
    workspaceManager.removeProject(id, projectId)
  })

  ipcMain.handle('workspace:spawn-agent', (_e, id: string, options: WorkspaceSpawnAgentOptions) => {
    return workspaceManager.spawnAgent(id, options)
  })
}
```

- [ ] **Step 2: Add to `IpcDependencies`**

In `src/main/ipc/types.ts`, in the `IpcDependencies` interface (after the existing `superagentManager` line), add:
```ts
  workspaceManager: import('../workspace/workspace-manager').WorkspaceManager
```

- [ ] **Step 3: Instantiate in `app/index.ts`**

In `src/main/app/index.ts`, near the `SuperagentStore` instantiation (after `const manifoldHome = …`), add:
```ts
  const workspaceStore = new WorkspaceStore(path.join(manifoldHome, 'workspaces.json'))
  const workspaceManager = new WorkspaceManager({
    store: workspaceStore,
    worktreeManager,
    projectRegistry,
    sessionManager,
    emitListChanged: () => { mainWindow?.webContents.send('workspace:list-changed') },
  })
```
Add the imports at the top of the file:
```ts
import { WorkspaceStore } from '../workspace/workspace-store'
import { WorkspaceManager } from '../workspace/workspace-manager'
```
Add `workspaceManager` to the `ipcDeps` object literal (alongside `superagentManager`):
```ts
    workspaceManager,
```

- [ ] **Step 4: Register the handlers**

In `src/main/app/ipc-handlers.ts`, add the import:
```ts
import { registerWorkspaceHandlers } from '../ipc/workspace-handlers'
```
and, next to `registerSuperagentHandlers(deps)`, add:
```ts
  registerWorkspaceHandlers(deps)
```

- [ ] **Step 5: Allow the channels in preload**

In `src/preload/index.ts`, add to `ALLOWED_INVOKE_CHANNELS` (alongside the `superagent:*` entries):
```ts
  'workspace:list',
  'workspace:create',
  'workspace:remove',
  'workspace:add-project',
  'workspace:remove-project',
  'workspace:spawn-agent',
```
and to `ALLOWED_LISTEN_CHANNELS`:
```ts
  'workspace:list-changed',
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck:node`
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add src/main/ipc/workspace-handlers.ts src/main/ipc/types.ts src/main/app/index.ts src/main/app/ipc-handlers.ts src/preload/index.ts
git commit -m "feat(workspace): wire WorkspaceManager IPC handlers"
```

---

## Task 9: Migrate `superagents.json` → `workspaces.json`

Best-effort, non-fatal: convert each Superagent's `fleetProjectIds` into a Workspace. Run once at store construction.

**Files:**
- Create: `src/main/workspace/workspace-migration.ts`
- Test: `src/main/workspace/workspace-migration.test.ts`
- Modify: `src/main/app/index.ts` (call before constructing `WorkspaceStore`)

- [ ] **Step 1: Write the failing test**

Create `src/main/workspace/workspace-migration.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { migrateSuperagentsToWorkspaces } from './workspace-migration'

describe('migrateSuperagentsToWorkspaces', () => {
  let dir: string
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-migrate-')) })
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  it('does nothing when there is no superagents file', () => {
    migrateSuperagentsToWorkspaces(path.join(dir, 'superagents.json'), path.join(dir, 'workspaces.json'))
    expect(fs.existsSync(path.join(dir, 'workspaces.json'))).toBe(false)
  })

  it('does not overwrite an existing workspaces file', () => {
    fs.writeFileSync(path.join(dir, 'superagents.json'), JSON.stringify([{ id: 's1', name: 'a', fleetProjectIds: ['p1'] }]))
    fs.writeFileSync(path.join(dir, 'workspaces.json'), '[]')
    migrateSuperagentsToWorkspaces(path.join(dir, 'superagents.json'), path.join(dir, 'workspaces.json'))
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'workspaces.json'), 'utf-8'))).toEqual([])
  })

  it('converts superagents into workspaces', () => {
    fs.writeFileSync(path.join(dir, 'superagents.json'), JSON.stringify([
      { id: 's1', name: 'auth', fleetProjectIds: ['p1', 'p2'], createdAt: '2026-04-18T00:00:00.000Z' },
      { id: 's2', name: 'logs', fleetProjectIds: ['p3'] },
    ]))
    migrateSuperagentsToWorkspaces(path.join(dir, 'superagents.json'), path.join(dir, 'workspaces.json'))
    const result = JSON.parse(fs.readFileSync(path.join(dir, 'workspaces.json'), 'utf-8'))
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 's1', name: 'auth', projectIds: ['p1', 'p2'] })
    expect(result[1]).toMatchObject({ id: 's2', name: 'logs', projectIds: ['p3'] })
  })

  it('tolerates a malformed superagents file', () => {
    fs.writeFileSync(path.join(dir, 'superagents.json'), 'not json')
    expect(() => migrateSuperagentsToWorkspaces(path.join(dir, 'superagents.json'), path.join(dir, 'workspaces.json'))).not.toThrow()
    expect(fs.existsSync(path.join(dir, 'workspaces.json'))).toBe(false)
  })
})
```

- [ ] **Step 2: Verify it fails**

Run: `npx vitest run src/main/workspace/workspace-migration.test.ts`
Expected: FAIL — cannot find module `./workspace-migration`.

- [ ] **Step 3: Implement**

Create `src/main/workspace/workspace-migration.ts`:
```ts
import * as fs from 'node:fs'
import type { Workspace } from '../../shared/workspace-types'

interface LegacySuperagent {
  id?: string
  name?: string
  fleetProjectIds?: string[]
  createdAt?: string
}

/** One-time, best-effort conversion of legacy superagents into workspaces. Never throws. */
export function migrateSuperagentsToWorkspaces(superagentsPath: string, workspacesPath: string): void {
  try {
    if (!fs.existsSync(superagentsPath)) return
    if (fs.existsSync(workspacesPath)) return // already migrated / user has workspaces
    const parsed = JSON.parse(fs.readFileSync(superagentsPath, 'utf-8'))
    if (!Array.isArray(parsed)) return
    const workspaces: Workspace[] = (parsed as LegacySuperagent[])
      .filter((s) => s.id && Array.isArray(s.fleetProjectIds))
      .map((s) => ({
        id: s.id as string,
        name: s.name ?? 'workspace',
        projectIds: s.fleetProjectIds as string[],
        createdAt: s.createdAt ?? new Date().toISOString(),
      }))
    if (workspaces.length === 0) return
    fs.writeFileSync(workspacesPath, JSON.stringify(workspaces, null, 2))
  } catch {
    // Best-effort: a failed migration must never block startup.
  }
}
```

- [ ] **Step 4: Verify it passes**

Run: `npx vitest run src/main/workspace/workspace-migration.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Call it at startup**

In `src/main/app/index.ts`, immediately before the `const workspaceStore = new WorkspaceStore(...)` line (Task 8 Step 3), add:
```ts
  migrateSuperagentsToWorkspaces(path.join(manifoldHome, 'superagents.json'), path.join(manifoldHome, 'workspaces.json'))
```
and import at the top:
```ts
import { migrateSuperagentsToWorkspaces } from '../workspace/workspace-migration'
```

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck:node`
Expected: PASS.
```bash
git add src/main/workspace/workspace-migration.ts src/main/workspace/workspace-migration.test.ts src/main/app/index.ts
git commit -m "feat(workspace): migrate legacy superagents to workspaces at startup"
```

**End of Phase A.** The Workspace backend is complete and unit-tested. The app still builds with both Superagent and Workspace present; nothing in the UI uses Workspaces yet.

---

# Phase B — Workspace UI + Superagent removal

Phase B builds the Workspace UI, switches the app to it, then deletes all Superagent code. After each task, run `npm run typecheck:node && npm run typecheck:web` and keep the build green.

## Task 10: `useWorkspaces` hook

**Files:**
- Create: `src/renderer/hooks/useWorkspaces.ts`
- Test: `src/renderer/hooks/useWorkspaces.test.ts`

Mirror `src/renderer/hooks/useSuperagents.ts` exactly, with these substitutions: type `Superagent`→`Workspace`, `SuperagentCreateOptions`→`WorkspaceCreateOptions` (from `../../shared/workspace-types`); channels `superagent:list`→`workspace:list`, `superagent:create`→`workspace:create`, `superagent:remove`→`workspace:remove`, `superagent:list-changed`→`workspace:list-changed`; drop the `kill`/`resume`/`toggleAutoApprove`/`addProject` orchestrator methods and add `spawnAgent` + `addProject`/`removeProject`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/hooks/useWorkspaces.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWorkspaces } from './useWorkspaces'

const invoke = vi.fn()
const on = vi.fn(() => () => undefined)

beforeEach(() => {
  invoke.mockReset()
  on.mockReset().mockReturnValue(() => undefined)
  ;(globalThis as unknown as { window: { electronAPI: unknown } }).window = {
    electronAPI: { invoke, on },
  } as never
})

describe('useWorkspaces', () => {
  it('loads the list on mount', async () => {
    invoke.mockResolvedValueOnce([{ id: 'w1', name: 'auth', projectIds: ['p1'], createdAt: '' }])
    const { result } = renderHook(() => useWorkspaces())
    await waitFor(() => expect(result.current.workspaces).toHaveLength(1))
    expect(invoke).toHaveBeenCalledWith('workspace:list')
  })

  it('createWorkspace invokes the channel', async () => {
    invoke.mockResolvedValue([])
    const { result } = renderHook(() => useWorkspaces())
    invoke.mockResolvedValueOnce({ id: 'w2', name: 'x', projectIds: ['p1'], createdAt: '' })
    await act(async () => { await result.current.createWorkspace({ name: 'x', projectIds: ['p1'] }) })
    expect(invoke).toHaveBeenCalledWith('workspace:create', { name: 'x', projectIds: ['p1'] })
  })

  it('spawnAgent invokes the channel', async () => {
    invoke.mockResolvedValue([])
    const { result } = renderHook(() => useWorkspaces())
    invoke.mockResolvedValueOnce({ id: 'sess-1' })
    await act(async () => { await result.current.spawnAgent('w1', { runtimeId: 'claude' }) })
    expect(invoke).toHaveBeenCalledWith('workspace:spawn-agent', 'w1', { runtimeId: 'claude' })
  })
})
```

- [ ] **Step 2: Verify it fails**

Run: `npx vitest run src/renderer/hooks/useWorkspaces.test.ts`
Expected: FAIL — cannot find module `./useWorkspaces`.

- [ ] **Step 3: Implement**

Create `src/renderer/hooks/useWorkspaces.ts`:
```ts
import { useCallback, useEffect, useState } from 'react'
import type { Workspace, WorkspaceCreateOptions, WorkspaceSpawnAgentOptions } from '../../shared/workspace-types'
import type { AgentSession } from '../../shared/types'

export interface UseWorkspacesResult {
  workspaces: Workspace[]
  createWorkspace: (opts: WorkspaceCreateOptions) => Promise<Workspace>
  removeWorkspace: (id: string) => Promise<void>
  addProject: (id: string, projectId: string) => Promise<void>
  removeProject: (id: string, projectId: string) => Promise<void>
  spawnAgent: (id: string, opts: WorkspaceSpawnAgentOptions) => Promise<AgentSession>
}

export function useWorkspaces(): UseWorkspacesResult {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])

  const refresh = useCallback(async () => {
    const list = await window.electronAPI.invoke('workspace:list')
    setWorkspaces(list as Workspace[])
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const off = window.electronAPI.on('workspace:list-changed', () => { void refresh() })
    return off
  }, [refresh])

  const createWorkspace = useCallback(async (opts: WorkspaceCreateOptions) => {
    const w = (await window.electronAPI.invoke('workspace:create', opts)) as Workspace
    await refresh()
    return w
  }, [refresh])

  const removeWorkspace = useCallback(async (id: string) => {
    await window.electronAPI.invoke('workspace:remove', id)
    await refresh()
  }, [refresh])

  const addProject = useCallback(async (id: string, projectId: string) => {
    await window.electronAPI.invoke('workspace:add-project', id, projectId)
    await refresh()
  }, [refresh])

  const removeProject = useCallback(async (id: string, projectId: string) => {
    await window.electronAPI.invoke('workspace:remove-project', id, projectId)
    await refresh()
  }, [refresh])

  const spawnAgent = useCallback(async (id: string, opts: WorkspaceSpawnAgentOptions) => {
    return (await window.electronAPI.invoke('workspace:spawn-agent', id, opts)) as AgentSession
  }, [])

  return { workspaces, createWorkspace, removeWorkspace, addProject, removeProject, spawnAgent }
}
```

- [ ] **Step 4: Verify it passes + commit**

Run: `npx vitest run src/renderer/hooks/useWorkspaces.test.ts`
Expected: PASS.
```bash
git add src/renderer/hooks/useWorkspaces.ts src/renderer/hooks/useWorkspaces.test.ts
git commit -m "feat(workspace): add useWorkspaces hook"
```

---

## Task 11: `NewWorkspaceModal`

**Files:**
- Create: `src/renderer/components/modals/NewWorkspaceModal.tsx`
- Create: `src/renderer/components/modals/NewWorkspaceModal.styles.ts` (copy `NewSuperagentModal.styles.ts` verbatim, rename the export if it has one)

Mirror `NewSuperagentModal.tsx` with these changes: title "New Workspace"; **drop the runtime `<select>`** (runtime is chosen per-agent, not per-workspace) and the `runtimes:list` effect; relabel "Fleet" → "Projects"; submit calls `onCreate({ name, projectIds: selectedProjectIds })`.

- [ ] **Step 1: Implement the modal**

Create `src/renderer/components/modals/NewWorkspaceModal.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Project } from '../../../shared/types'
import type { WorkspaceCreateOptions } from '../../../shared/workspace-types'
import { styles as s } from './NewWorkspaceModal.styles'

export interface NewWorkspaceModalProps {
  visible: boolean
  projects: Project[]
  projectError?: string | null
  onAddProject: () => Promise<Project | null>
  onCreate: (options: WorkspaceCreateOptions) => void
  onClose: () => void
}

export function NewWorkspaceModal({ visible, projects, projectError, onAddProject, onCreate, onClose }: NewWorkspaceModalProps) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [addingProject, setAddingProject] = useState(false)

  const sortedProjects = useMemo(() => [...projects].sort((a, b) => a.name.localeCompare(b.name)), [projects])

  useEffect(() => {
    if (!visible) return
    setName('')
    setSelected([])
  }, [visible])

  const canSubmit = name.trim().length > 0 && selected.length > 0

  const handleAddProject = async (): Promise<void> => {
    setAddingProject(true)
    try {
      const added = await onAddProject()
      if (added) setSelected((prev) => (prev.includes(added.id) ? prev : [...prev, added.id]))
    } finally {
      setAddingProject(false)
    }
  }

  if (!visible) return null

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.title}>New Workspace</h2>

        <div style={s.field}>
          <label style={s.label}>Name</label>
          <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. cross-repo auth rename" />
        </div>

        <div style={s.field}>
          <div style={s.fieldHeader}>
            <label style={s.label}>Projects ({selected.length}/{sortedProjects.length})</label>
            <button type="button" style={s.inlineButton} onClick={() => { void handleAddProject() }} disabled={addingProject}>
              {addingProject ? 'Adding…' : '+ Add repository'}
            </button>
          </div>
          <div style={s.fleetList}>
            {sortedProjects.length === 0 ? (
              <div style={s.emptyState}>No repositories in Manifold yet.</div>
            ) : (
              sortedProjects.map((p) => (
                <label key={p.id} style={s.fleetRow}>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))}
                  />
                  <div style={s.fleetRowText}>
                    <span style={s.fleetName}>{p.name}</span>
                    <span style={s.fleetPath}>{p.path}</span>
                  </div>
                </label>
              ))
            )}
          </div>
          {projectError && <div style={s.errorText}>{projectError}</div>}
        </div>

        <div style={s.actions}>
          <button style={s.secondaryButton} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.primaryButton, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={() => onCreate({ name, projectIds: selected })}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the styles file**

Copy `src/renderer/components/modals/NewSuperagentModal.styles.ts` to `src/renderer/components/modals/NewWorkspaceModal.styles.ts` unchanged (it exports `styles`). If the `.styles.ts` file does not exist (styles were inline), instead extract the `s` object used by `NewSuperagentModal.tsx` into the new file as `export const styles = { … }`.

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck:web`
Expected: PASS (compare to baseline error count).
```bash
git add src/renderer/components/modals/NewWorkspaceModal.tsx src/renderer/components/modals/NewWorkspaceModal.styles.ts
git commit -m "feat(workspace): add NewWorkspaceModal"
```

---

## Task 12: `WorkspaceList` sidebar + mount

**Files:**
- Create: `src/renderer/components/sidebar/WorkspaceList.tsx`
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx` (mount it)

Build a sidebar section that lists workspaces; each expands to show its projects and the agents currently running in it (matched by `session.workspaceId === workspace.id`), with a per-project "Start agent" affordance and a workspace delete button. Reuse the structure of `SuperagentList.tsx` / `ActiveSuperagentGroup.tsx` (collapsed row when not active, expanded group when active), but match child sessions by `workspaceId` instead of `childSessionIds`, and spawn via `onSpawnAgent(workspaceId, projectId)` instead of fleet spawn.

- [ ] **Step 1: Implement `WorkspaceList.tsx`**

Create `src/renderer/components/sidebar/WorkspaceList.tsx`:
```tsx
import { useCallback, useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './sidebarStyles'
import { AgentItem } from './AgentItem'

export interface WorkspaceListProps {
  workspaces: Workspace[]
  projects: Project[]
  activeWorkspaceId: string | null
  sessionsByWorkspace: Record<string, AgentSession[]>
  activeSessionId?: string | null
  outputtingSessionIds?: Set<string>
  onSelectWorkspace: (id: string) => void
  onRemoveWorkspace: (id: string) => Promise<void>
  onSelectSession: (sessionId: string, projectId: string) => void
  onSpawnAgent: (workspaceId: string) => void
  onDeleteAgent?: (session: AgentSession, projectPath: string) => void
}

export function WorkspaceList({
  workspaces, projects, activeWorkspaceId, sessionsByWorkspace,
  activeSessionId, outputtingSessionIds, onSelectWorkspace, onRemoveWorkspace,
  onSelectSession, onSpawnAgent, onDeleteAgent,
}: WorkspaceListProps) {
  const [removing, setRemoving] = useState<string | null>(null)
  const projectById = useCallback((id: string) => projects.find((p) => p.id === id), [projects])

  const handleRemove = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setRemoving(id)
    try { await onRemoveWorkspace(id) } finally { setRemoving((c) => (c === id ? null : c)) }
  }, [onRemoveWorkspace])

  if (workspaces.length === 0) return null

  return (
    <div className="sidebar-section">
      <div style={sidebarStyles.sectionHeader}>Workspaces</div>
      {workspaces.map((w) => {
        const isActive = w.id === activeWorkspaceId
        const sessions = sessionsByWorkspace[w.id] ?? []
        if (!isActive) {
          return (
            <div
              key={w.id}
              style={sidebarStyles.collapsedProject}
              onClick={() => onSelectWorkspace(w.id)}
              role="button"
              tabIndex={0}
              className="sidebar-project-group sidebar-project-group--collapsed"
              title={`${w.name} — ${w.projectIds.length} repos`}
            >
              <span className="truncate sidebar-row-label" style={{ ...sidebarStyles.item, color: 'var(--text-secondary)' }}>
                {w.name}
              </span>
            </div>
          )
        }
        return (
          <div key={w.id} className="sidebar-project-group sidebar-project-group--active">
            <div
              onClick={() => onSelectWorkspace(w.id)}
              role="button"
              tabIndex={0}
              className="sidebar-item-row sidebar-project-row sidebar-item-row--active"
              style={{ ...sidebarStyles.item, ...sidebarStyles.itemActive }}
              title={w.name}
            >
              <span className="truncate sidebar-row-label" style={sidebarStyles.itemName}>{w.name}</span>
              <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
                <button
                  type="button"
                  onClick={(e) => { void handleRemove(e, w.id) }}
                  disabled={removing === w.id}
                  className="sidebar-icon-button"
                  style={sidebarStyles.removeButton}
                  aria-label={`Remove ${w.name}`}
                  title="Remove workspace"
                >
                  &times;
                </button>
              </div>
            </div>
            {sessions.map((session) => {
              const project = projectById(session.projectId)
              return (
                <AgentItem
                  key={session.id}
                  session={session}
                  projectPath={project?.path ?? ''}
                  isActive={session.id === activeSessionId}
                  isOutputting={outputtingSessionIds?.has(session.id) ?? false}
                  onSelect={(sessionId) => onSelectSession(sessionId, session.projectId)}
                  onDelete={() => onDeleteAgent?.(session, project?.path ?? '')}
                  labelOverride={project?.name}
                />
              )
            })}
            <div
              onClick={() => onSpawnAgent(w.id)}
              role="button"
              tabIndex={0}
              className="sidebar-item-row sidebar-agent-row sidebar-agent-row--exited"
              title="Start an agent across this workspace"
            >
              <span className="truncate sidebar-row-label" style={{ ...sidebarStyles.agentBranch, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                + Start agent
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```
> Note: confirm the exact imports (`sidebarStyles`, `AgentItem`) and any `sectionHeader` style key against `SuperagentList.tsx`/`sidebarStyles`; adjust names to match what that file imports. If `sidebarStyles.sectionHeader` doesn't exist, reuse whatever header style `SuperagentList` uses for its "Superagents" heading.

- [ ] **Step 2: Mount it in `ProjectSidebar.tsx`**

In `src/renderer/components/sidebar/ProjectSidebar.tsx`, next to the existing `SuperagentList` mount block, add a `WorkspaceList` mount wired to new props threaded from `App.tsx` (Task 13): `workspaces`, `sessionsByWorkspace`, `activeWorkspaceId`, `onSelectWorkspace`, `onRemoveWorkspace`, `onSelectSession`, `onSpawnAgent`, `onDeleteAgent`. (Add the corresponding optional props to `ProjectSidebar`'s props type.)

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck:web`
Expected: PASS (baseline).
```bash
git add src/renderer/components/sidebar/WorkspaceList.tsx src/renderer/components/sidebar/ProjectSidebar.tsx
git commit -m "feat(workspace): add WorkspaceList sidebar section"
```

---

## Task 13: App-level wiring (state + spawn)

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add workspace state and handlers**

In `src/renderer/App.tsx`:
- Import and call `useWorkspaces()`:
  ```ts
  const { workspaces, createWorkspace, removeWorkspace, spawnAgent: spawnWorkspaceAgent } = useWorkspaces()
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [newWorkspaceVisible, setNewWorkspaceVisible] = useState(false)
  ```
- Derive `sessionsByWorkspace` from the already-available session lists (group sessions whose `workspaceId` is set):
  ```ts
  const sessionsByWorkspace = useMemo(() => {
    const map: Record<string, AgentSession[]> = {}
    for (const sessions of Object.values(allProjectSessions ?? {})) {
      for (const sx of sessions) {
        if (sx.workspaceId) (map[sx.workspaceId] ??= []).push(sx)
      }
    }
    return map
  }, [allProjectSessions])
  ```
  (Use whatever the existing variable holding `Record<projectId, AgentSession[]>` is named — it is passed to `SuperagentList` today as `allProjectSessions`.)
- Wire the sidebar props: `onSelectWorkspace: (id) => setActiveWorkspaceId(id)`, `onRemoveWorkspace: async (id) => { await removeWorkspace(id); setActiveWorkspaceId((c) => c === id ? null : c) }`, and:
  ```ts
  onSpawnWorkspaceAgent: async (workspaceId: string) => {
    const runtimeId = defaultRuntime // reuse the app's current default runtime
    const session = await spawnWorkspaceAgent(workspaceId, { runtimeId })
    overlays.handleSelectSession(session.id, session.projectId)
  },
  ```
  (Use the existing default-runtime value already used when creating normal agents.)
- Render `<NewWorkspaceModal visible={newWorkspaceVisible} projects={projects} onAddProject={...} onCreate={(opts) => { void createWorkspace(opts); setNewWorkspaceVisible(false) }} onClose={() => setNewWorkspaceVisible(false)} />` next to the existing `NewSuperagentModal`. Reuse the same `onAddProject` callback the superagent modal uses.
- Add a "New workspace" entry point next to "New superagent" (wherever `onNewSuperagent` is surfaced), calling `setNewWorkspaceVisible(true)`.

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck:web`
Expected: PASS (baseline).
```bash
git add src/renderer/App.tsx
git commit -m "feat(workspace): wire workspace state, sidebar, and spawn into App"
```

---

## Task 14: DockTab workspace badge

**Files:**
- Modify: `src/renderer/DockTab.tsx`

- [ ] **Step 1: Add a "W" badge for workspace agents**

In `src/renderer/DockTab.tsx`, alongside the existing `isSuperagentChildTab` logic, derive `isWorkspaceTab` from the sibling session's `workspaceId`:
```ts
const isWorkspaceTab = Boolean(siblingSession?.workspaceId)
```
and extend `roleLabel`/`roleTitle`/`roleClassName` so a workspace agent shows `W` / `Workspace` / `dock-tab__role dock-tab__role--workspace`. (Place the workspace branch before the `isSuperagentChildTab` branch so a workspace agent is labelled `W` even though it has no `parentSuperagentId`.)

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck:web`
Expected: PASS (baseline).
```bash
git add src/renderer/DockTab.tsx
git commit -m "feat(workspace): badge workspace agents in dock tabs"
```

---

## Task 15: Manual smoke test (all four runtimes)

No code. Verify the design's success criteria before deleting the old system.

- [ ] **Step 1: Build & run**

Run: `npm run dev` (or the project's run command).

- [ ] **Step 2: Verify**
  - Create a workspace of 2 git repos → it persists (check `~/.manifold/workspaces.json`), no process spawned.
  - Start a Claude agent in it → a worktree appears per repo on the agent's branch; ask it to read a file in repo A and edit one in repo B.
  - Repeat with Codex, Copilot, and Gemini (each gets the extra repo via its flag).
  - Start a second agent in the same workspace → both run on different branches without colliding.
  - Remove an agent → only its own worktrees are removed.

- [ ] **Step 3: Record results** in the PR description. If a runtime misbehaves (e.g. Codex sandbox write access, Gemini arg form), fix `working-set-args.ts` and re-run Task 3's tests before proceeding.

---

## Task 16: Delete the Superagent system

Only after Task 15 passes. Do this as one commit per cluster, typechecking between clusters so the build never breaks.

**Files (delete):**
- `src/main/superagent/` — entire directory (orchestrator-mcp-server, orchestrator-prompt, approval-broker, mcp-bridge-server, mcp-bridge-script, superagent-manager, superagent-manager-deps, superagent-store, superagent-fleet, superagent-fleet-ops, superagent-coordination, runtime-launchers/, and all their `*.test.ts`)
- `src/main/ipc/superagent-handlers.ts`, `src/main/ipc/superagent-file-handlers.ts`
- `src/shared/superagent-types.ts`
- Renderer: `src/renderer/hooks/useSuperagents.ts`, `useApprovalInbox.ts`; `src/renderer/components/sidebar/SuperagentList.tsx`, `ActiveSuperagentGroup.tsx`, `SuperagentFleetTree.tsx`; `src/renderer/components/modals/NewSuperagentModal.tsx` (+`.styles.ts`); `src/renderer/components/editor/SuperagentAgentPanel.tsx`; `src/renderer/components/superagent/` (ApprovalInbox etc.)

**Files (modify):**
- `src/main/app/index.ts` — remove `SuperagentStore`, `ApprovalBroker`, `McpBridgeServer`, `SuperagentManager` instantiation and their `ipcDeps` entries and emitters.
- `src/main/app/ipc-handlers.ts` — remove `registerSuperagentHandlers` import + call.
- `src/main/ipc/types.ts` — remove `superagentManager` and `approvalBroker` from `IpcDependencies`.
- `src/preload/index.ts` — remove all `superagent:*` invoke/listen channels.
- `src/shared/types.ts` — remove `parentSuperagentId` from `AgentSession` and `SpawnAgentOptions`; remove `existingWorktreePath`'s superagent-only doc comment wording if desired (keep the field — Task 7 uses it).
- `src/main/git/worktree-meta.ts` — remove `parentSuperagentId`.
- `src/main/session/session-creator.ts`, `session-public.ts`, `session-meta-persister.ts`, `session-discovery.ts` — remove `parentSuperagentId` reads/writes.
- `src/main/session/session-killer.ts` — (no change; already workspace-aware from Task 6).
- `src/renderer/App.tsx`, `src/renderer/components/sidebar/ProjectSidebar.tsx`, `src/renderer/DockTab.tsx` — remove all superagent state, props, handlers, mounts, and the `isSuperagentTab`/`isSuperagentChildTab` badge branches.
- `package.json` + `package-lock.json` — remove `@modelcontextprotocol/sdk`.

- [ ] **Step 1: Delete main-process superagent code + wiring**

Delete the main-process files/dirs above and remove their references in `app/index.ts`, `ipc-handlers.ts`, `ipc/types.ts`, `preload/index.ts`.
Run: `npm run typecheck:node`
Expected: PASS (no remaining references). Fix any dangling imports until it passes.
```bash
git add -A && git commit -m "refactor(workspace): remove superagent main-process system"
```

- [ ] **Step 2: Delete renderer superagent code + references**

Delete the renderer superagent files above and remove their usages in `App.tsx`, `ProjectSidebar.tsx`, `DockTab.tsx`.
Run: `npm run typecheck:web`
Expected: PASS (baseline error count, no *new* errors). Fix dangling references until clean.
```bash
git add -A && git commit -m "refactor(workspace): remove superagent renderer UI"
```

- [ ] **Step 3: Drop `parentSuperagentId` and the MCP dependency**

Remove `parentSuperagentId` from `src/shared/types.ts`, `worktree-meta.ts`, and the four session files; remove `@modelcontextprotocol/sdk` from `package.json`.
Run: `npm install` (to update the lockfile), then `npm run typecheck:node && npm run typecheck:web`.
Expected: PASS.
```bash
git add -A && git commit -m "chore(workspace): drop parentSuperagentId and @modelcontextprotocol/sdk"
```

- [ ] **Step 4: Full suite**

Run: `npm test`
Expected: PASS (superagent test files are gone; workspace tests pass). Investigate and fix any failures referencing removed modules.
```bash
git add -A && git commit -m "test(workspace): green suite after superagent removal" --allow-empty
```

---

## Final verification (whole feature)

- [ ] `npm run typecheck:node && npm run typecheck:web` — PASS (renderer at baseline).
- [ ] `npm test` — PASS.
- [ ] `git grep -in "superagent"` returns only the historical design/plan docs under `docs/` — no source references.
- [ ] Manual: all five success criteria from Task 15 still hold on the post-removal build.
