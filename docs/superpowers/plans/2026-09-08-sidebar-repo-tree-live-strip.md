# Sidebar Repo Tree + Live Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the flat Workspaces sidebar into a repo-grouped tree headed by each repo's home workspace, with a status-driven "Working now" section above it, merged worktrees folded away, and a toolbar filter.

**Architecture:** A pure grouping module (`sidebar-groups.ts`) buckets workspaces by primary repo and orders groups/members with the existing sort comparators; a persisted multi-open fold store (`sidebar-fold-state.ts`) replaces the single in-memory `expandedId`; `RepoGroup` renders a home `WorkspaceCard` (or synthetic header) with nested worktree cards and a `MergedFold`; one new IPC channel joins the verdict store to workspaces for merged ids; `WorkingNowList` and a filter field sit in `ProjectSidebar`.

**Tech Stack:** React 18 + TypeScript (renderer), Electron IPC (main), vitest + @testing-library/react (jsdom), inline `*.styles.ts` + `theme.css` tokens.

**Spec:** `docs/superpowers/specs/2026-09-08-sidebar-repo-tree-live-strip-design.md` (mockup beside it).

## Global Constraints

- Colors only via `var(--token)`; no hex/rgb in styles; no theme-conditional rules (design skill).
- Any touched file that approaches or exceeds 300 lines is split (`WorkspaceCard.tsx` is 285 → extract the label first). New styles for new components go in a co-located `*.styles.ts`, not into the 366-line `ProjectSidebar.styles.ts`.
- Three sidebar sections maximum: Favorites, Working now, Repositories.
- No new global keyboard shortcut.
- Run tests with `npm test -- <file>` (never `npx vitest`); never two `npm test` at once.
- Never write the owning company's name in code, tests, docs or commit messages (pre-commit hook blocks it). Use `kong`, `apex`, `manifold`, `vce-context` as example repo names.
- Stage only your own files (`git add <paths>`), never `git add -A`.
- Code change ⇒ update `docs/architecture/renderer.md` / `ipc.md` in the same PR, bumping `updated:`.
- Work on the current branch `sidebar-repo-tree-live-strip-spec` (already holds the spec); the PR at the end targets `main`.

---

### Task 1: Workspace glyph kind (`home | worktree | multi`)

**Files:**
- Modify: `src/shared/workspace-types.ts:31-33` (add after `isWorktreeWorkspace`)
- Modify: `src/shared/types.ts:121-127` (`ResolvedFavorite`)
- Modify: `src/renderer/components/sidebar/WorkspaceGlyph.tsx`
- Modify: `src/renderer/hooks/project/useFavorites.ts:3,36`
- Modify: `src/renderer/components/sidebar/FavoritesList.tsx:57`
- Modify: `src/renderer/components/sidebar/FavoritesList.fixture.tsx:7-8`
- Modify: `src/renderer/components/sidebar/FavoritesList.test.tsx` (every `worktree:` literal)
- Modify: `src/renderer/components/sidebar/WorkspaceCard.tsx:4,157`
- Modify: `src/renderer/components/sidebar/ProjectSidebar.test.tsx:103`
- Test: `src/renderer/components/sidebar/WorkspaceGlyph.test.tsx` (new)

**Interfaces:**
- Produces: `type WorkspaceGlyphKind = 'home' | 'worktree' | 'multi'`, `workspaceGlyphKind(workspace: Workspace): WorkspaceGlyphKind` (shared), `WorkspaceGlyph({ active?, kind? })`, `ResolvedFavorite.kind`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/sidebar/WorkspaceGlyph.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { workspaceGlyphKind } from '../../../shared/workspace-types'

const base = { id: 'w', name: 'w', createdAt: '' }

describe('workspaceGlyphKind', () => {
  it('is home for the repo’s own clone', () => {
    expect(workspaceGlyphKind({ ...base, projectIds: ['p1'] })).toBe('home')
  })

  it('is worktree when the workspace owns its checkout', () => {
    expect(workspaceGlyphKind({ ...base, projectIds: ['p1'], worktreePaths: { p1: '/wt' } })).toBe('worktree')
  })

  // A cross-repo task reads as one whether or not it owns its checkouts.
  it('is multi for several repos, checkout or not', () => {
    expect(workspaceGlyphKind({ ...base, projectIds: ['p1', 'p2'] })).toBe('multi')
    expect(workspaceGlyphKind({ ...base, projectIds: ['p1', 'p2'], worktreePaths: { p1: '/a', p2: '/b' } })).toBe('multi')
  })
})

