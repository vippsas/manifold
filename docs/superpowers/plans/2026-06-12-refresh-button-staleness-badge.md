# "Behind origin" Badge on the Refresh Button — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a small count badge (and a state-aware tooltip) on the sidebar repository card's refresh button when the project's base branch has fallen behind `origin`, so developers know to fetch before starting a new agent — with zero friction when up to date.

**Architecture:** A read-only background probe (`git fetch origin <base>` → `git rev-list --count <base>..FETCH_HEAD`, never moves the local branch) runs for the **active** project on launch and on window focus (throttled 3 min). Its count flows App → dock state → ProjectSidebar → ProjectList → ProjectItem, which renders the badge + tooltip on the existing `↻` button. Only the active project card has a refresh button, so only the active project is probed. A successful manual fetch zeroes the badge immediately.

**Tech Stack:** Electron main (Node `execFile` git), TypeScript IPC, React renderer hooks, Vitest + @testing-library/react.

---

## File structure

**Main process**
- `src/main/git/git-operations.ts` — add `getRemoteBehindCount` (read-only probe)
- `src/main/ipc/git-handlers.ts` — add `git:staleness` handler
- `src/preload/index.ts` — allowlist `'git:staleness'`

**Renderer**
- `src/renderer/hooks/useBranchStaleness.ts` — **new** hook (active-project probe + throttle + markFresh)
- `src/renderer/components/sidebar/ProjectItem.tsx` — badge + state-aware tooltip
- `src/renderer/components/sidebar/ProjectSidebar.styles.ts` — `fetchBadge` style
- Plumbing (one line each): `dock-panel-types.ts`, `dock-panels.tsx`, `ProjectSidebar.tsx`, `ProjectList.tsx`, `App.tsx`

**Docs**
- Architecture page(s) `covers:`-bound to the touched code (git-operations + sidebar/renderer)

---

## Task 1: Main — `getRemoteBehindCount` read-only probe

**Files:**
- Modify: `src/main/git/git-operations.ts` (add method after `getAheadBehind`, ~`:108`)
- Test: `src/main/git/git-operations-history.test.ts` (next to the `fetchAndUpdate` describe)

- [ ] **Step 1: Write the failing test**

Add this `describe` block inside the top-level `describe('GitOperationsManager ...')` in `src/main/git/git-operations-history.test.ts` (mirrors the existing `fetchAndUpdate` mock style — `mockExecFileAsync` is already set up in this file):

```ts
  describe('getRemoteBehindCount', () => {
    it('fetches the base branch and counts commits behind FETCH_HEAD', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: '', stderr: '' })   // git fetch origin main
        .mockResolvedValueOnce({ stdout: '3\n', stderr: '' }) // git rev-list --count main..FETCH_HEAD

      const result = await git.getRemoteBehindCount('/project', 'main')

      expect(result).toBe(3)
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        1, 'git', ['fetch', 'origin', 'main'], { cwd: '/project' },
      )
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        2, 'git', ['rev-list', '--count', 'main..FETCH_HEAD'], { cwd: '/project' },
      )
    })

    it('returns 0 when the fetch fails (offline / no origin)', async () => {
      mockExecFileAsync.mockRejectedValueOnce(new Error('could not read from remote'))

      const result = await git.getRemoteBehindCount('/project', 'main')

      expect(result).toBe(0)
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/main/git/git-operations-history.test.ts -t getRemoteBehindCount`
Expected: FAIL — `git.getRemoteBehindCount is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/main/git/git-operations.ts`, add this method immediately after the closing brace of `getAheadBehind` (the method ending near `:108`):