describe('WorkspaceGlyph', () => {
  it('marks the svg with its kind', () => {
    for (const kind of ['home', 'worktree', 'multi'] as const) {
      const { container, unmount } = render(<WorkspaceGlyph kind={kind} />)
      expect(container.querySelector('svg')?.getAttribute('data-glyph')).toBe(kind)
      unmount()
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/renderer/components/sidebar/WorkspaceGlyph.test.tsx`
Expected: FAIL — `workspaceGlyphKind` is not exported.

- [ ] **Step 3: Add the shared kind + selector**

In `src/shared/workspace-types.ts`, after `isWorktreeWorkspace`:

```ts
/** Which glyph a workspace row leads with. `multi` wins: a workspace spanning
 *  several repos reads as a cross-repo task whether or not it owns its checkouts. */
export type WorkspaceGlyphKind = 'home' | 'worktree' | 'multi'

export function workspaceGlyphKind(workspace: Workspace): WorkspaceGlyphKind {
  if (workspace.projectIds.length > 1) return 'multi'
  return isWorktreeWorkspace(workspace) ? 'worktree' : 'home'
}
```

In `src/shared/types.ts`, replace the `worktree: boolean` member of `ResolvedFavorite`:

```ts
export interface ResolvedFavorite {
  id: string
  name: string
  /** Which glyph the row leads with, so it matches the workspace list below. */
  kind: import('./workspace-types').WorkspaceGlyphKind
}
```

- [ ] **Step 4: Rewrite `WorkspaceGlyph.tsx`**

```tsx
import type { WorkspaceGlyphKind } from '../../../shared/workspace-types'

// Glyph marking a Workspace in the sidebar. Shared by the workspace card, the
// favorites rows and the Working-now rows so they read as the same thing.
//
// The kind is in the shape, because the name alone cannot say which is which:
// a **home** workspace is a folder — the repo's own clone; a **worktree**
// workspace is a branch cut off it; a **multi**-repo workspace is two linked
// frames — a task spanning repos, whichever checkouts it owns.
export function WorkspaceGlyph({ active = false, kind = 'home' }: { active?: boolean; kind?: WorkspaceGlyphKind }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      data-glyph={kind}
      style={{ flexShrink: 0, color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
    >
      {kind === 'worktree' && (
        <>
          <path d="M6 3v12" />
          <circle cx="18" cy="6" r="2.6" />
          <circle cx="6" cy="18" r="2.6" />
          <path d="M18 8.6a9 9 0 0 1-9 9" />
        </>
      )}
      {kind === 'multi' && (
        <>
          <rect x="3" y="3" width="11" height="11" rx="2" />
          <path d="M10 21h9a2 2 0 0 0 2-2v-9" />
          <path d="M14 10h3a2 2 0 0 1 2 2v3" />
        </>
      )}
      {kind === 'home' && (
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      )}
    </svg>
  )
}
```

- [ ] **Step 5: Update the three callers and two fixtures**

`useFavorites.ts` line 3 → `import { workspaceGlyphKind, type Workspace } from '../../../shared/workspace-types'`; line 36 → `out.push({ id, name: workspace.name, kind: workspaceGlyphKind(workspace) })`.

`FavoritesList.tsx:57` → `<WorkspaceGlyph kind={fav.kind} />`.

`WorkspaceCard.tsx:4` → `import { workspaceGlyphKind, type Workspace } from '../../../shared/workspace-types'`; line 157 → `<WorkspaceGlyph active={isActive} kind={workspaceGlyphKind(workspace)} />`.

`FavoritesList.fixture.tsx:7-8` → `kind: 'home'` / `kind: 'worktree'`.

`FavoritesList.test.tsx`: `sed -i '' "s/worktree: false/kind: 'home'/g; s/worktree: true/kind: 'worktree'/g" src/renderer/components/sidebar/FavoritesList.test.tsx`.

`ProjectSidebar.test.tsx:103` → `expect(glyphOf('beta-space')).toBe('home')`.

- [ ] **Step 6: Run the affected tests + typecheck**

Run: `npm test -- src/renderer/components/sidebar src/renderer/hooks/project && npm run typecheck`
Expected: all PASS, typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/shared/workspace-types.ts src/shared/types.ts src/renderer/components/sidebar/WorkspaceGlyph.tsx src/renderer/components/sidebar/WorkspaceGlyph.test.tsx src/renderer/hooks/project/useFavorites.ts src/renderer/components/sidebar/FavoritesList.tsx src/renderer/components/sidebar/FavoritesList.fixture.tsx src/renderer/components/sidebar/FavoritesList.test.tsx src/renderer/components/sidebar/WorkspaceCard.tsx src/renderer/components/sidebar/ProjectSidebar.test.tsx
git commit -m "feat(sidebar): give multi-repo workspaces their own glyph kind"
```

---

### Task 2: Row label `extra` sub-label + `rowStatus`/`isLive`

**Files:**
- Modify: `src/renderer/components/sidebar/agent-labels.ts:63-93`
- Modify: `src/renderer/components/sidebar/agent-labels.test.ts` (the `workspaceRowLabel` describe)
- Modify: `src/renderer/components/sidebar/WorkspaceCard.tsx:198-200` (render `extra`)
- Modify: `src/renderer/components/sidebar/ProjectSidebar.test.tsx:114`

**Interfaces:**
- Produces: `WorkspaceRowLabel { repo: string | null; name: string; extra: string | null }`; `type RowStatus = 'waiting' | 'running' | 'error'`; `rowStatus(sessions): RowStatus | null`; `isLive(sessions): boolean`.

- [ ] **Step 1: Update and add tests in `agent-labels.test.ts`**

In the `workspaceRowLabel` describe, append `, extra: null` inside every `toEqual({...})` except the multi-repo one, which becomes:

```ts
  it('names the one extra repo of a two-repo workspace, and counts more', () => {
    expect(workspaceRowLabel(workspace('sandnes', ['platform-ai', 'kong']), PROJECTS))
      .toEqual({ repo: 'platform-ai', name: 'sandnes', extra: '+1 kong' })
    expect(workspaceRowLabel(workspace('sandnes', ['platform-ai', 'kong', 'manifold']), PROJECTS))
      .toEqual({ repo: 'platform-ai', name: 'sandnes', extra: '+2' })
  })

  // A multi-repo *home* workspace named after its primary: the repo is still
  // redundant with the name, only the extra survives.
  it('drops the repo but keeps the extra on a multi-repo home workspace', () => {
    expect(workspaceRowLabel(workspace('kong', ['kong', 'manifold'], false), PROJECTS))
      .toEqual({ repo: null, name: 'kong', extra: '+1 manifold' })
  })
```

Add a new describe at the end of the file (import `rowStatus, isLive` from `./agent-labels`):

```ts
describe('rowStatus', () => {
  const s = (...statuses: Array<'running' | 'waiting' | 'done' | 'error'>) => statuses.map((status) => ({ status }))

  it('is null when nothing is alive or failed', () => {
    expect(rowStatus([])).toBeNull()
    expect(rowStatus(s('done', 'done'))).toBeNull()
  })

  // An agent that needs you outranks one that is busy.
  it('prefers waiting over running over error', () => {
    expect(rowStatus(s('running', 'waiting'))).toBe('waiting')
    expect(rowStatus(s('running', 'error'))).toBe('running')
    expect(rowStatus(s('done', 'error'))).toBe('error')
  })

  it('isLive is true for running or waiting only', () => {
    expect(isLive(s('done', 'error'))).toBe(false)
    expect(isLive(s('done', 'waiting'))).toBe(true)
    expect(isLive(s('running'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/renderer/components/sidebar/agent-labels.test.ts`
Expected: FAIL — `extra` missing, `rowStatus` not exported.

- [ ] **Step 3: Implement in `agent-labels.ts`**

Replace the `WorkspaceRowLabel` interface and `workspaceRowLabel` function (lines 63-93) with:

```ts
export interface WorkspaceRowLabel {
  /** Dimmed leading segment; null when it would only repeat the name. */
  repo: string | null
  /** The workspace's own name, with a redundant repo prefix removed. */
  name: string
  /** The repos beyond the primary, as a muted sub-label: the one extra repo's
   *  name (`+1 kong`) or a count (`+3`). Null for a single-repo workspace. */
  extra: string | null
}

/** What a sidebar workspace row reads as: the repo it belongs to, dimmed, then
 *  its own name, then any extra repos — `kong / moss  +1 apex`.
 *
 *  The repo comes from projectIds[0], never from parsing the name. Only some
 *  stored names carry their branch prefix — a promoted worktree keeps whatever
 *  `workspaceNameFor` left behind, and a home workspace is named after its repo
 *  outright — so the name alone cannot say which repo a row belongs to. */
export function workspaceRowLabel(workspace: Workspace, projects: Project[]): WorkspaceRowLabel {
  const primary = projects.find((p) => p.id === workspace.projectIds[0])
  if (!primary) return { repo: null, name: workspace.name, extra: null }

  const extraIds = workspace.projectIds.slice(1)
  const extra = extraIds.length === 0
    ? null
    : extraIds.length === 1
      ? `+1 ${projects.find((p) => p.id === extraIds[0])?.name ?? ''}`.trimEnd()
      : `+${extraIds.length}`

  // Derived from the path, the way the branch namer derives it, so the strip
  // matches the prefix the branch actually carries.
  const prefix = repoPrefix(primary.path)
  const name = prefix && workspace.name.toLowerCase().startsWith(prefix)
    ? workspace.name.slice(prefix.length)
    : workspace.name

  // A home workspace is named after its repo; saying it twice adds nothing.
  const repo = name.toLowerCase() === primary.name.toLowerCase() ? null : primary.name
  return { repo, name, extra }
}

export type RowStatus = 'waiting' | 'running' | 'error'

/** The one state a row's dot shows for its agents: waiting beats running — an
 *  agent that needs you matters more than one that is busy — and error shows
 *  only when nothing is alive. `done` shows nothing. */
export function rowStatus(sessions: readonly Pick<AgentSession, 'status'>[]): RowStatus | null {
  if (sessions.some((s) => s.status === 'waiting')) return 'waiting'
  if (sessions.some((s) => s.status === 'running')) return 'running'
  if (sessions.some((s) => s.status === 'error')) return 'error'
  return null
}

export function isLive(sessions: readonly Pick<AgentSession, 'status'>[]): boolean {
  return sessions.some((s) => s.status === 'running' || s.status === 'waiting')
}
```

- [ ] **Step 4: Render `extra` on the card (temporary spot; Task 6 moves it)**

In `WorkspaceCard.tsx`, directly after the `<span className={\`truncate ${sweep}\`.trim()} ...>{label.name}</span>` element (≈line 200), add:

```tsx
              {label.extra && <span className="sidebar-row-extra">{label.extra}</span>}
```

And in `ProjectSidebar.test.tsx:114` replace the single assertion with:

```ts
    expect(within(row as HTMLElement).getByText('Alpha')).toBeInTheDocument()
    expect(within(row as HTMLElement).getByText('+1 Beta')).toBeInTheDocument()
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/renderer/components/sidebar`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/sidebar/agent-labels.ts src/renderer/components/sidebar/agent-labels.test.ts src/renderer/components/sidebar/WorkspaceCard.tsx src/renderer/components/sidebar/ProjectSidebar.test.tsx
git commit -m "feat(sidebar): split the +N extra repos into a sub-label; add rowStatus"
```

---

### Task 3: Persisted multi-open fold store

**Files:**
- Create: `src/renderer/components/sidebar/sidebar-fold-state.ts`
- Test: `src/renderer/components/sidebar/sidebar-fold-state.test.ts`

**Interfaces:**
- Produces: `workspaceFoldKey(id): string`, `repoFoldKey(projectId): string`, `useWorkspaceFolds(): { isOpen(key): boolean; toggle(key): void; open(key): void }`. Storage key `manifold.sidebar.openWorkspaces.v1` (JSON string array).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkspaceFolds, workspaceFoldKey, repoFoldKey } from './sidebar-fold-state'

function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() { return store.size },
  } as Storage)
  return store
}

let store: Map<string, string>
beforeEach(() => { store = installLocalStorage() })

const KEY = 'manifold.sidebar.openWorkspaces.v1'

describe('useWorkspaceFolds', () => {
  it('namespaces keys by what they fold', () => {
    expect(workspaceFoldKey('w1')).toBe('workspace:w1')
    expect(repoFoldKey('p1')).toBe('repo:p1')
  })

  it('starts closed, toggles open, and persists', () => {
    const { result } = renderHook(() => useWorkspaceFolds())
    expect(result.current.isOpen('workspace:w1')).toBe(false)
    act(() => result.current.toggle('workspace:w1'))
    expect(result.current.isOpen('workspace:w1')).toBe(true)
    expect(JSON.parse(store.get(KEY)!)).toEqual(['workspace:w1'])
    act(() => result.current.toggle('workspace:w1'))
    expect(result.current.isOpen('workspace:w1')).toBe(false)
  })

  // #902: opening one card never closes another.
  it('keeps any number open at once', () => {
    const { result } = renderHook(() => useWorkspaceFolds())
    act(() => { result.current.toggle('workspace:w1'); result.current.toggle('workspace:w2') })
    expect(result.current.isOpen('workspace:w1')).toBe(true)
    expect(result.current.isOpen('workspace:w2')).toBe(true)
  })

  // Entering a workspace reveals it; it must not shut one already showing.
  it('open is idempotent', () => {
    const { result } = renderHook(() => useWorkspaceFolds())
    act(() => result.current.open('workspace:w1'))
    act(() => result.current.open('workspace:w1'))
    expect(result.current.isOpen('workspace:w1')).toBe(true)
  })

  it('restores from storage on mount', () => {
    store.set(KEY, JSON.stringify(['repo:p9']))
    const { result } = renderHook(() => useWorkspaceFolds())
    expect(result.current.isOpen('repo:p9')).toBe(true)
  })

  it('keeps two mounted copies in step', () => {
    const a = renderHook(() => useWorkspaceFolds())
    const b = renderHook(() => useWorkspaceFolds())
    act(() => a.result.current.toggle('workspace:w1'))
    expect(b.result.current.isOpen('workspace:w1')).toBe(true)
  })

  it('keeps toggling in memory when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    } as unknown as Storage)
    const { result } = renderHook(() => useWorkspaceFolds())
    act(() => result.current.toggle('workspace:w1'))
    expect(result.current.isOpen('workspace:w1')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/renderer/components/sidebar/sidebar-fold-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `sidebar-fold-state.ts`**

```ts
import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'manifold.sidebar.openWorkspaces.v1'

/** A workspace card. A home card's key also folds the worktrees under its repo. */
export function workspaceFoldKey(workspaceId: string): string {
  return `workspace:${workspaceId}`
}

/** A repo that has worktree workspaces but no home workspace to head them. */
export function repoFoldKey(projectId: string): string {
  return `repo:${projectId}`
}

/** Every mounted copy of the hook works on one set — the list and each group
 *  read it — so a toggle anywhere is seen everywhere. */
const listeners = new Set<() => void>()

/** Holds the set once storage has proved unusable, and is authoritative from
 *  then on so the toggles keep working without persistence. */
let unstored: Set<string> | null = null

function readOpen(): Set<string> {
  if (unstored) return unstored
  if (typeof localStorage === 'undefined') return (unstored = new Set())
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((key): key is string => typeof key === 'string'))
      : new Set()
  } catch {
    return (unstored = new Set())
  }
}

function commit(next: Set<string>): void {
  if (unstored) {
    unstored = next
  } else {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      unstored = next
    }
  }
  for (const listener of listeners) listener()
}

/** Which workspace cards are open, remembered across launches. Any number at
 *  once — opening one never closes another (#902). `open` is idempotent and is
 *  what activation calls, so entering a workspace reveals it without shutting
 *  it when it was already showing. */
export function useWorkspaceFolds(): {
  isOpen: (key: string) => boolean
  toggle: (key: string) => void
  open: (key: string) => void
} {
  const [openKeys, setOpenKeys] = useState<Set<string>>(readOpen)

  useEffect(() => {
    const sync = (): void => { setOpenKeys(new Set(readOpen())) }
    listeners.add(sync)
    return () => { listeners.delete(sync) }
  }, [])

  const isOpen = useCallback((key: string): boolean => openKeys.has(key), [openKeys])

  const toggle = useCallback((key: string): void => {
    const next = new Set(readOpen())
    if (!next.delete(key)) next.add(key)
    commit(next)
  }, [])

  const open = useCallback((key: string): void => {
    const current = readOpen()
    if (current.has(key)) return
    commit(new Set(current).add(key))
  }, [])

  return { isOpen, toggle, open }
}
```

Note: `unstored` is module state. The "storage throws" test runs last in its file; if you reorder tests, reset it by adding `export function __resetFoldStateForTests(): void { unstored = null }` and calling it in `beforeEach`.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/renderer/components/sidebar/sidebar-fold-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/sidebar/sidebar-fold-state.ts src/renderer/components/sidebar/sidebar-fold-state.test.ts
git commit -m "feat(sidebar): persisted multi-open fold store for workspace cards"
```

---

### Task 4: Grouping model (`sidebar-groups.ts`)

**Files:**
- Create: `src/renderer/components/sidebar/sidebar-groups.ts`
- Test: `src/renderer/components/sidebar/sidebar-groups.test.ts`

**Interfaces:**
- Consumes: `sortWorkspaces` (`sidebar-sort.ts`), `ProjectRecency`, `isLive`/`rowStatus`/`RowStatus` (Task 2), `workspaceFoldKey`/`repoFoldKey` (Task 3).
- Produces:

```ts
export interface RepoGroup {
  foldKey: string            // the home card's key, or repo:<id> when there is no home
  projectId: string | null
  repoName: string
  home: Workspace | null
  worktrees: Workspace[]     // display order, merged excluded
  merged: Workspace[]        // behind the fold, same order
}
export interface GroupContext { mode: SidebarSortMode; recency: ProjectRecency; activeId: string | null; mergedIds: ReadonlySet<string>; liveIds: ReadonlySet<string> }
export function liveWorkspaceIds(sessionsByWorkspace: Record<string, AgentSession[]>): Set<string>
export function groupWorkspaces(workspaces: readonly Workspace[], projects: readonly Project[], ctx: GroupContext): RepoGroup[]
export function groupMembers(group: RepoGroup): Workspace[]
export function groupStatuses(sessionLists: readonly AgentSession[][]): RowStatus[]   // distinct, in waiting>running>error order
export function filterGroups(groups: readonly RepoGroup[], query: string): RepoGroup[]
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import type { AgentSession, Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { filterGroups, groupStatuses, groupWorkspaces, liveWorkspaceIds, type GroupContext } from './sidebar-groups'

const projects: Project[] = [
  { id: 'p-apex', name: 'apex', path: '/repos/apex', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p-kong', name: 'kong', path: '/repos/kong', baseBranch: 'main', addedAt: '2024-01-02' },
]

const home = (id: string, name: string, projectIds: string[]): Workspace =>
  ({ id, name, projectIds, createdAt: '2024-01-01' })
const wt = (id: string, name: string, projectIds: string[], branchName = `${name}-branch`): Workspace =>
  ({ id, name, projectIds, createdAt: '2024-01-01', branchName, worktreePaths: Object.fromEntries(projectIds.map((p) => [p, `/wt/${id}/${p}`])) })

const ctx = (over: Partial<GroupContext> = {}): GroupContext =>
  ({ mode: 'recency', recency: {}, activeId: null, mergedIds: new Set(), liveIds: new Set(), ...over })

const ids = (ws: Workspace[]) => ws.map((w) => w.id)

describe('groupWorkspaces — shape', () => {
  it('buckets by primary repo: home first, worktrees after, keyed by the home card', () => {
    const groups = groupWorkspaces([wt('w-moss', 'moss', ['p-kong']), home('w-kong', 'kong', ['p-kong'])], projects, ctx())
    expect(groups).toHaveLength(1)
    expect(groups[0].repoName).toBe('kong')
    expect(groups[0].home?.id).toBe('w-kong')
    expect(ids(groups[0].worktrees)).toEqual(['w-moss'])
    expect(groups[0].foldKey).toBe('workspace:w-kong')
  })

  it('heads a home-less repo with a repo key', () => {
    const [g] = groupWorkspaces([wt('w-moss', 'moss', ['p-kong'])], projects, ctx())
    expect(g.home).toBeNull()
    expect(g.foldKey).toBe('repo:p-kong')
    expect(g.repoName).toBe('kong')
  })

  // A multi-repo workspace appears once, under its primary (#939).
  it('anchors a multi-repo workspace under projectIds[0] only', () => {
    const groups = groupWorkspaces(
      [home('w-kong', 'kong', ['p-kong']), home('w-apex', 'apex', ['p-apex']), wt('w-x', 'cross', ['p-kong', 'p-apex'])],
      projects, ctx({ mode: 'alpha' }),
    )
    expect(groups.map((g) => g.repoName)).toEqual(['apex', 'kong'])
    expect(ids(groups[1].worktrees)).toEqual(['w-x'])
    expect(groups[0].worktrees).toEqual([])
  })

  it('gives a workspace with an unknown primary its own group, named after itself', () => {
    const [g] = groupWorkspaces([home('w-ghost', 'ghost', ['p-none'])], projects, ctx())
    expect(g.repoName).toBe('ghost')
    expect(g.home?.id).toBe('w-ghost')
    expect(g.foldKey).toBe('workspace:w-ghost')
  })

  it('folds merged worktrees unless one is live', () => {
    const [g] = groupWorkspaces(
      [home('w-kong', 'kong', ['p-kong']), wt('w-a', 'a', ['p-kong']), wt('w-b', 'b', ['p-kong']), wt('w-c', 'c', ['p-kong'])],
      projects, ctx({ mergedIds: new Set(['w-b', 'w-c']), liveIds: new Set(['w-c']) }),
    )
    expect(ids(g.worktrees)).toEqual(['w-a', 'w-c'])
    expect(ids(g.merged)).toEqual(['w-b'])
  })
})

describe('groupWorkspaces — order', () => {
  const list = [
    home('w-apex', 'apex', ['p-apex']),
    home('w-kong', 'kong', ['p-kong']),
    wt('w-moss', 'moss', ['p-kong']),
    wt('w-dune', 'dune', ['p-kong']),
  ]

  it('recency: the active workspace’s whole group comes first', () => {
    const groups = groupWorkspaces(list, projects, ctx({ recency: { 'w-apex': 500 }, activeId: 'w-moss' }))
    expect(groups.map((g) => g.repoName)).toEqual(['kong', 'apex'])
  })

  it('recency: a group is as recent as its most recent member', () => {
    const groups = groupWorkspaces(list, projects, ctx({ recency: { 'w-apex': 100, 'w-dune': 900 } }))
    expect(groups.map((g) => g.repoName)).toEqual(['kong', 'apex'])
    expect(ids(groups[0].worktrees)).toEqual(['w-dune', 'w-moss'])
  })

  it('alpha: groups by repo name, members A–Z, no pin', () => {
    const groups = groupWorkspaces(list, projects, ctx({ mode: 'alpha', activeId: 'w-moss', recency: { 'w-moss': 900 } }))
    expect(groups.map((g) => g.repoName)).toEqual(['apex', 'kong'])
    expect(ids(groups[1].worktrees)).toEqual(['w-dune', 'w-moss'])
  })
})

describe('liveWorkspaceIds / groupStatuses', () => {
  const s = (id: string, status: AgentSession['status']): AgentSession =>
    ({ id, projectId: 'p', runtimeId: 'claude', branchName: 'b', worktreePath: '/', status, pid: 1, additionalDirs: [] })

  it('lists workspaces with a running or waiting agent', () => {
    expect(liveWorkspaceIds({ a: [s('1', 'done')], b: [s('2', 'waiting')], c: [s('3', 'running'), s('4', 'done')] }))
      .toEqual(new Set(['b', 'c']))
  })

  it('reports each distinct status once, most urgent first', () => {
    expect(groupStatuses([[s('1', 'running')], [s('2', 'error')], [s('3', 'running'), s('4', 'waiting')]]))
      .toEqual(['waiting', 'running', 'error'])
    expect(groupStatuses([[s('1', 'done')]])).toEqual([])
  })
})

describe('filterGroups', () => {
  const groups = groupWorkspaces(
    [home('w-kong', 'kong', ['p-kong']), wt('w-moss', 'moss', ['p-kong'], 'kong/moss-x'), wt('w-dune', 'dune', ['p-kong']), wt('w-old', 'old', ['p-kong']), home('w-apex', 'apex', ['p-apex'])],
    projects, ctx({ mode: 'alpha', mergedIds: new Set(['w-old']) }),
  )

  it('returns the groups untouched for a blank query', () => {
    expect(filterGroups(groups, '  ')).toEqual(groups)
  })

  it('keeps only matching members, drops empty groups, and bypasses the merged fold', () => {
    const out = filterGroups(groups, 'OLD')
    expect(out).toHaveLength(1)
    expect(out[0].repoName).toBe('kong')
    expect(out[0].home).toBeNull()
    expect(ids(out[0].worktrees)).toEqual(['w-old'])
    expect(out[0].merged).toEqual([])
  })

  it('matches on branch name too', () => {
    const out = filterGroups(groups, 'moss-x')
    expect(ids(out[0].worktrees)).toEqual(['w-moss'])
  })

  it('a repo-name hit keeps every member', () => {
    const out = filterGroups(groups, 'kong')
    expect(out).toHaveLength(1)
    expect(out[0].home?.id).toBe('w-kong')
    expect(ids(out[0].worktrees)).toEqual(['w-dune', 'w-moss', 'w-old'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/renderer/components/sidebar/sidebar-groups.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `sidebar-groups.ts`**

```ts
import type { AgentSession, Project } from '../../../shared/types'
import { isWorktreeWorkspace, type Workspace } from '../../../shared/workspace-types'
import { isLive, rowStatus, type RowStatus } from './agent-labels'
import { repoFoldKey, workspaceFoldKey } from './sidebar-fold-state'
import type { ProjectRecency } from './sidebar-recency'
import { sortWorkspaces, type SidebarSortMode } from './sidebar-sort'

/** One repo's family in the sidebar: its home workspace heads the group and the
 *  worktree workspaces cut off it hang underneath (#939). A multi-repo
 *  workspace belongs to the group of its primary repo and nowhere else. */
export interface RepoGroup {
  /** Fold-store key: the home card's, or `repo:<id>` when the repo has no home. */
  foldKey: string
  projectId: string | null
  repoName: string
  home: Workspace | null
  /** Worktree workspaces in display order, merged ones excluded. */
  worktrees: Workspace[]
  /** Merged worktree workspaces, same order; rendered behind the fold. */
  merged: Workspace[]
}

export interface GroupContext {
  mode: SidebarSortMode
  recency: ProjectRecency
  activeId: string | null
  /** Worktree workspaces whose branch a verdict recorded as merged. */
  mergedIds: ReadonlySet<string>
  /** Workspaces with a running or waiting agent; never folded as merged. */
  liveIds: ReadonlySet<string>
}

export function liveWorkspaceIds(sessionsByWorkspace: Record<string, AgentSession[]>): Set<string> {
  const ids = new Set<string>()
  for (const [id, sessions] of Object.entries(sessionsByWorkspace)) {
    if (isLive(sessions)) ids.add(id)
  }
  return ids
}

export function groupMembers(group: RepoGroup): Workspace[] {
  return [group.home, ...group.worktrees, ...group.merged].filter((w): w is Workspace => w !== null)
}

/** Every distinct agent state under a group, most urgent first — what a
 *  collapsed parent shows as small dots. */
export function groupStatuses(sessionLists: readonly AgentSession[][]): RowStatus[] {
  const present = new Set(sessionLists.map(rowStatus).filter((s): s is RowStatus => s !== null))
  return (['waiting', 'running', 'error'] as const).filter((s) => present.has(s))
}

export function groupWorkspaces(
  workspaces: readonly Workspace[],
  projects: readonly Project[],
  ctx: GroupContext,
): RepoGroup[] {
  const byKey = new Map<string, RepoGroup>()

  for (const workspace of workspaces) {
    const primary = projects.find((p) => p.id === workspace.projectIds[0])
    // Unknown primary: the workspace stands alone, named after itself, so
    // nothing ever disappears from the list.
    const bucket = primary ? `repo:${primary.id}` : `lone:${workspace.id}`
    let group = byKey.get(bucket)
    if (!group) {
      group = {
        foldKey: primary ? repoFoldKey(primary.id) : workspaceFoldKey(workspace.id),
        projectId: primary?.id ?? null,
        repoName: primary?.name ?? workspace.name,
        home: null,
        worktrees: [],
        merged: [],
      }
      byKey.set(bucket, group)
    }
    if (!isWorktreeWorkspace(workspace) && group.home === null) {
      group.home = workspace
      group.foldKey = workspaceFoldKey(workspace.id)
    } else if (ctx.mergedIds.has(workspace.id) && !ctx.liveIds.has(workspace.id)) {
      group.merged.push(workspace)
    } else {
      group.worktrees.push(workspace)
    }
  }

  // Members order with the mode's own comparator, no pin: the group pin below
  // is what puts the active family first, and inside it the active row is the
  // most recently touched anyway.
  const memberCtx = { recency: ctx.recency, activeId: null, projects: [...projects] }
  const groups = [...byKey.values()].map((g) => ({
    ...g,
    worktrees: sortWorkspaces(g.worktrees, ctx.mode, memberCtx),
    merged: sortWorkspaces(g.merged, ctx.mode, memberCtx),
  }))

  if (ctx.mode === 'alpha') {
    return groups.sort((a, b) => a.repoName.localeCompare(b.repoName, undefined, { sensitivity: 'base' }))
  }
  const latest = (g: RepoGroup): number => Math.max(0, ...groupMembers(g).map((w) => ctx.recency[w.id] ?? 0))
  const holdsActive = (g: RepoGroup): number =>
    ctx.activeId !== null && groupMembers(g).some((w) => w.id === ctx.activeId) ? 1 : 0
  return groups.sort((a, b) => holdsActive(b) - holdsActive(a) || latest(b) - latest(a))
}

/** Case-insensitive substring over repo name, workspace name and branch. A
 *  repo-name hit keeps the whole family; otherwise members are trimmed to the
 *  hits. Merged members are searched like any other and surface inline — the
 *  fold is for browsing, not for hiding a name you typed. */
export function filterGroups(groups: readonly RepoGroup[], query: string): RepoGroup[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...groups]
  const hits = (w: Workspace): boolean =>
    w.name.toLowerCase().includes(q) || (w.branchName?.toLowerCase().includes(q) ?? false)

  const out: RepoGroup[] = []
  for (const g of groups) {
    const all = [...g.worktrees, ...g.merged]
    if (g.repoName.toLowerCase().includes(q)) {
      out.push({ ...g, worktrees: all, merged: [] })
      continue
    }
    const home = g.home && hits(g.home) ? g.home : null
    const worktrees = all.filter(hits)
    if (home || worktrees.length > 0) out.push({ ...g, home, worktrees, merged: [] })
  }
  return out
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/renderer/components/sidebar/sidebar-groups.test.ts`
Expected: PASS. (If the alpha member-order test fails on `w-old` placement, the `sortAlphabetically` key is `[repo ?? name, name]` — `dune, moss, old` is the expected order; fix the test data, not the sort.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/sidebar/sidebar-groups.ts src/renderer/components/sidebar/sidebar-groups.test.ts
git commit -m "feat(sidebar): pure repo-grouping model with filter and merged fold"
```

---

### Task 5: `workspace:list-merged` IPC + renderer hook

**Files:**
- Modify: `src/main/ipc/workspace-handlers.ts`
- Modify: `src/preload/index.ts:120` (allowlist)
- Create: `src/main/ipc/workspace-handlers.test.ts`
- Create: `src/renderer/hooks/project/useMergedWorkspaces.ts`
- Create: `src/renderer/hooks/project/useMergedWorkspaces.test.ts`

**Interfaces:**
- Produces: IPC `workspace:list-merged` → `string[]` (workspace ids); `useMergedWorkspaces(workspaces: readonly Workspace[], sessionsByWorkspace: Record<string, AgentSession[]>): ReadonlySet<string>`.

- [ ] **Step 1: Write the failing main-process test**

`src/main/ipc/workspace-handlers.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => { handlers.set(channel, fn) }),
  }
})

vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))

const verdict = (projectId: string, branch: string, outcome: string) => ({
  sessionId: `s-${branch}`, projectId, branch, runtime: 'claude',
  taskPrompt: { kind: 'full', text: '' }, outcome, createdAt: '',
  metrics: { agentCommits: 1, humanEdits: 0, diffLines: { added: 1, removed: 0 }, filesChanged: 1 },
})

async function register(workspaces: unknown[], verdicts: unknown[]) {
  const { registerWorkspaceHandlers } = await import('./workspace-handlers')
  registerWorkspaceHandlers({
    workspaceManager: { list: vi.fn(() => workspaces) },
    activeWorkspaceStore: { get: vi.fn(), set: vi.fn() },
    verdictStore: { listAll: vi.fn(() => verdicts) },
  } as never)
  const handler = mocks.handlers.get('workspace:list-merged')
  if (!handler) throw new Error('workspace:list-merged not registered')
  return handler
}

describe('workspace:list-merged', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.handlers.clear() })

  it('returns worktree workspaces whose primary repo + branch has a merged verdict', async () => {
    const handler = await register(
      [
        { id: 'w-merged', name: 'a', projectIds: ['p1'], createdAt: '', branchName: 'kong/oslo', worktreePaths: { p1: '/wt' } },
        { id: 'w-open', name: 'b', projectIds: ['p1'], createdAt: '', branchName: 'kong/bergen', worktreePaths: { p1: '/wt2' } },
        { id: 'w-other-repo', name: 'c', projectIds: ['p2'], createdAt: '', branchName: 'kong/oslo', worktreePaths: { p2: '/wt3' } },
      ],
      [verdict('p1', 'kong/oslo', 'merged'), verdict('p1', 'kong/bergen', 'pr_created')],
    )
    expect(await handler({})).toEqual(['w-merged'])
  })

  // Only the recorder's activity-gated `merged` counts; prState alone does not.
  it('ignores every other outcome', async () => {
    const handler = await register(
      [{ id: 'w', name: 'a', projectIds: ['p1'], createdAt: '', branchName: 'kong/oslo', worktreePaths: { p1: '/wt' } }],
      [verdict('p1', 'kong/oslo', 'committed_only'), verdict('p1', 'kong/oslo', 'discarded')],
    )
    expect(await handler({})).toEqual([])
  })

  it('never reports a home workspace, which carries no branch of its own', async () => {
    const handler = await register(
      [{ id: 'w-home', name: 'kong', projectIds: ['p1'], createdAt: '' }],
      [verdict('p1', 'main', 'merged')],
    )
    expect(await handler({})).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/main/ipc/workspace-handlers.test.ts`
Expected: FAIL — "workspace:list-merged not registered".

- [ ] **Step 3: Add the handler and allowlist entry**

In `workspace-handlers.ts`, change the destructure to `const { workspaceManager, activeWorkspaceStore, verdictStore } = deps` and add after the `workspace:list` handler:

```ts
  // Worktree workspaces whose branch a verdict recorded as merged, for the
  // sidebar's merged fold. Only the recorder's `merged` outcome counts: it is
  // gated on the session having produced work (verdict-recorder.ts), so an
  // empty branch — trivially an ancestor of its base — never folds a live
  // workspace. Matched on primary repo + branch, the two things a verdict and a
  // workspace both name.
  ipcMain.handle('workspace:list-merged', (): string[] => {
    const merged = new Set(
      verdictStore.listAll()
        .filter((r) => r.outcome === 'merged')
        .map((r) => `${r.projectId}\n${r.branch}`),
    )
    return workspaceManager.list()
      .filter((w) => w.branchName !== undefined && w.projectIds.length > 0 && merged.has(`${w.projectIds[0]}\n${w.branchName}`))
      .map((w) => w.id)
  })
```

In `src/preload/index.ts`, after `'workspace:set-active',` (line 120) add `'workspace:list-merged',`.

- [ ] **Step 4: Run main test**

Run: `npm test -- src/main/ipc/workspace-handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing hook test**

`src/renderer/hooks/project/useMergedWorkspaces.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { Workspace } from '../../../shared/workspace-types'
import type { AgentSession } from '../../../shared/types'
import { useMergedWorkspaces } from './useMergedWorkspaces'

const mockInvoke = vi.fn()
beforeEach(() => {
  mockInvoke.mockReset()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = { invoke: mockInvoke, on: vi.fn(() => vi.fn()) }
})

const w = (id: string): Workspace => ({ id, name: id, projectIds: ['p'], createdAt: '' })
const s = (id: string): AgentSession =>
  ({ id, projectId: 'p', runtimeId: 'claude', branchName: 'b', worktreePath: '/', status: 'done', pid: 1, additionalDirs: [] })

describe('useMergedWorkspaces', () => {
  it('asks main once on mount and exposes the ids as a set', async () => {
    mockInvoke.mockResolvedValueOnce(['w2'])
    const { result } = renderHook(() => useMergedWorkspaces([w('w1'), w('w2')], {}))
    await waitFor(() => expect(result.current.has('w2')).toBe(true))
    expect(mockInvoke).toHaveBeenCalledWith('workspace:list-merged')
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  // Verdicts finalize when a session terminates, so the session set is the
  // signal that the answer may have changed.
  it('re-asks when the session set changes, not on an unrelated rerender', async () => {
    mockInvoke.mockResolvedValue([])
    const { rerender } = renderHook(
      ({ sessions }: { sessions: Record<string, AgentSession[]> }) => useMergedWorkspaces([w('w1')], sessions),
      { initialProps: { sessions: { w1: [s('a')] } } },
    )
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1))
    rerender({ sessions: { w1: [s('a')] } })
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    rerender({ sessions: { w1: [] } })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2))
  })

  it('leaves the set empty when main fails or answers nothing', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('no'))
    const { result } = renderHook(() => useMergedWorkspaces([w('w1')], {}))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled())
    expect(result.current.size).toBe(0)
  })
})
```

- [ ] **Step 6: Run to verify failure**

Run: `npm test -- src/renderer/hooks/project/useMergedWorkspaces.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the hook**

```ts
import { useEffect, useState } from 'react'
import type { AgentSession } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

const EMPTY: ReadonlySet<string> = new Set()
let warned = false

/** Ids of worktree workspaces whose branch is recorded as merged, so the
 *  sidebar can fold them. Re-asked whenever the set of workspaces or of
 *  sessions changes: verdicts finalize when a session terminates, so that is
 *  when the answer can move. A merge the background PR poll finds later shows
 *  on the next such change or relaunch — the fold is tidiness, not truth.
 *  Failure leaves the set empty: nothing folds, the list is merely longer. */
export function useMergedWorkspaces(
  workspaces: readonly Workspace[],
  sessionsByWorkspace: Record<string, AgentSession[]>,
): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(EMPTY)
  const workspaceKey = workspaces.map((w) => w.id).join('|')
  const sessionKey = Object.values(sessionsByWorkspace).flat().map((s) => s.id).sort().join('|')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // `await` on a bare mock (undefined) is fine: tests that never stub the
        // channel just see an empty set.
        const result = (await window.electronAPI.invoke('workspace:list-merged')) as string[] | undefined
        if (!cancelled) setIds(new Set(result ?? []))
      } catch (err) {
        if (!warned) {
          warned = true
          console.warn('[useMergedWorkspaces] could not read merged workspaces', err)
        }
        if (!cancelled) setIds(EMPTY)
      }
    })()
    return () => { cancelled = true }
  }, [workspaceKey, sessionKey])

  return ids
}
```