```ts
  async getRemoteBehindCount(projectPath: string, baseBranch: string): Promise<number> {
    try {
      // Read-only: updates FETCH_HEAD (and origin/<base>), never the local branch.
      await execFileAsync('git', ['fetch', 'origin', baseBranch], { cwd: projectPath })
      const { stdout } = await execFileAsync(
        'git', ['rev-list', '--count', `${baseBranch}..FETCH_HEAD`], { cwd: projectPath }
      )
      return parseInt(stdout.trim(), 10) || 0
    } catch {
      // Background probe: any failure (offline, no origin, missing branch) means "unknown" → no badge.
      return 0
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/main/git/git-operations-history.test.ts -t getRemoteBehindCount`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/git/git-operations.ts src/main/git/git-operations-history.test.ts
git commit -m "feat(git): add read-only getRemoteBehindCount probe"
```

---

## Task 2: Main — `git:staleness` IPC handler + preload allowlist

**Files:**
- Modify: `src/main/ipc/git-handlers.ts` (inside `registerGitHandlers`, after the `git:fetch` handler `:99-104`)
- Modify: `src/preload/index.ts` (after `'git:fetch',` `:77`)
- Test: `src/main/ipc/git-handlers.test.ts`

- [ ] **Step 1: Write the failing test**

Append this `describe` block to `src/main/ipc/git-handlers.test.ts` (uses the existing `mocks.handlers` capture harness at the top of the file):

```ts
describe('registerGitHandlers git:staleness', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('returns the behind count for a git project', async () => {
    const { registerGitHandlers } = await import('./git-handlers')
    const getRemoteBehindCount = vi.fn(async () => 3)
    registerGitHandlers({
      gitOps: { getRemoteBehindCount },
      sessionManager: {},
      projectRegistry: {
        getProject: vi.fn(() => ({ id: 'p1', path: '/p1', baseBranch: 'main', kind: 'git' })),
      },
    } as never)

    const handler = mocks.handlers.get('git:staleness')!
    const result = await handler({}, 'p1')

    expect(result).toEqual({ baseBranch: 'main', behindCount: 3 })
    expect(getRemoteBehindCount).toHaveBeenCalledWith('/p1', 'main')
  })

  it('returns 0 for a non-git project without probing', async () => {
    const { registerGitHandlers } = await import('./git-handlers')
    const getRemoteBehindCount = vi.fn()
    registerGitHandlers({
      gitOps: { getRemoteBehindCount },
      sessionManager: {},
      projectRegistry: {
        getProject: vi.fn(() => ({ id: 'p1', path: '/p1', baseBranch: 'main', kind: 'folder' })),
      },
    } as never)

    const handler = mocks.handlers.get('git:staleness')!
    const result = await handler({}, 'p1')

    expect(result).toEqual({ baseBranch: '', behindCount: 0 })
    expect(getRemoteBehindCount).not.toHaveBeenCalled()
  })

  it('throws when the project is missing', async () => {
    const { registerGitHandlers } = await import('./git-handlers')
    registerGitHandlers({
      gitOps: { getRemoteBehindCount: vi.fn() },
      sessionManager: {},
      projectRegistry: { getProject: vi.fn(() => undefined) },
    } as never)

    const handler = mocks.handlers.get('git:staleness')!
    await expect(handler({}, 'nope')).rejects.toThrow('Project not found: nope')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/main/ipc/git-handlers.test.ts -t "git:staleness"`
Expected: FAIL — handler `git:staleness` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/main/ipc/git-handlers.ts`, inside `registerGitHandlers`, add this handler immediately after the `git:fetch` handler (after `:104`, before the function's closing `}`):

```ts
  ipcMain.handle('git:staleness', async (_event, projectId: string): Promise<{ baseBranch: string; behindCount: number }> => {
    const project = projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    if (!isGitProject(project)) return { baseBranch: '', behindCount: 0 }
    const behindCount = await gitOps.getRemoteBehindCount(project.path, project.baseBranch)
    return { baseBranch: project.baseBranch, behindCount }
  })
```

(`isGitProject` and `gitOps`/`projectRegistry` are already imported/destructured at the top of this function.)

- [ ] **Step 4: Add the preload allowlist entry**

In `src/preload/index.ts`, add a line immediately after `'git:fetch',` (`:77`):

```ts
  'git:staleness',
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/main/ipc/git-handlers.test.ts -t "git:staleness"`
Expected: PASS (all three cases).

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/git-handlers.ts src/main/ipc/git-handlers.test.ts src/preload/index.ts
git commit -m "feat(git): add git:staleness IPC handler"
```

---

## Task 3: Renderer — `useBranchStaleness` hook

**Files:**
- Create: `src/renderer/hooks/useBranchStaleness.ts`
- Test: `src/renderer/hooks/useBranchStaleness.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/hooks/useBranchStaleness.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBranchStaleness } from './useBranchStaleness'
import type { Project } from '../../shared/types'

const mockInvoke = vi.fn()
const gitProject = { id: 'p1', name: 'P1', path: '/p1', baseBranch: 'main', kind: 'git' } as unknown as Project
const folderProject = { id: 'p2', name: 'P2', path: '/p2', baseBranch: 'main', kind: 'folder' } as unknown as Project

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue({ baseBranch: 'main', behindCount: 3 })
  ;(window as unknown as { electronAPI: { invoke: typeof mockInvoke } }).electronAPI = { invoke: mockInvoke }
})

describe('useBranchStaleness', () => {
  it('probes the active git project on mount and exposes its behind count', async () => {
    const { result } = renderHook(() => useBranchStaleness('p1', [gitProject]))
    await waitFor(() => expect(result.current.behindCounts.p1).toBe(3))
    expect(mockInvoke).toHaveBeenCalledWith('git:staleness', 'p1')
  })

  it('does not probe a non-git active project', async () => {
    renderHook(() => useBranchStaleness('p2', [folderProject]))
    await act(async () => { await Promise.resolve() })
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('throttles a repeat probe when the window refocuses within the window', async () => {
    renderHook(() => useBranchStaleness('p1', [gitProject]))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1))
    act(() => { window.dispatchEvent(new Event('focus')) })
    await act(async () => { await Promise.resolve() })
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('markFresh zeroes a project count', async () => {
    const { result } = renderHook(() => useBranchStaleness('p1', [gitProject]))
    await waitFor(() => expect(result.current.behindCounts.p1).toBe(3))
    act(() => { result.current.markFresh('p1') })
    expect(result.current.behindCounts.p1).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/hooks/useBranchStaleness.test.ts`
Expected: FAIL — cannot find module `./useBranchStaleness`.

- [ ] **Step 3: Write minimal implementation**

Create `src/renderer/hooks/useBranchStaleness.ts`:

```ts
import { useState, useEffect, useRef, useCallback } from 'react'
import type { Project } from '../../shared/types'
import { isGitProject } from '../../shared/project-kind'

const STALENESS_THROTTLE_MS = 3 * 60 * 1000

interface UseBranchStalenessResult {
  behindCounts: Record<string, number>
  markFresh: (projectId: string) => void
}

/**
 * Tracks how many commits the active project's base branch is behind origin,
 * via a read-only background probe (git:staleness) on launch and window focus,
 * throttled per project. Only the active project has a refresh button, so only
 * the active project is probed. Probe failures never surface in the UI.
 */
export function useBranchStaleness(
  activeProjectId: string | null,
  projects: Project[],
): UseBranchStalenessResult {
  const [behindCounts, setBehindCounts] = useState<Record<string, number>>({})
  const lastCheckedRef = useRef<Record<string, number>>({})
  const projectsRef = useRef(projects)
  projectsRef.current = projects

  const probe = useCallback(async (projectId: string): Promise<void> => {
    const project = projectsRef.current.find((p) => p.id === projectId)
    if (!project || !isGitProject(project)) return
    const now = Date.now()
    if (now - (lastCheckedRef.current[projectId] ?? 0) < STALENESS_THROTTLE_MS) return
    lastCheckedRef.current[projectId] = now
    try {
      const result = await window.electronAPI.invoke('git:staleness', projectId) as { behindCount: number }
      setBehindCounts((prev) => ({ ...prev, [projectId]: result.behindCount }))
    } catch {
      // Background probe: never surface failures in the UI.
    }
  }, [])

  // Probe on launch and whenever the active project changes.
  useEffect(() => {
    if (activeProjectId) void probe(activeProjectId)
  }, [activeProjectId, probe])

  // Re-probe the active project when the window regains focus (throttled inside probe).
  useEffect(() => {
    const onFocus = (): void => { if (activeProjectId) void probe(activeProjectId) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [activeProjectId, probe])

  const markFresh = useCallback((projectId: string): void => {
    lastCheckedRef.current[projectId] = Date.now()
    setBehindCounts((prev) => ({ ...prev, [projectId]: 0 }))
  }, [])

  return { behindCounts, markFresh }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/renderer/hooks/useBranchStaleness.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useBranchStaleness.ts src/renderer/hooks/useBranchStaleness.test.ts
git commit -m "feat(sidebar): add useBranchStaleness hook"
```

---

## Task 4: Renderer — badge + tooltip on ProjectItem

**Files:**
- Modify: `src/renderer/components/sidebar/ProjectSidebar.styles.ts` (add `fetchBadge` after `removeButton`, ~`:53`)
- Modify: `src/renderer/components/sidebar/ProjectItem.tsx`
- Test: `src/renderer/components/sidebar/ProjectItem.test.tsx` (**new**)

- [ ] **Step 0: Confirm the badge color token with the design system**

Invoke the `design` skill. The badge must read as an *attention* cue and must be **visually distinct from the gold favorite star**. Pick the project's existing attention/accent token (the implementation below uses `var(--accent)` as a working default — replace it with the token the design skill specifies if different). Do not introduce a new global token without the design skill's guidance.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/sidebar/ProjectItem.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectItem } from './ProjectItem'
import type { Project } from '../../../shared/types'

const gitProject = { id: 'p1', name: 'MANIFOLD', path: '/p1', baseBranch: 'main', kind: 'git' } as unknown as Project

const baseProps = {
  project: gitProject,
  isActive: true,
  onSelect: vi.fn(),
  onRemove: vi.fn(),
  isFetching: false,
  fetchResult: null,
  fetchError: null,
  onFetch: vi.fn(),
}

describe('ProjectItem fetch badge', () => {
  it('shows no badge and the default tooltip when up to date', () => {
    render(<ProjectItem {...baseProps} behindCount={0} />)
    const btn = screen.getByRole('button', { name: 'Fetch MANIFOLD' })
    expect(btn).toHaveAttribute('title', 'Fetch latest from remote')
    expect(btn.textContent).not.toMatch(/\d/)
  })

  it('shows the behind count and an explanatory tooltip when behind', () => {
    render(<ProjectItem {...baseProps} behindCount={3} />)
    const btn = screen.getByRole('button', { name: 'Fetch MANIFOLD (3 behind origin)' })
    expect(btn.textContent).toContain('3')
    expect(btn.getAttribute('title')).toBe(
      'main is 3 commits behind origin — fetch before starting a new agent'
    )
  })

  it('uses singular wording for 1 commit', () => {
    render(<ProjectItem {...baseProps} behindCount={1} />)
    const btn = screen.getByRole('button', { name: 'Fetch MANIFOLD (1 behind origin)' })
    expect(btn.getAttribute('title')).toBe(
      'main is 1 commit behind origin — fetch before starting a new agent'
    )
  })

  it('caps the badge at 9+', () => {
    render(<ProjectItem {...baseProps} behindCount={42} />)
    expect(screen.getByText('9+')).toBeInTheDocument()
  })

  it('hides the badge while fetching', () => {
    render(<ProjectItem {...baseProps} behindCount={3} isFetching />)
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/components/sidebar/ProjectItem.test.tsx`
Expected: FAIL — `behindCount` not rendered; default-tooltip test may pass but the count/badge tests fail.

- [ ] **Step 3: Add the badge style**

In `src/renderer/components/sidebar/ProjectSidebar.styles.ts`, add this entry immediately after the `removeButton` block (after `:53`):

```ts
  fetchBadge: {
    position: 'absolute' as const,
    top: '-3px',
    right: '-5px',
    minWidth: '13px',
    height: '13px',
    padding: '0 3px',
    borderRadius: '7px',
    background: 'var(--accent)',
    color: 'var(--bg-base)',
    fontSize: '9px',
    fontWeight: 700,
    lineHeight: '13px',
    textAlign: 'center' as const,
    boxSizing: 'border-box' as const,
    pointerEvents: 'none' as const,
  },
```

- [ ] **Step 4: Wire the badge + tooltip into ProjectItem**

In `src/renderer/components/sidebar/ProjectItem.tsx`:

(a) Add to `ProjectItemProps` (after `onFetch: () => void` `:15`):

```ts
  behindCount?: number
```

(b) Add to the destructure (after `onFetch,` `:27`):

```ts
  behindCount,
```

(c) Add derived values just before the `return (` (after `:90`):

```ts
  const behind = behindCount ?? 0
  const fetchTitle = behind > 0
    ? `${project.baseBranch} is ${behind} commit${behind === 1 ? '' : 's'} behind origin — fetch before starting a new agent`
    : 'Fetch latest from remote'
  const fetchAriaLabel = behind > 0
    ? `Fetch ${project.name} (${behind} behind origin)`
    : `Fetch ${project.name}`
```

(d) Replace the fetch `<button>` block (`:126-138`) with:

```tsx
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onFetch() }}
              onKeyDown={stopKeyPropagation}
              className="sidebar-icon-button"
              style={{ ...sidebarStyles.removeButton, position: 'relative' }}
              aria-label={fetchAriaLabel}
              title={fetchTitle}
              disabled={isFetching}
            >
              {isFetching ? '...' : '↻'}
              {!isFetching && behind > 0 && (
                <span style={sidebarStyles.fetchBadge}>{behind > 9 ? '9+' : behind}</span>
              )}
            </button>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/renderer/components/sidebar/ProjectItem.test.tsx`
Expected: PASS (all five cases).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/sidebar/ProjectItem.tsx src/renderer/components/sidebar/ProjectItem.test.tsx src/renderer/components/sidebar/ProjectSidebar.styles.ts
git commit -m "feat(sidebar): behind-origin badge + state-aware tooltip on refresh button"
```

---

## Task 5: Renderer — plumb `activeProjectBehindCount` and wire App

**Files:**
- Modify: `src/renderer/components/editor/dock-panel-types.ts` (after `onFetchProject` `:105`)
- Modify: `src/renderer/components/editor/dock-panels.tsx` (after `onFetchProject={s.onFetchProject}` `:165`)
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx` (interface `:38`, destructure `:73`, ProjectList pass-through `:137`)
- Modify: `src/renderer/components/sidebar/ProjectList.tsx` (interface `:33`, destructure `:58`, ProjectItem pass-through `:124`)
- Modify: `src/renderer/App.tsx` (import `:12`, hook `:140`, `handleFetchSuccess` `:142`, state object `:340`)
- Test: `src/renderer/components/sidebar/ProjectSidebar.test.tsx` (integration assertion)

- [ ] **Step 1: Write the failing integration test**

Add to `src/renderer/components/sidebar/ProjectSidebar.test.tsx` inside `describe('ProjectSidebar', ...)`:

```tsx
  it('renders the behind-origin badge on the active project fetch button', () => {
    renderSidebar({
      projects: [{ id: 'p1', name: 'Alpha', path: '/a', baseBranch: 'main', kind: 'git' }],
      activeProjectId: 'p1',
      allProjectSessions: { p1: [] },
      activeSessionId: null,
      activeProjectBehindCount: 3,
    })
    const btn = screen.getByRole('button', { name: /Fetch Alpha \(3 behind origin\)/ })
    expect(btn.textContent).toContain('3')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/components/sidebar/ProjectSidebar.test.tsx -t "behind-origin badge"`
Expected: FAIL — `activeProjectBehindCount` isn't threaded, so the button name is `Fetch Alpha` and no `3` appears.

- [ ] **Step 3: Thread the prop through the type + dock panel**

In `src/renderer/components/editor/dock-panel-types.ts`, after `onFetchProject: (projectId: string) => void` (`:105`):

```ts
  activeProjectBehindCount?: number
```

In `src/renderer/components/editor/dock-panels.tsx`, after `onFetchProject={s.onFetchProject}` (`:165`):

```tsx
      activeProjectBehindCount={s.activeProjectBehindCount}
```

- [ ] **Step 4: Thread through ProjectSidebar**

In `src/renderer/components/sidebar/ProjectSidebar.tsx`:

(a) Interface, after `onFetchProject: (projectId: string) => void` (`:38`):

```ts
  activeProjectBehindCount?: number
```

(b) Destructure, after `onFetchProject,` (`:73`):

```ts
  activeProjectBehindCount,
```

(c) On the `<ProjectList>` element, after `onFetchProject={onFetchProject}` (`:137`):

```tsx
        activeProjectBehindCount={activeProjectBehindCount}
```

- [ ] **Step 5: Thread through ProjectList**

In `src/renderer/components/sidebar/ProjectList.tsx`:

(a) `ProjectListProps`, after `onFetchProject: (projectId: string) => void` (`:33`):

```ts
  activeProjectBehindCount?: number
```

(b) Destructure, after `onFetchProject,` (`:58`):

```ts
  activeProjectBehindCount,
```

(c) On the `<ProjectItem>` inside `renderActiveProjectCard`, after `onFetch={() => onFetchProject(project.id)}` (`:124`):

```tsx
          behindCount={activeProjectBehindCount}
```

- [ ] **Step 6: Wire the hook in App**

In `src/renderer/App.tsx`:

(a) Add the import near `:12` (next to `useFetchProject`):

```ts
import { useBranchStaleness } from './hooks/useBranchStaleness'
```

(b) Instantiate the hook immediately before `handleFetchSuccess` (before `:142`):

```ts
  const branchStaleness = useBranchStaleness(activeProjectId, projects)
```

(c) Update `handleFetchSuccess` (`:142-147`) to zero the badge on manual fetch — add the first line and the dep:

```ts
  const handleFetchSuccess = useCallback((projectId: string) => {
    branchStaleness.markFresh(projectId)
    for (const session of sessionsByProject[projectId] ?? []) {
      void window.electronAPI.invoke('git:ahead-behind', session.id).catch(() => {})
    }
    void gitOps.refreshAheadBehind()
  }, [sessionsByProject, gitOps.refreshAheadBehind, branchStaleness.markFresh])
```

(d) Add to the dock state object, after `onFetchProject: fetchProject.fetchProject,` (`:340`):

```ts
    activeProjectBehindCount: activeProjectId ? (branchStaleness.behindCounts[activeProjectId] ?? 0) : 0,
```

- [ ] **Step 7: Run the integration test + typecheck**

Run: `npm test -- src/renderer/components/sidebar/ProjectSidebar.test.tsx`
Expected: PASS (new assertion + existing tests).

Run: `npm run typecheck:web`
Expected: 0 errors (this is a green gate per project convention).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/editor/dock-panel-types.ts src/renderer/components/editor/dock-panels.tsx src/renderer/components/sidebar/ProjectSidebar.tsx src/renderer/components/sidebar/ProjectList.tsx src/renderer/App.tsx src/renderer/components/sidebar/ProjectSidebar.test.tsx
git commit -m "feat(sidebar): wire active-project behind count into the refresh badge"
```

---

## Task 6: Docs wiki sync + full verification

**Files:**
- Modify: architecture page(s) whose `covers:` includes the touched code

- [ ] **Step 1: Find the covering pages**

Run: `bash scripts/wiki-lint.sh`
Then locate pages binding the touched code:

Run: `git grep -l "covers:" docs/architecture | xargs grep -lE "git-operations|sidebar|renderer" `
Expected: at least the renderer/sidebar page (references `useFetchProject`) and a git-operations page.

- [ ] **Step 2: Update the covering page(s)**

In each covering page, add a sentence describing the new behavior and cite `file:line`:
- `getRemoteBehindCount` (`src/main/git/git-operations.ts`) — read-only probe, never moves the local branch.
- `git:staleness` IPC (`src/main/ipc/git-handlers.ts`).
- `useBranchStaleness` (`src/renderer/hooks/useBranchStaleness.ts`) — launch + focus, 3-min throttle, active project only.
- The refresh button badge + state-aware tooltip (`src/renderer/components/sidebar/ProjectItem.tsx`).

Bump each edited page's `updated:` frontmatter date to `2026-06-12`.

- [ ] **Step 3: Verify docs are in sync**

Run: `bash scripts/wiki-lint.sh`
Expected: no drift reported for the edited pages.

- [ ] **Step 4: Full verification**

Follow the `testing` skill to run the suite (it handles the `better-sqlite3` ABI rebuild):

Run: `npm test`
Expected: full suite green (modulo the known worktree-symlink vitest `?url` editor-suite failures noted in project memory, which are local-only).

Run: `npm run typecheck:web`
Expected: 0 errors.

Run: `npm run typecheck:node`
Expected: no NEW errors beyond the project's existing baseline (~10).

Run: `npm run lint`
Expected: clean for the touched files.

- [ ] **Step 5: Commit docs**

```bash
git add docs/architecture
git commit -m "docs(wiki): cover behind-origin staleness badge"
```

---

## Self-review notes (coverage vs spec)

- Read-only probe (no local-branch move) → Task 1 (`getRemoteBehindCount`, FETCH_HEAD count).
- `git:staleness` IPC, non-git/missing guards, silent failure → Task 2.
- Launch + focus, 3-min throttle, active-project-only, markFresh-on-fetch → Task 3 + Task 5 step 6c/6d.
- Badge (exact count, `9+` cap, hidden while fetching) + state-aware tooltip → Task 4.
- "Card button only" (no New Agent / WorkspaceList change) → respected; WorkspaceListʼs own refresh button is intentionally untouched.
- Preload allowlist → Task 2 step 4.
- Wiki sync → Task 6.

## Out of scope

WorkspaceList refresh buttons, New Agent cue, periodic timer fetch, non-active project badges, auto-fast-forward.