- [ ] **Step 8: Run tests + typecheck**

Run: `npm test -- src/renderer/hooks/project/useMergedWorkspaces.test.ts src/main/ipc/workspace-handlers.test.ts && npm run typecheck`
Expected: PASS, typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/main/ipc/workspace-handlers.ts src/main/ipc/workspace-handlers.test.ts src/preload/index.ts src/renderer/hooks/project/useMergedWorkspaces.ts src/renderer/hooks/project/useMergedWorkspaces.test.ts
git commit -m "feat(workspace): workspace:list-merged joins verdicts to worktree workspaces"
```

---

### Task 6: Extract `WorkspaceRowLabel`, status-coloured dot, `nested` prop

**Files:**
- Create: `src/renderer/components/sidebar/WorkspaceRowLabel.tsx`
- Modify: `src/renderer/components/sidebar/WorkspaceCard.tsx` (props, row className, label block)
- Modify: `src/renderer/styles/theme.css` (after `.status-dot--active` ≈ line 490; after `.sidebar-item-actions` block; reduced-motion block ≈ line 2151)
- Modify: `src/renderer/components/sidebar/ProjectSidebar.test-helpers.tsx:64-67` (`sampleSessions` statuses)
- Modify: `src/renderer/components/sidebar/ProjectSidebar.test.tsx:177-189` (dot tests)

**Interfaces:**
- Produces: `WorkspaceRowLabel({ label, showRepo, status, sweeping, onDoubleClick?, title? })`; `WorkspaceCardProps.nested?: boolean`; `WorkspaceCardProps.summary?: { count: number; statuses: RowStatus[] }` (rendered by Task 7's `GroupSummary`, declared here so the card compiles standalone).
- CSS classes: `.status-dot--running|--waiting|--error`, `.status-dot--small`, `.sidebar-item-row--nested`, `.sidebar-workspace-card--nested`, `.sidebar-row-extra`.

- [ ] **Step 1: Make the default test sessions quiet, then rewrite the two dot tests**

In `ProjectSidebar.test-helpers.tsx`, change both `sampleSessions` entries to `status: 'done'` and add above the array:

```ts
// Both done: the dot and the Working-now section follow agent *status* now, so a
// live default would put every workspace name on screen twice. Tests that need
// a live agent spread one of these with `status: 'running' | 'waiting'`.
```

In `ProjectSidebar.test.tsx`, replace the tests "pulses a dot … while outputting" and "shows no dot while its agents are quiet" with:

```ts
  // The dot is the agents' state, not their output: waiting outranks running,
  // because an agent that needs you is the one thing you must notice.
  it('colours the dot by state — waiting beats running', () => {
    renderSidebar({
      sessionsByWorkspace: {
        w1: [{ ...sampleSessions[0], status: 'running' }, { ...sampleSessions[1], status: 'waiting' }],
        w2: [],
      },
    })

    const card = screen.getByText('alpha-space').closest<HTMLElement>('.sidebar-workspace-card')
    const dot = within(card!).getByLabelText('An agent is waiting for you in this workspace')
    expect(dot.className).toContain('status-dot--waiting')
  })

  it('shows a running dot when no agent is waiting', () => {
    renderSidebar({ sessionsByWorkspace: { w1: [{ ...sampleSessions[0], status: 'running' }], w2: [] } })

    expect(screen.getByLabelText('An agent is working in this workspace').className).toContain('status-dot--running')
  })

  it('shows no dot while every agent is done', () => {
    renderSidebar()

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
```

Add `sampleSessions` to the import from `./ProjectSidebar.test-helpers`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/renderer/components/sidebar/ProjectSidebar.test.tsx`
Expected: FAIL — no element labelled "An agent is waiting for you in this workspace".

- [ ] **Step 3: Create `WorkspaceRowLabel.tsx`**

```tsx
import React from 'react'
import { sidebarStyles } from './ProjectSidebar.styles'
import type { RowStatus, WorkspaceRowLabel as RowLabel } from './agent-labels'

const STATUS_LABEL: Record<RowStatus, string> = {
  running: 'An agent is working in this workspace',
  waiting: 'An agent is waiting for you in this workspace',
  error: 'An agent failed in this workspace',
}

export interface WorkspaceRowLabelProps {
  label: RowLabel
  /** False on a nested row: the parent row already names the repo. */
  showRepo: boolean
  /** Colours the dot; null draws none. */
  status: RowStatus | null
  /** True while an agent here is emitting output — drives the label sweep. */
  sweeping: boolean
  onDoubleClick?: (e: React.MouseEvent<HTMLSpanElement>) => void
  title?: string
}

/** The `repo / name  +extra  ●` a workspace row reads as.
 *
 *  Own flex group, so its 6px gap spaces the dot off the name without also
 *  prising the repo, the "/" and the name apart. The sweep class goes on each
 *  segment, never on this wrapper: one `background-clip: text` element paints
 *  everything beneath it from a single gradient, which flattened the repo to
 *  the name's contrast and swallowed the "/". Per segment, each keeps its own
 *  colour as the sweep's base, and `background-attachment: fixed` (theme.css)
 *  is what still makes them read as one band. */
export function WorkspaceRowLabel({ label, showRepo, status, sweeping, onDoubleClick, title }: WorkspaceRowLabelProps): React.JSX.Element {
  const sweep = sweeping ? 'sidebar-label-working' : ''
  return (
    <span
      className="sidebar-row-label"
      style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}
      onDoubleClick={onDoubleClick}
      title={title}
    >
      <span style={sidebarStyles.rowLabelPath}>
        {showRepo && label.repo && (
          <>
            <span className={sweep} style={sidebarStyles.rowRepo}>{label.repo}</span>
            <span className={sweep} style={sidebarStyles.rowRepoSep}>/</span>
          </>
        )}
        <span className={`truncate ${sweep}`.trim()} style={{ minWidth: 0 }}>{label.name}</span>
        {label.extra && <span className="sidebar-row-extra">{label.extra}</span>}
      </span>
      {status && (
        <span
          className={`status-dot status-dot--${status}`}
          role="status"
          aria-label={STATUS_LABEL[status]}
          title={STATUS_LABEL[status]}
        />
      )}
    </span>
  )
}
```

- [ ] **Step 4: Rewire `WorkspaceCard.tsx`**

Imports: add `import { WorkspaceRowLabel } from './WorkspaceRowLabel'` and change the labels import to `import { rowStatus, workspaceRowLabel, type RowStatus } from './agent-labels'`.

Props: replace the `expanded` doc comment and add two props:

```ts
  /** Whether this card shows its folders and drafts — and, on a home card, the
   *  worktree workspaces under its repo. Read from the persisted fold store by
   *  the group that renders it. */
  expanded: boolean
  onToggleExpanded: () => void
  /** A worktree card under its repo's home card: indented, guide line, repo
   *  prefix dropped since the parent said it. */
  nested?: boolean
  /** Shown on a collapsed home card: how many branches hang under it and which
   *  agent states are present among them. */
  summary?: { count: number; statuses: RowStatus[] }
```

Destructure `nested = false, summary` in the function parameters.

Card wrapper className:

```tsx
    <div className={`sidebar-project-group sidebar-project-group--has-agents sidebar-workspace-card${nested ? ' sidebar-workspace-card--nested' : ''}${isActive ? ' sidebar-project-group--active' : ''}`}>
```

Row className:

```tsx
        className={`sidebar-item-row sidebar-project-row${nested ? ' sidebar-item-row--nested' : ''}${isActive ? ' sidebar-item-row--active' : ''}`}
```

Replace the whole `<span className="sidebar-row-label" …> … </span>` block (the `else` branch of `nameDraft !== null`, including the `extra` span Task 2 added and the `isWorking && <span className="status-dot …">` element) with:

```tsx
          <WorkspaceRowLabel
            label={label}
            showRepo={!nested}
            status={rowStatus(sessions)}
            sweeping={isWorking}
            onDoubleClick={(e) => { e.stopPropagation(); if (onRenameWorkspace) setNameDraft(label.name) }}
            title={onRenameWorkspace ? 'Double-click to rename' : undefined}
          />
```

Directly after that (still inside the row, before `<div className="sidebar-item-actions" …>`) add:

```tsx
        {summary && !expanded && summary.count > 0 && (
          <span className="sidebar-group-summary" aria-hidden="true">
            <span className="sidebar-group-count">{summary.count}</span>
            {summary.statuses.map((s) => <span key={s} className={`status-dot status-dot--${s} status-dot--small`} />)}
          </span>
        )}
```

Update the `sweep` const line: `const sweep = …` is no longer used — delete it, keep `isWorking`.

- [ ] **Step 5: CSS**

In `theme.css` after `.status-dot--hidden { … }`:

```css
/* The dot's colour is the agents' state: turquoise running, amber waiting —
   the one state you must notice — ruby error. Running and waiting breathe; an
   error holds still. `done` draws no dot at all. Each sets `--effect-glow` so
   the pulse blooms in its own colour rather than the accent's. */
.status-dot--running {
  --effect-glow: var(--status-running);
  background: var(--status-running);
  animation: core-pulse 2s ease-in-out infinite;
}

.status-dot--waiting {
  --effect-glow: var(--status-waiting);
  background: var(--status-waiting);
  animation: core-pulse 2s ease-in-out infinite;
}

.status-dot--error {
  background: var(--status-error);
}

/* The dots a collapsed group shows for the agents under it. */
.status-dot--small {
  width: 6px;
  height: 6px;
}
```

After the `.sidebar-project-row > .sidebar-item-actions { … }` rule:

```css
/* The repos beyond a workspace's primary, as a quiet trailing note: `+1 kong`
   or `+3`. Never truncates — the name gives first. */
.sidebar-row-extra {
  margin-left: 6px;
  flex-shrink: 0;
  font-size: var(--type-ui-caption);
  color: var(--text-muted);
}

/* A worktree workspace nested under its repo's home card: one 14px step in,
   with a 1px guide down the glyph column so the branches read as hanging off
   the row above. The repo prefix is dropped on these rows — the parent said it. */
.sidebar-item-row--nested {
  padding-left: 22px;
}

.sidebar-item-row--nested::before {
  content: '';
  position: absolute;
  left: 13px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--tree-indent-guide);
}

/* Nested cards stack tight; only the group as a whole keeps the card gap. */
.sidebar-project-group--has-agents.sidebar-workspace-card--nested {
  margin-bottom: 0;
}

/* A nested card's own folder rows step in with it. Margin, not padding: the
   row sets its 16px padding inline, and margin adds to that without fighting it. */
.sidebar-workspace-card--nested .sidebar-repo-row {
  margin-left: 14px;
}

/* Count + state dots on a collapsed home card, right of the label. */
.sidebar-group-summary {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 6px;
  flex-shrink: 0;
}

.sidebar-group-count {
  font-size: var(--type-ui-caption);
  color: var(--text-muted);
  margin-right: 2px;
}
```

In the `@media (prefers-reduced-motion: reduce)` block, extend the first selector: `.status-dot--active, .status-dot--running, .status-dot--waiting { animation: none; }`.

- [ ] **Step 6: Run sidebar tests + typecheck**

Run: `npm test -- src/renderer/components/sidebar && npm run typecheck`
Expected: PASS. The sweep test following the dot tests still passes (sweep is still output-driven).

- [ ] **Step 7: Check LOC**

Run: `wc -l src/renderer/components/sidebar/WorkspaceCard.tsx src/renderer/components/sidebar/WorkspaceRowLabel.tsx`
Expected: both under 300.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/sidebar/WorkspaceRowLabel.tsx src/renderer/components/sidebar/WorkspaceCard.tsx src/renderer/styles/theme.css src/renderer/components/sidebar/ProjectSidebar.test-helpers.tsx src/renderer/components/sidebar/ProjectSidebar.test.tsx
git commit -m "feat(sidebar): status-coloured row dot, nested row styling, label extracted"
```

---

### Task 7: `RepoGroup` rendering + `WorkspaceList` over groups + fold store

**Files:**
- Create: `src/renderer/components/sidebar/RepoGroup.tsx`
- Create: `src/renderer/components/sidebar/RepoGroupHeader.tsx`
- Create: `src/renderer/components/sidebar/MergedFold.tsx`
- Modify: `src/renderer/components/sidebar/WorkspaceList.tsx` (rewrite body)
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx` (hoist recency, merged ids, new props)
- Modify: `src/renderer/styles/theme.css` (merged fold styles)
- Test: `src/renderer/components/sidebar/RepoGroup.test.tsx` (new, via `renderSidebar`)

**Interfaces:**
- Consumes: `groupWorkspaces`, `filterGroups`, `liveWorkspaceIds`, `groupMembers`, `groupStatuses`, `RepoGroup` (Task 4); `useWorkspaceFolds`, `workspaceFoldKey` (Task 3); `useMergedWorkspaces` (Task 5); `WorkspaceCard` `nested`/`summary` (Task 6).
- Produces: `WorkspaceListProps` gains `recency: ProjectRecency`, `touchProject: (id: string) => void`, `mergedIds: ReadonlySet<string>`, `filter: string`. `RepoGroup({ group, folds, filtering, activeWorkspaceId, sessionsFor, draftsFor, card })`. `MergedFold({ count, shown, onToggle })`. `RepoGroupHeader({ name, expanded, onToggle, summary })`.

- [ ] **Step 1: Write the failing tests** — `RepoGroup.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { installElectronApi, installLocalStorage, mockInvoke, renderSidebar, sampleProjects, sampleSessions } from './ProjectSidebar.test-helpers'

beforeEach(() => { vi.clearAllMocks(); installLocalStorage(); installElectronApi() })

const home = { id: 'w-home', name: 'Alpha', projectIds: ['p1'], createdAt: '2024-01-01' }
const wt = (id: string, name: string) =>
  ({ id, name, projectIds: ['p1'], createdAt: '2024-01-01', branchName: `alpha/${name}`, worktreePaths: { p1: `/wt/${id}` } })
const beta = { id: 'w-beta', name: 'beta-space', projectIds: ['p2'], createdAt: '2024-01-02' }

const rowNames = (): string[] =>
  Array.from(document.querySelectorAll('.sidebar-project-row'))
    .map((row) => within(row as HTMLElement).getByRole('button', { name: /^(Expand|Collapse) / }).getAttribute('aria-label')!.replace(/^(Expand|Collapse) /, ''))

describe('repo tree', () => {
  it('nests a repo’s worktrees under its home card, closed until opened', () => {
    renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo'), beta], activeWorkspaceId: null, sessionsByWorkspace: {} })

    expect(rowNames()).toEqual(['Alpha', 'beta-space'])
    fireEvent.click(screen.getByLabelText('Expand Alpha'))
    expect(rowNames()).toEqual(['Alpha', 'oslo', 'beta-space'])
    expect(screen.getByText('oslo').closest('.sidebar-item-row')!.className).toContain('sidebar-item-row--nested')
  })

  // The parent names the repo once; the child must not repeat it.
  it('drops the repo prefix on nested rows', () => {
    renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo')], activeWorkspaceId: 'w-oslo', sessionsByWorkspace: {} })
    const row = screen.getByText('oslo').closest<HTMLElement>('.sidebar-project-row')!
    expect(within(row).queryByText('Alpha')).not.toBeInTheDocument()
  })

  it('opens the group holding the active workspace', () => {
    renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo')], activeWorkspaceId: 'w-oslo', sessionsByWorkspace: {} })
    expect(rowNames()).toEqual(['Alpha', 'oslo'])
  })

  it('remembers folds across a remount', () => {
    const first = renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo')], activeWorkspaceId: null, sessionsByWorkspace: {} })
    fireEvent.click(screen.getByLabelText('Expand Alpha'))
    first.unmount()
    renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo')], activeWorkspaceId: null, sessionsByWorkspace: {} })
    expect(rowNames()).toEqual(['Alpha', 'oslo'])
  })

  it('shows a count and the agents’ states on a collapsed home card', () => {
    renderSidebar({
      workspaces: [home, wt('w-oslo', 'oslo'), wt('w-bergen', 'bergen')],
      activeWorkspaceId: null,
      sessionsByWorkspace: { 'w-oslo': [{ ...sampleSessions[0], status: 'waiting' }] },
    })
    const row = screen.getByText('Alpha').closest<HTMLElement>('.sidebar-project-row')!
    expect(within(row).getByText('2')).toBeInTheDocument()
    expect(row.querySelector('.status-dot--waiting.status-dot--small')).not.toBeNull()
  })

  it('heads a repo that has branches but no home workspace with a muted, unselectable header', () => {
    const onSelectWorkspace = vi.fn()
    renderSidebar({ workspaces: [wt('w-oslo', 'oslo'), beta], activeWorkspaceId: null, sessionsByWorkspace: {}, onSelectWorkspace })
    const header = screen.getByRole('button', { name: 'Expand Alpha' })
    expect(header.className).toContain('sidebar-repo-group-header')
    fireEvent.click(header)
    expect(onSelectWorkspace).not.toHaveBeenCalled()
    expect(rowNames()).toEqual(['oslo', 'beta-space'])
  })

  it('folds merged worktrees behind one row and reveals them on click', async () => {
    mockInvoke.mockImplementation(async (channel: string) => (channel === 'workspace:list-merged' ? ['w-old', 'w-older'] : undefined))
    renderSidebar({
      workspaces: [home, wt('w-oslo', 'oslo'), wt('w-old', 'old'), wt('w-older', 'older')],
      activeWorkspaceId: 'w-home',
      sessionsByWorkspace: {},
    })
    const fold = await screen.findByRole('button', { name: 'Show 2 merged workspaces' })
    expect(rowNames()).toEqual(['Alpha', 'oslo'])
    fireEvent.click(fold)
    expect(rowNames()).toEqual(['Alpha', 'oslo', 'old', 'older'])
    expect(screen.getByRole('button', { name: 'Hide 2 merged workspaces' })).toBeInTheDocument()
  })

  it('never folds a merged workspace that still has a live agent', async () => {
    mockInvoke.mockImplementation(async (channel: string) => (channel === 'workspace:list-merged' ? ['w-old'] : undefined))
    renderSidebar({
      workspaces: [home, wt('w-old', 'old')],
      activeWorkspaceId: 'w-home',
      sessionsByWorkspace: { 'w-old': [{ ...sampleSessions[0], status: 'running' }] },
    })
    await screen.findByText('old')
    expect(screen.queryByRole('button', { name: /merged workspaces/ })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/renderer/components/sidebar/RepoGroup.test.tsx`
Expected: FAIL — worktree rows render flat, no "Expand Alpha" header for the home-less repo, etc.

- [ ] **Step 3: Create `MergedFold.tsx`**

```tsx
import React from 'react'

/** One muted row standing in for a repo's merged worktrees — `14 merged · show`.
 *  Click reveals them in place for this launch; the default is folded again
 *  next time, since a merged branch is done and only occasionally wanted. */
export function MergedFold({ count, shown, onToggle }: { count: number; shown: boolean; onToggle: () => void }): React.JSX.Element {
  const noun = count === 1 ? 'workspace' : 'workspaces'
  return (
    <button
      type="button"
      className="sidebar-merged-fold"
      onClick={onToggle}
      aria-expanded={shown}
      aria-label={`${shown ? 'Hide' : 'Show'} ${count} merged ${noun}`}
    >
      <span className="sidebar-merged-fold__count">{count} merged</span>
      <span aria-hidden="true">· {shown ? 'hide' : 'show'}</span>
    </button>
  )
}
```

- [ ] **Step 4: Create `RepoGroupHeader.tsx`**

```tsx
import React from 'react'
import { sidebarStyles } from './ProjectSidebar.styles'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { FilesChevronGlyph } from './SidebarCardActionGlyphs'
import type { RowStatus } from './agent-labels'

export interface RepoGroupHeaderProps {
  name: string
  expanded: boolean
  onToggle: () => void
  summary: { count: number; statuses: RowStatus[] }
}

/** Heads a repo whose home workspace is gone while its worktree workspaces
 *  remain. It is a fold, not a workspace: muted, toggles on click, selects
 *  nothing, offers no menu. */
export function RepoGroupHeader({ name, expanded, onToggle, summary }: RepoGroupHeaderProps): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
      className="sidebar-item-row sidebar-repo-group-header"
      style={{ ...sidebarStyles.item, color: 'var(--text-muted)' }}
      title={`${name} — repository with no home workspace`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
      }}
    >
      <span className="sidebar-workspace-toggle" aria-hidden="true">
        <span className="sidebar-workspace-toggle__glyph"><WorkspaceGlyph kind="home" /></span>
        <span className="sidebar-workspace-toggle__chevron"><FilesChevronGlyph expanded={expanded} /></span>
      </span>
      <span className="truncate" style={{ minWidth: 0 }}>{name}</span>
      {!expanded && summary.count > 0 && (
        <span className="sidebar-group-summary" aria-hidden="true">
          <span className="sidebar-group-count">{summary.count}</span>
          {summary.statuses.map((s) => <span key={s} className={`status-dot status-dot--${s} status-dot--small`} />)}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create `RepoGroup.tsx`**

```tsx
import React, { useState } from 'react'
import type { AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { WorkspaceCard, type WorkspaceCardProps } from './WorkspaceCard'
import { RepoGroupHeader } from './RepoGroupHeader'
import { MergedFold } from './MergedFold'
import { groupMembers, groupStatuses, type RepoGroup as RepoGroupModel } from './sidebar-groups'
import { workspaceFoldKey } from './sidebar-fold-state'
import type { RowStatus } from './agent-labels'

/** Everything a card needs that is the same for every card in the list. */
export type CardCommonProps = Omit<
  WorkspaceCardProps,
  'workspace' | 'isActive' | 'expanded' | 'onToggleExpanded' | 'sessions' | 'drafts' | 'nested' | 'summary'
>

export interface RepoGroupProps {
  group: RepoGroupModel
  folds: { isOpen: (key: string) => boolean; toggle: (key: string) => void }
  /** Filtering forces the group open; the merged fold is already gone from a
   *  filtered group (filterGroups moves hits inline). */
  filtering: boolean
  activeWorkspaceId: string | null
  sessionsFor: (workspace: Workspace) => AgentSession[]
  draftsFor: (workspace: Workspace) => DraftChat[]
  card: CardCommonProps
}

/** One repo's family: the home card heads it and its disclosure folds the
 *  worktree cards beneath (spec decision 2). A repo with branches but no home
 *  gets a synthetic header instead. Merged branches sit behind `MergedFold`. */
export function RepoGroup({ group, folds, filtering, activeWorkspaceId, sessionsFor, draftsFor, card }: RepoGroupProps): React.JSX.Element {
  const [showMerged, setShowMerged] = useState(false)
  const expanded = filtering || folds.isOpen(group.foldKey)
  const summary = {
    count: group.worktrees.length + group.merged.length,
    statuses: groupStatuses(groupMembers(group).map(sessionsFor)),
  }

  const renderCard = (
    workspace: Workspace,
    nested: boolean,
    cardExpanded: boolean,
    onToggle: () => void,
    cardSummary?: { count: number; statuses: RowStatus[] },
  ): React.JSX.Element => (
    <WorkspaceCard
      key={workspace.id}
      {...card}
      workspace={workspace}
      nested={nested}
      summary={cardSummary}
      isActive={workspace.id === activeWorkspaceId}
      expanded={cardExpanded}
      onToggleExpanded={onToggle}
      sessions={sessionsFor(workspace)}
      drafts={draftsFor(workspace)}
    />
  )

  const renderNested = (workspace: Workspace): React.JSX.Element => {
    const key = workspaceFoldKey(workspace.id)
    return renderCard(workspace, true, filtering || folds.isOpen(key), () => folds.toggle(key))
  }

  return (
    <div className="sidebar-repo-group">
      {group.home
        ? renderCard(group.home, false, expanded, () => folds.toggle(group.foldKey), summary)
        : <RepoGroupHeader name={group.repoName} expanded={expanded} onToggle={() => folds.toggle(group.foldKey)} summary={summary} />}
      {expanded && group.worktrees.map(renderNested)}
      {expanded && group.merged.length > 0 && (
        <>
          <MergedFold count={group.merged.length} shown={showMerged} onToggle={() => setShowMerged((s) => !s)} />
          {showMerged && <div className="sidebar-merged-cards">{group.merged.map(renderNested)}</div>}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Rewrite `WorkspaceList.tsx`**

Replace the file body from the props interface down:

```tsx
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { RepoGroup, type CardCommonProps } from './RepoGroup'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import { useSidebarSectionState } from './sidebar-section-state'
import { useWorkspaceFolds, workspaceFoldKey } from './sidebar-fold-state'
import { filterGroups, groupMembers, groupWorkspaces, liveWorkspaceIds } from './sidebar-groups'
import type { ProjectRecency } from './sidebar-recency'
import type { SidebarSortMode } from './sidebar-sort'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface WorkspaceListProps {
  workspaces: Workspace[]
  projects: Project[]
  /** How the list is ordered. Owned by ProjectSidebar, which renders the toggle. */
  sortMode: SidebarSortMode
  /** Owned by ProjectSidebar so the Working-now section orders by the same clock. */
  recency: ProjectRecency
  touchProject: (workspaceId: string) => void
  /** Worktree workspaces whose branch is merged; folded behind one row per repo. */
  mergedIds: ReadonlySet<string>
  /** Live filter text; blank means no filter. */
  filter: string
  activeWorkspaceId: string | null
  activeProjectId?: string | null
  sessionsByWorkspace: Record<string, AgentSession[]>
  outputtingSessionIds?: Set<string>
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectWorkspace: (id: string) => void
  onRenameWorkspace?: (id: string, name: string) => void
  onRemoveWorkspace: (id: string) => Promise<void>
  onCopyWorkspace?: (id: string) => void
  onSelectRepo?: (workspaceId: string, projectId: string) => void
  onAddProject?: (workspaceId: string) => void | Promise<void>
  onRemoveProject?: (workspaceId: string, projectId: string) => void
  behindCounts?: Record<string, number>
  onProjectFetched?: (projectId: string) => void
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
  /** Renders a folder's file tree under its row while it is open. Injected by
   *  the dock panel so the sidebar stays free of editor/file plumbing. */
  renderFolderFiles?: (source: FolderSource) => React.ReactNode
}

/** The Repositories section: one group per repo, headed by its home workspace
 *  with the worktree workspaces cut off it nested beneath (#939/#940). Every
 *  repo lives in a workspace, so this is still the only list of roots there is. */
export function WorkspaceList({
  workspaces, projects, sortMode, recency, touchProject, mergedIds, filter,
  activeWorkspaceId, activeProjectId, sessionsByWorkspace, outputtingSessionIds,
  drafts, activeDraftId, onSelectWorkspace, onRenameWorkspace, onRemoveWorkspace,
  onCopyWorkspace, onSelectRepo, onAddProject, onRemoveProject, behindCounts,
  onProjectFetched, onSelectDraft, onDiscardDraft, renderFolderFiles,
}: WorkspaceListProps): React.JSX.Element {
  const folds = useWorkspaceFolds()
  const [sectionOpen, toggleSection] = useSidebarSectionState('repositories', true)
  const filtering = filter.trim() !== ''

  const liveIds = useMemo(() => liveWorkspaceIds(sessionsByWorkspace), [sessionsByWorkspace])
  const groups = useMemo(
    () => groupWorkspaces(workspaces, projects, { mode: sortMode, recency, activeId: activeWorkspaceId, mergedIds, liveIds }),
    [workspaces, projects, sortMode, recency, activeWorkspaceId, mergedIds, liveIds],
  )
  const visible = useMemo(() => (filtering ? filterGroups(groups, filter) : groups), [groups, filter, filtering])

  // Entering a workspace leaves the recency trail *and* reveals it: its own
  // card and the group it sits in open, the way an editor reveals a file. Read
  // through a ref so a reorder never re-runs the reveal.
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  useEffect(() => {
    if (!activeWorkspaceId) return
    touchProject(activeWorkspaceId)
    folds.open(workspaceFoldKey(activeWorkspaceId))
    const group = groupsRef.current.find((g) => groupMembers(g).some((w) => w.id === activeWorkspaceId))
    if (group) folds.open(group.foldKey)
  }, [activeWorkspaceId, touchProject, folds.open])

  const handleRemove = useCallback((id: string): void => { void onRemoveWorkspace(id) }, [onRemoveWorkspace])
  const sessionsFor = useCallback((w: Workspace) => sessionsByWorkspace[w.id] ?? [], [sessionsByWorkspace])
  const draftsFor = useCallback((w: Workspace) => drafts.filter((d) => w.projectIds.includes(d.projectId)), [drafts])

  if (workspaces.length === 0) {
    return (
      <div style={sidebarStyles.list}>
        <div style={sidebarStyles.empty}>No repositories yet</div>
      </div>
    )
  }

  const card: CardCommonProps = {
    projects, activeProjectId, outputtingSessionIds, activeDraftId,
    onSelectWorkspace, onRenameWorkspace, onRemoveWorkspace: handleRemove, onCopyWorkspace,
    onSelectRepo, onAddProject, onRemoveProject, behindCounts, onProjectFetched,
    onSelectDraft, onDiscardDraft, renderFolderFiles,
  }

  return (
    <div style={{ paddingTop: 4 }}>
      <SidebarSectionHeader label="Repositories" count={visible.length} expanded={sectionOpen} onToggle={toggleSection} />
      {sectionOpen && filtering && visible.length === 0 && (
        <div style={sidebarStyles.empty}>No matches</div>
      )}
      {sectionOpen && visible.map((group) => (
        <RepoGroup
          key={group.foldKey}
          group={group}
          folds={folds}
          filtering={filtering}
          activeWorkspaceId={activeWorkspaceId}
          sessionsFor={sessionsFor}
          draftsFor={draftsFor}
          card={card}
        />
      ))}
    </div>
  )
}
```

Delete the old `useState`/`expandedId`/`toggleExpanded` code and the `useProjectRecency` import (it moves up).

- [ ] **Step 7: Wire `ProjectSidebar.tsx`**

Add imports:

```ts
import { useProjectRecency } from './sidebar-recency'
import { useMergedWorkspaces } from '../../hooks/project/useMergedWorkspaces'
```

Inside the component, after `useSidebarSortMode()`:

```ts
  const { recency, touchProject } = useProjectRecency()
  const mergedIds = useMergedWorkspaces(workspaces, sessionsByWorkspace ?? {})
```

Pass to `<WorkspaceList … recency={recency} touchProject={touchProject} mergedIds={mergedIds} filter="" />` (Task 9 replaces `filter=""`).

- [ ] **Step 8: CSS for the fold and revealed cards** (theme.css, after the `.sidebar-group-count` rule from Task 6)

```css
/* `14 merged · show`: one quiet row per repo for the branches that are done.
   Indented to the nested glyph column, with the guide ending at its midline so
   it closes the family visually. */
.sidebar-merged-fold {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  margin: 1px 8px;
  padding: 0 8px 0 36px;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: var(--type-ui-caption);
  color: var(--text-muted);
  text-align: left;
  cursor: pointer;
}

.sidebar-merged-fold::before {
  content: '';
  position: absolute;
  left: 13px;
  top: 0;
  bottom: 50%;
  width: 1px;
  background: var(--tree-indent-guide);
}

.sidebar-merged-fold:hover {
  color: var(--text-primary);
}

.sidebar-merged-fold__count {
  color: color-mix(in srgb, var(--accent), transparent 45%);
}

/* Revealed merged cards read as history, not work. */
.sidebar-merged-cards .sidebar-project-row {
  color: var(--text-muted);
}

.sidebar-repo-group-header:hover {
  color: var(--text-secondary);
}
```

- [ ] **Step 9: Run every sidebar test; repair any that assumed a flat list**

Run: `npm test -- src/renderer/components/sidebar`

Expected: `RepoGroup.test.tsx` PASS. If a pre-existing test renders a worktree workspace alongside its repo's home and asserts on the worktree row (e.g. the `glyphOf('moss')` test in `ProjectSidebar.test.tsx` around line 90), the row is now nested under a closed home card. Fix by making that group open before render — either set `activeWorkspaceId` to the worktree's id in the `renderSidebar` overrides, or seed the fold store: `localStorage.setItem('manifold.sidebar.openWorkspaces.v1', JSON.stringify(['workspace:<home id>']))`. Do not change the component.

Then: `npm run typecheck` → exit 0.

- [ ] **Step 10: Check LOC and commit**

Run: `wc -l src/renderer/components/sidebar/WorkspaceList.tsx src/renderer/components/sidebar/RepoGroup.tsx src/renderer/components/sidebar/ProjectSidebar.tsx` — all under 300.

```bash
git add src/renderer/components/sidebar/RepoGroup.tsx src/renderer/components/sidebar/RepoGroupHeader.tsx src/renderer/components/sidebar/MergedFold.tsx src/renderer/components/sidebar/RepoGroup.test.tsx src/renderer/components/sidebar/WorkspaceList.tsx src/renderer/components/sidebar/ProjectSidebar.tsx src/renderer/components/sidebar/ProjectSidebar.test.tsx src/renderer/styles/theme.css
git commit -m "feat(sidebar): group workspaces under their repo's home card with persisted folds and a merged fold"
```

---

### Task 8: "Working now" section + section keys

**Files:**
- Create: `src/renderer/components/sidebar/WorkingNowList.tsx`
- Modify: `src/renderer/components/sidebar/sidebar-section-state.ts:5,21`
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx` (render between Favorites and the list)
- Test: `src/renderer/components/sidebar/WorkingNowList.test.tsx`

**Interfaces:**
- Consumes: `isLive`, `rowStatus`, `workspaceRowLabel` (Task 2); `WorkspaceRowLabel` (Task 6); `WorkspaceGlyph`/`workspaceGlyphKind` (Task 1); `ProjectRecency`.
- Produces: `workingNowRows(workspaces, sessionsByWorkspace, recency): Array<{ workspace: Workspace; status: RowStatus }>`; `WorkingNowList({ workspaces, projects, sessionsByWorkspace, recency, onSelectWorkspace })`; `SidebarSectionKey = 'favorites' | 'workspaces' | 'working' | 'repositories'`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { AgentSession, Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { WorkingNowList, workingNowRows } from './WorkingNowList'

const projects: Project[] = [{ id: 'p1', name: 'kong', path: '/repos/kong', baseBranch: 'main', addedAt: '' }]
const ws = (id: string, name: string): Workspace =>
  ({ id, name, projectIds: ['p1'], createdAt: '', branchName: name, worktreePaths: { p1: `/wt/${id}` } })
const s = (id: string, status: AgentSession['status']): AgentSession =>
  ({ id, projectId: 'p1', runtimeId: 'claude', branchName: 'b', worktreePath: '/', status, pid: 1, additionalDirs: [] })

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined } as unknown as Storage)
})

describe('workingNowRows', () => {
  it('lists live workspaces, waiting first, then most recent', () => {
    const rows = workingNowRows(
      [ws('a', 'a'), ws('b', 'b'), ws('c', 'c'), ws('d', 'd')],
      { a: [s('1', 'running')], b: [s('2', 'done')], c: [s('3', 'waiting')], d: [s('4', 'running')] },
      { a: 100, d: 900 },
    )
    expect(rows.map((r) => [r.workspace.id, r.status])).toEqual([['c', 'waiting'], ['d', 'running'], ['a', 'running']])
  })
})

describe('WorkingNowList', () => {
  it('renders nothing when no agent is alive', () => {
    const { container } = render(
      <WorkingNowList workspaces={[ws('a', 'a')]} projects={projects} sessionsByWorkspace={{ a: [s('1', 'done')] }} recency={{}} onSelectWorkspace={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('names the repo on every row and selects the workspace on click', () => {
    const onSelect = vi.fn()
    render(
      <WorkingNowList workspaces={[ws('a', 'moss')]} projects={projects} sessionsByWorkspace={{ a: [s('1', 'waiting')] }} recency={{}} onSelectWorkspace={onSelect} />,
    )
    expect(screen.getByText('Working now')).toBeInTheDocument()
    expect(screen.getByText('kong')).toBeInTheDocument()
    expect(screen.getByLabelText('An agent is waiting for you in this workspace').className).toContain('status-dot--waiting')
    fireEvent.click(screen.getByText('moss'))
    expect(onSelect).toHaveBeenCalledWith('a')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/renderer/components/sidebar/WorkingNowList.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Section keys**

In `sidebar-section-state.ts` line 5: `export type SidebarSectionKey = 'favorites' | 'workspaces' | 'working' | 'repositories'` and line 21's array: `['favorites', 'workspaces', 'working', 'repositories']`.

- [ ] **Step 4: Create `WorkingNowList.tsx`**

```tsx
import React from 'react'
import type { AgentSession, Project } from '../../../shared/types'
import { workspaceGlyphKind, type Workspace } from '../../../shared/workspace-types'
import { favoritesStyles } from './FavoritesList.styles'
import { sidebarStyles } from './ProjectSidebar.styles'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { WorkspaceRowLabel } from './WorkspaceRowLabel'
import { isLive, rowStatus, workspaceRowLabel, type RowStatus } from './agent-labels'
import type { ProjectRecency } from './sidebar-recency'
import { useSidebarSectionState } from './sidebar-section-state'

export interface WorkingNowRow {
  workspace: Workspace
  status: RowStatus
}

/** Every workspace with a running or waiting agent: waiting first — those need
 *  you — then most recently visited. Computed, never curated. */
export function workingNowRows(
  workspaces: readonly Workspace[],
  sessionsByWorkspace: Record<string, AgentSession[]>,
  recency: ProjectRecency,
): WorkingNowRow[] {
  const rows: WorkingNowRow[] = []
  for (const workspace of workspaces) {
    const sessions = sessionsByWorkspace[workspace.id] ?? []
    if (!isLive(sessions)) continue
    const status = rowStatus(sessions)
    if (status) rows.push({ workspace, status })
  }
  const rank = (r: WorkingNowRow): number => (r.status === 'waiting' ? 0 : 1)
  return rows.sort((a, b) => rank(a) - rank(b) || (recency[b.workspace.id] ?? 0) - (recency[a.workspace.id] ?? 0))
}

export interface WorkingNowListProps {
  workspaces: Workspace[]
  projects: Project[]
  sessionsByWorkspace: Record<string, AgentSession[]>
  recency: ProjectRecency
  onSelectWorkspace: (id: string) => void
}

/** The strip above the tree that says what is alive right now. Flat, so each
 *  row keeps its repo prefix; hidden entirely when nothing is running. */
export function WorkingNowList({ workspaces, projects, sessionsByWorkspace, recency, onSelectWorkspace }: WorkingNowListProps): React.JSX.Element | null {
  const [expanded, toggleExpanded] = useSidebarSectionState('working', true)
  const rows = workingNowRows(workspaces, sessionsByWorkspace, recency)
  if (rows.length === 0) return null

  return (
    <div style={favoritesStyles.section}>
      <SidebarSectionHeader label="Working now" count={rows.length} expanded={expanded} onToggle={toggleExpanded} />
      {expanded && rows.map(({ workspace, status }) => (
        <div
          key={workspace.id}
          role="button"
          tabIndex={0}
          className="sidebar-item-row sidebar-working-row"
          style={sidebarStyles.item}
          title={workspace.name}
          onClick={() => onSelectWorkspace(workspace.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectWorkspace(workspace.id) }
          }}
        >
          <WorkspaceGlyph kind={workspaceGlyphKind(workspace)} />
          <WorkspaceRowLabel label={workspaceRowLabel(workspace, projects)} showRepo status={status} sweeping={false} />
        </div>
      ))}
      <div style={sidebarStyles.sectionDivider} />
    </div>
  )
}
```

- [ ] **Step 5: Mount it in `ProjectSidebar.tsx`**

Import `WorkingNowList` and render between `<FavoritesList />` and `<WorkspaceList …>`:

```tsx
        <WorkingNowList
          workspaces={workspaces}
          projects={projects}
          sessionsByWorkspace={sessionsByWorkspace ?? {}}
          recency={recency}
          onSelectWorkspace={onSelectWorkspace}
        />
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -- src/renderer/components/sidebar && npm run typecheck`
Expected: PASS (defaults are quiet since Task 6, so `getByText('alpha-space')` stays unique).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/sidebar/WorkingNowList.tsx src/renderer/components/sidebar/WorkingNowList.test.tsx src/renderer/components/sidebar/sidebar-section-state.ts src/renderer/components/sidebar/ProjectSidebar.tsx
git commit -m "feat(sidebar): Working now section lists workspaces with live agents, waiting first"
```

---

### Task 9: Toolbar filter

**Files:**
- Modify: `src/renderer/components/sidebar/SidebarCardActionGlyphs.tsx` (add `SearchGlyph`)
- Create: `src/renderer/components/sidebar/SidebarFilterField.tsx`
- Create: `src/renderer/components/sidebar/SidebarFilterField.styles.ts`
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx` (state, button, field, hide sections)
- Test: `src/renderer/components/sidebar/ProjectSidebar.filter.test.tsx`

**Interfaces:**
- Produces: `SearchGlyph()`, `SidebarFilterField({ value, onChange, onClose })`. Toolbar button `aria-label="Filter workspaces"`, `aria-pressed`. Input `aria-label="Filter workspaces"`, placeholder `Filter workspaces`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { installElectronApi, installLocalStorage, renderSidebar, sampleSessions } from './ProjectSidebar.test-helpers'

beforeEach(() => { vi.clearAllMocks(); installLocalStorage(); installElectronApi() })

const home = { id: 'w-home', name: 'Alpha', projectIds: ['p1'], createdAt: '2024-01-01' }
const oslo = { id: 'w-oslo', name: 'oslo', projectIds: ['p1'], createdAt: '2024-01-01', branchName: 'alpha/oslo', worktreePaths: { p1: '/wt/oslo' } }
const beta = { id: 'w-beta', name: 'beta-space', projectIds: ['p2'], createdAt: '2024-01-02' }

const openFilter = (): HTMLInputElement => {
  fireEvent.click(screen.getByRole('button', { name: 'Filter workspaces' }))
  return screen.getByRole('textbox', { name: 'Filter workspaces' })
}

const rowNames = (): string[] =>
  Array.from(document.querySelectorAll('.sidebar-project-row'))
    .map((row) => within(row as HTMLElement).getByRole('button', { name: /^(Expand|Collapse) / }).getAttribute('aria-label')!.replace(/^(Expand|Collapse) /, ''))

describe('sidebar filter', () => {
  it('is closed until the toolbar button opens it', () => {
    renderSidebar({ workspaces: [home, oslo, beta], activeWorkspaceId: null, sessionsByWorkspace: {} })
    expect(screen.queryByRole('textbox', { name: 'Filter workspaces' })).not.toBeInTheDocument()
    const input = openFilter()
    expect(input).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Filter workspaces' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('narrows the tree to hits and forces their groups open', () => {
    renderSidebar({ workspaces: [home, oslo, beta], activeWorkspaceId: null, sessionsByWorkspace: {} })
    fireEvent.change(openFilter(), { target: { value: 'osl' } })
    expect(rowNames()).toEqual(['oslo'])
    expect(screen.getByRole('button', { name: 'Expand Alpha' })).toBeInTheDocument() // synthetic header stands in for the non-matching home
  })

  it('hides Favorites and Working now while filtering', () => {
    renderSidebar(
      { workspaces: [home, oslo, beta], activeWorkspaceId: null, sessionsByWorkspace: { 'w-oslo': [{ ...sampleSessions[0], status: 'running' }] } },
      { favorites: [{ id: 'w-beta', name: 'beta-space', kind: 'home' }], isFavorite: () => true, onToggleFavorite: vi.fn(), onReorderFavorites: vi.fn(), onActivateFavorite: vi.fn() },
    )
    expect(screen.getByText('Favorites')).toBeInTheDocument()
    expect(screen.getByText('Working now')).toBeInTheDocument()
    fireEvent.change(openFilter(), { target: { value: 'beta' } })
    expect(screen.queryByText('Favorites')).not.toBeInTheDocument()
    expect(screen.queryByText('Working now')).not.toBeInTheDocument()
    expect(rowNames()).toEqual(['beta-space'])
  })

  it('says so when nothing matches', () => {
    renderSidebar({ workspaces: [home, beta], activeWorkspaceId: null, sessionsByWorkspace: {} })
    fireEvent.change(openFilter(), { target: { value: 'zzz' } })
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('Escape clears and closes; blur on an empty field closes', () => {
    renderSidebar({ workspaces: [home, beta], activeWorkspaceId: null, sessionsByWorkspace: {} })
    const input = openFilter()
    fireEvent.change(input, { target: { value: 'beta' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'Filter workspaces' })).not.toBeInTheDocument()
    expect(rowNames()).toEqual(['Alpha', 'beta-space'])

    fireEvent.blur(openFilter())
    expect(screen.queryByRole('textbox', { name: 'Filter workspaces' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/renderer/components/sidebar/ProjectSidebar.filter.test.tsx`
Expected: FAIL — no button named "Filter workspaces".

- [ ] **Step 3: Add `SearchGlyph`** to `SidebarCardActionGlyphs.tsx` (before `SortModeGlyph`)

```tsx
/** The toolbar's filter toggle. */
export function SearchGlyph(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </svg>
  )
}
```

- [ ] **Step 4: Create the field and its styles**

`SidebarFilterField.styles.ts`:

```ts
import type React from 'react'

export const filterFieldStyles: Record<string, React.CSSProperties> = {
  // A control, not a row: bordered, on the input surface, one step in from the
  // list edge so it lines up with the rows' glyph column.
  field: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    height: '26px',
    margin: '2px 12px 6px',
    padding: '0 8px',
    border: '1px solid var(--control-border)',
    background: 'var(--control-bg)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
  },
  input: {
    flex: 1,
    minWidth: 0,
    border: 0,
    background: 'transparent',
    color: 'var(--text-primary)',
    font: 'inherit',
    fontSize: 'var(--type-ui-small)',
    outline: 'none',
  },
}
```

`SidebarFilterField.tsx`:

```tsx
import React, { useCallback } from 'react'
import { SearchGlyph } from './SidebarCardActionGlyphs'
import { filterFieldStyles } from './SidebarFilterField.styles'

export interface SidebarFilterFieldProps {
  value: string
  onChange: (value: string) => void
  /** Escape, or leaving an empty field. The owner unmounts the field. */
  onClose: () => void
}

/** The type-to-narrow field under the Workspaces toolbar. Substring over repo,
 *  workspace and branch names (filterGroups); the tree renders only hits, open. */
export function SidebarFilterField({ value, onChange, onClose }: SidebarFilterFieldProps): React.JSX.Element {
  // Stable, so React calls it once on mount; an inline callback would refocus on
  // every keystroke.
  const focusOnMount = useCallback((el: HTMLInputElement | null): void => { el?.focus() }, [])
  return (
    <div style={filterFieldStyles.field}>
      <SearchGlyph />
      <input
        ref={focusOnMount}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter workspaces"
        aria-label="Filter workspaces"
        style={filterFieldStyles.input}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
        }}
        onBlur={() => { if (value.trim() === '') onClose() }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Wire `ProjectSidebar.tsx`**

Imports: `import React, { useState } from 'react'`, `import { SearchGlyph, SortModeGlyph } from './SidebarCardActionGlyphs'`, `import { SidebarFilterField } from './SidebarFilterField'`.

State after the recency hook: `const [filter, setFilter] = useState<string | null>(null)` and `const filtering = (filter ?? '').trim() !== ''`.

Toolbar: before the sort button add

```tsx
          <button
            type="button"
            onClick={() => setFilter((f) => (f === null ? '' : null))}
            className="sidebar-toolbar-button"
            style={sidebarStyles.toolbarButton}
            aria-label="Filter workspaces"
            aria-pressed={filter !== null}
            title="Filter workspaces"
          >
            <SearchGlyph />
          </button>
```

Directly under the toolbar `div`, before the content `div`:

```tsx
      {filter !== null && (
        <SidebarFilterField value={filter} onChange={setFilter} onClose={() => setFilter(null)} />
      )}
```

Content: `{!filtering && <FavoritesList />}`, `{!filtering && <WorkingNowList … />}`, and `filter={filter ?? ''}` on `WorkspaceList`.

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -- src/renderer/components/sidebar && npm run typecheck`
Expected: PASS. (`SidebarSortToggle.test.tsx` finds the sort button by its aria-label, so the added button does not disturb it.)

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/sidebar/SidebarCardActionGlyphs.tsx src/renderer/components/sidebar/SidebarFilterField.tsx src/renderer/components/sidebar/SidebarFilterField.styles.ts src/renderer/components/sidebar/ProjectSidebar.tsx src/renderer/components/sidebar/ProjectSidebar.filter.test.tsx
git commit -m "feat(sidebar): toolbar filter narrows the repo tree to matching workspaces"
```

---

### Task 10: Fixture, screenshot, docs, full verification, PR

**Files:**
- Modify: `src/renderer/components/sidebar/ProjectSidebar.fixture.tsx`
- Modify: `docs/architecture/renderer.md` (frontmatter `updated:`, `:104` paragraph, the Explorer bullet at `:552`)
- Modify: `docs/architecture/ipc.md` (frontmatter `updated:`, `:33` bullet)

- [ ] **Step 1: Extend the fixture to show every new state**

In `ProjectSidebar.fixture.tsx` add after `longRepoWorkspace`:

```ts
// storefront's branches: one open, one merged (folded), plus a repo with
// branches but no home workspace — every shape the tree renders.
const paymentFlow: Workspace = {
  id: 'payment-flow', name: 'payment-flow', projectIds: ['frontend'], createdAt: '2026-07-16',
  branchName: 'storefront/payment-flow', worktreePaths: { frontend: '/worktrees/payment-flow' },
}
const oldCoupons: Workspace = {
  id: 'old-coupons', name: 'coupon-cleanup', projectIds: ['frontend'], createdAt: '2026-07-01',
  branchName: 'storefront/coupon-cleanup', worktreePaths: { frontend: '/worktrees/coupon-cleanup' },
}
const orphanBranch: Workspace = {
  id: 'orphan', name: 'rate-limits', projectIds: ['backend'], createdAt: '2026-07-17',
  branchName: 'commerce-api/rate-limits', worktreePaths: { backend: '/worktrees/rate-limits' },
}
```

Change `docsWorkspace`'s `projectIds` stays; make `workspace` (Checkout redesign) a *home* multi-repo card by leaving it as is (no `worktreePaths`) — it shows the `multi` glyph and `+1 commerce-api`.

Add a waiting session on `paymentFlow`:

```ts
const waitingSession: AgentSession = {
  id: 'session-4', projectId: 'frontend', workspaceId: paymentFlow.id, runtimeId: 'claude',
  branchName: 'storefront/payment-flow', worktreePath: '/worktrees/payment-flow', status: 'waiting', pid: 45, additionalDirs: [],
}
```

Above the `localStorage.setItem` calls, answer the merged channel and open the storefront group:

```ts
// The screenshot harness stubs every channel with []; this fixture needs the
// merged fold to show, so it answers that one channel itself.
const api = (window as unknown as { electronAPI: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } }).electronAPI
;(window as unknown as { electronAPI: unknown }).electronAPI = {
  ...api,
  invoke: (channel: string, ...args: unknown[]) =>
    channel === 'workspace:list-merged' ? Promise.resolve([oldCoupons.id]) : api.invoke(channel, ...args),
}
localStorage.setItem('manifold.sidebar.openWorkspaces.v1', JSON.stringify(['workspace:product-docs']))
```

Update the element: `workspaces={[workspace, docsWorkspace, longRepoWorkspace, paymentFlow, oldCoupons, orphanBranch]}`, `sessionsByWorkspace={{ [workspace.id]: [workspaceSession, inPlaceSession], [docsWorkspace.id]: [docsSession], [paymentFlow.id]: [waitingSession] }}`, and set the wrapper `height: 900`.

Note: `workspace` (Checkout redesign, primary `frontend`) is the home card that heads storefront's branches; `activeWorkspaceId={workspace.id}` opens that group on mount.

- [ ] **Step 2: Screenshot and look**

Run: `npm run screenshot:component ProjectSidebar --theme manifold-dark`
Open the PNG under `screenshots/`. Confirm against the mockup: Favorites absent (no dock state) is fine; **Working now** lists Checkout redesign (running), payment-flow (waiting, amber) and product-docs (waiting); **Repositories** shows Checkout redesign with the `multi` glyph and `+1 commerce-api`, payment-flow nested with a guide line and no `storefront /` prefix, `1 merged · show` under it, `commerce-api` as a muted header with `1` and a chevron, `product-docs` open with its folders, and `billing-retries` collapsed. If the merged fold is missing, the harness installed its stub after the fixture ran — check `docs/architecture/renderer-verification.md` §"fixture convention" for the supported override hook and use that instead.

- [ ] **Step 3: Docs — `renderer.md`**

Set `updated: 2026-09-08` (already). Replace the sentence at `:104` beginning "**A workspace row's glyph says which kind it is.** The list is flat —" with:

> **A workspace row's glyph says which kind it is.** Rows are grouped by repo — a home workspace heads its repo's group and the worktree workspaces cut off it nest beneath (`sidebar/RepoGroup.tsx`, model in `sidebar/sidebar-groups.ts`) — so `WorkspaceGlyph` draws a folder for a **home** workspace, a git branch for a **worktree** one, and two linked frames for a **multi**-repo one (`workspaceGlyphKind`, `shared/workspace-types.ts`), keyed off `projectIds.length` then `isWorktreeWorkspace`, whose marker is `worktreePaths` and not `branchName`.

In the Explorer bullet (`:552`), replace the passage from "The body is a flat list of bordered workspace cards" through "seeds it with the active workspace (`WorkspaceList.tsx:62`, `:66`)." with:

> The body is three sections at most — `FavoritesList`, `WorkingNowList`, and the **Repositories** tree — under a toolbar carrying a filter toggle and the sort toggle. **Working now** (`sidebar/WorkingNowList.tsx`) lists every workspace with a `running` or `waiting` agent, waiting first, and unmounts when empty; its rows and every card's dot take their colour from `rowStatus` (`agent-labels.ts`: waiting > running > error, `done` draws nothing), while the label sweep stays tied to output. **Repositories** is `WorkspaceList` over `groupWorkspaces` (`sidebar-groups.ts`): one `RepoGroup` per primary repo (`projectIds[0]`), headed by the repo's home card — or a muted `RepoGroupHeader` when the home is gone — with worktree cards nested (`nested`: 14px step, indent guide, repo prefix dropped) and merged branches behind a `MergedFold` (`workspace:list-merged`, verdict outcome `merged` only, never a live workspace). Groups order by the active group first then group recency, or A–Z by repo. **Any number of cards may be open, persisted** in `manifold.sidebar.openWorkspaces.v1` (`sidebar-fold-state.ts`, #902); a home card's disclosure folds the whole group, and entering a workspace opens its card and its group. The toolbar's filter (`SidebarFilterField`) narrows the tree to substring hits on repo, workspace and branch, forces hit groups open, and hides Favorites and Working now while active.

Also update the `WorkspaceCard.tsx:108`/`:196`/`:206` and `theme.css` line references in that bullet to the new locations (`WorkspaceRowLabel.tsx`) — run `git grep -n "sidebar-label-working" src/renderer` and cite what it prints.

- [ ] **Step 4: Docs — `ipc.md`**

Set `updated: 2026-09-08`. Append to the `workspace-handlers.ts` bullet at `:33`:

> …; and `workspace:list-merged`, which returns the ids of worktree workspaces whose primary repo + `branchName` matches a `VerdictRecord` with `outcome === 'merged'` (`verdictStore.listAll()`), the sidebar's source for its merged fold — only the recorder's activity-gated outcome counts, so an empty branch never reports merged.

- [ ] **Step 5: Wiki lint, full suite, typecheck**

```bash
bash scripts/wiki-lint.sh
npm test > /tmp/sidebar-tree-test.log 2>&1; echo "exit $?"; tail -20 /tmp/sidebar-tree-test.log
npm run typecheck
```

Expected: lint clean; test exit 0; typecheck exit 0. If `npm test` reports "Could not locate the bindings file" failures in `src/main/memory/*`, a second `npm test` was running concurrently — rerun alone.

- [ ] **Step 6: Drive the built app for the relaunch check**

```bash
npm run build && npm run drive:app
```

In the driven app: open a repo group, quit, relaunch, confirm the group is still open and the Working now section reflects a started agent. (See `docs/architecture/renderer-verification.md` for the driver's profile isolation; it needs `CFFIXED_USER_HOME`.)

- [ ] **Step 7: Commit and open the PR**

```bash
git add src/renderer/components/sidebar/ProjectSidebar.fixture.tsx docs/architecture/renderer.md docs/architecture/ipc.md
git commit -m "docs(sidebar): fixture for the repo tree; renderer + ipc pages track the new sidebar"
git push -u origin sidebar-repo-tree-live-strip-spec
gh pr create --base main --title "feat(sidebar): repo tree with live strip, merged fold and filter" --body "$(cat <<'EOF'
## Summary
- Groups workspaces under their repo's home card; worktree workspaces nest beneath with the prefix dropped; persisted multi-open folds (closes #902)
- Working now section: workspaces with running/waiting agents, waiting first; row dots now status-coloured
- Merged worktrees fold behind one row per repo via new `workspace:list-merged` (verdict `merged` outcome only)
- Toolbar filter over repo/workspace/branch names
- Multi-repo glyph + `+1 <repo>` sub-label

Closes #939, closes #940, closes #902.

Spec: docs/superpowers/specs/2026-09-08-sidebar-repo-tree-live-strip-design.md
Plan: docs/superpowers/plans/2026-09-08-sidebar-repo-tree-live-strip.md

## Verification
- `npm test` green, `npm run typecheck` green, `bash scripts/wiki-lint.sh` clean
- `npm run screenshot:component ProjectSidebar --theme manifold-dark` compared against the mockup
- Built app driven: folds survive relaunch

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review against the spec

- Decisions 1, 4, 5 → Task 4. Decision 2, 3 → Task 7 (`RepoGroup`, `RepoGroupHeader`). Decision 6 → Tasks 3, 7. Decision 7 → Tasks 6, 7 (`nested`). Decision 8 → Tasks 1, 2. Decision 9 → Task 8. Decision 10 → Task 6. Decisions 11, 12 → Tasks 4, 5, 7. Decision 13 → Task 9. Decision 14 → Tasks 7, 8 (`repositories`/`working` keys, `withAgents` removed). Decision 15 → Task 1 (favorites glyph). Decision 16 → Task 7 (empty state kept).
- Error handling: fold-store fallback (Task 3), IPC failure → empty set (Task 5), unknown primary → own group (Task 4), "No matches" (Task 7).
- Testing list in the spec: every named test file appears in a task; `workspace-handlers.test.ts` is the new main test.
- Docs: Task 10.
- Type consistency: `RowStatus` (Task 2) is used by `groupStatuses`, `WorkspaceRowLabel`, `WorkspaceCard.summary`, `RepoGroupHeader`, `WorkingNowRow`; `RepoGroup.foldKey`/`groupMembers` used by `WorkspaceList`; `useWorkspaceFolds` returns `{ isOpen, toggle, open }` and `RepoGroup` takes the `{ isOpen, toggle }` subset.
