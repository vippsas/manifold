# Git Fetch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an on-demand "Fetch" button per project in the sidebar that fetches from origin, fast-forwards the local base branch, and refreshes ahead/behind counts for all active sessions.

**Architecture:** New `fetchAndUpdate()` method in `GitOperationsManager`, wired via a `git:fetch` IPC channel. The renderer gets a `useFetchProject` hook and a fetch button in `ProjectSidebar`. After success, all sessions in that project refresh their ahead/behind counts.

**Tech Stack:** Electron IPC, Node.js `child_process`, React hooks, vitest

---

### Task 1: Add `FetchResult` type

**Files:**
- Modify: `src/shared/types.ts`

**Step 1: Add the type**

Add at the end of `src/shared/types.ts`, after the `AheadBehind` interface:

```ts
export interface FetchResult {
  updatedBranch: string
  previousRef: string
  currentRef: string
  commitCount: number
}
```

**Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors)

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add FetchResult type for git fetch feature"
```

---

### Task 2: Write failing tests for `fetchAndUpdate()`

**Files:**
- Modify: `src/main/git-operations.test.ts`

**Step 1: Write the failing tests**

Add this new `describe` block at the end of the `GitOperationsManager` describe block in `src/main/git-operations.test.ts`, after the `getPRContext` describe:

```ts
  // ---- fetchAndUpdate ----

  describe('fetchAndUpdate', () => {
    it('fetches origin and fast-forwards local base branch', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' }) // rev-parse before
        .mockResolvedValueOnce({ stdout: '', stderr: '' })          // fetch origin
        .mockResolvedValueOnce({ stdout: '', stderr: '' })          // fetch origin main:main
        .mockResolvedValueOnce({ stdout: 'def5678\n', stderr: '' }) // rev-parse after
        .mockResolvedValueOnce({ stdout: '3\n', stderr: '' })       // rev-list --count

      const result = await git.fetchAndUpdate('/project', 'main')

      expect(result).toEqual({
        updatedBranch: 'main',
        previousRef: 'abc1234',
        currentRef: 'def5678',
        commitCount: 3,
      })
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        1, 'git', ['rev-parse', '--short', 'main'], { cwd: '/project' },
      )
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        2, 'git', ['fetch', 'origin'], { cwd: '/project' },
      )
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        3, 'git', ['fetch', 'origin', 'main:main'], { cwd: '/project' },
      )
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        4, 'git', ['rev-parse', '--short', 'main'], { cwd: '/project' },
      )
      expect(mockExecFileAsync).toHaveBeenNthCalledWith(
        5, 'git', ['rev-list', '--count', 'abc1234..def5678'], { cwd: '/project' },
      )
    })

    it('returns commitCount 0 when already up to date', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '0\n', stderr: '' })

      const result = await git.fetchAndUpdate('/project', 'main')

      expect(result.commitCount).toBe(0)
      expect(result.previousRef).toBe('abc1234')
      expect(result.currentRef).toBe('abc1234')
    })

    it('propagates error when fetch fails', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
        .mockRejectedValueOnce(new Error('Could not resolve host'))

      await expect(git.fetchAndUpdate('/project', 'main'))
        .rejects.toThrow('Could not resolve host')
    })

    it('propagates error when fast-forward fails (diverged)', async () => {
      mockExecFileAsync
        .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockRejectedValueOnce(new Error('non-fast-forward'))

      await expect(git.fetchAndUpdate('/project', 'main'))
        .rejects.toThrow('non-fast-forward')
    })
  })
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/git-operations.test.ts`
Expected: FAIL — `git.fetchAndUpdate is not a function`

---

### Task 3: Implement `fetchAndUpdate()`

**Files:**
- Modify: `src/main/git-operations.ts`

**Step 1: Add the import**

Add `FetchResult` to the existing import from `'../shared/types'` at the top of `src/main/git-operations.ts`:

```ts
import type { AheadBehind, FetchResult } from '../shared/types'
```

**Step 2: Add the method**

Add this method to the `GitOperationsManager` class, after the `commit` method:

```ts
  async fetchAndUpdate(projectPath: string, baseBranch: string): Promise<FetchResult> {
    const { stdout: prevRaw } = await execFileAsync(
      'git', ['rev-parse', '--short', baseBranch], { cwd: projectPath }
    )
    const previousRef = prevRaw.trim()

    await execFileAsync('git', ['fetch', 'origin'], { cwd: projectPath })
    await execFileAsync(
      'git', ['fetch', 'origin', `${baseBranch}:${baseBranch}`], { cwd: projectPath }
    )

    const { stdout: currRaw } = await execFileAsync(
      'git', ['rev-parse', '--short', baseBranch], { cwd: projectPath }
    )
    const currentRef = currRaw.trim()

    const { stdout: countRaw } = await execFileAsync(
      'git', ['rev-list', '--count', `${previousRef}..${currentRef}`], { cwd: projectPath }
    )
    const commitCount = parseInt(countRaw.trim(), 10) || 0

    return { updatedBranch: baseBranch, previousRef, currentRef, commitCount }
  }
```

**Step 3: Run tests to verify they pass**

Run: `npx vitest run src/main/git-operations.test.ts`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/main/git-operations.ts src/main/git-operations.test.ts
git commit -m "feat: add fetchAndUpdate method to GitOperationsManager"
```

---

### Task 4: Add `git:fetch` IPC handler and preload whitelist entry

**Files:**
- Modify: `src/main/ipc/git-handlers.ts`
- Modify: `src/preload/index.ts`

**Step 1: Add the IPC handler**

In `src/main/ipc/git-handlers.ts`, add this import at the top (extend existing import):

```ts
import { CreatePROptions, AheadBehind, FetchResult } from '../../shared/types'
```

Then add this handler inside `registerGitHandlers()`, after the `git:pr-context` handler:

```ts
  ipcMain.handle('git:fetch', async (_event, projectId: string): Promise<FetchResult> => {
    const project = projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)
    return gitOps.fetchAndUpdate(project.path, project.baseBranch)
  })
```

**Step 2: Add to preload whitelist**

In `src/preload/index.ts`, add `'git:fetch'` to `ALLOWED_INVOKE_CHANNELS`, after `'git:fetch-pr-branch'`:

```ts
  'git:fetch',
```

**Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/main/ipc/git-handlers.ts src/preload/index.ts
git commit -m "feat: add git:fetch IPC channel with preload whitelist"
```

---

### Task 5: Add `useFetchProject` hook

**Files:**
- Create: `src/renderer/hooks/useFetchProject.ts`

**Step 1: Create the hook**

Create `src/renderer/hooks/useFetchProject.ts`:

```ts
import { useState, useCallback, useRef, useEffect } from 'react'
import type { FetchResult } from '../../shared/types'

interface UseFetchProjectResult {
  fetching: boolean
  fetchResult: FetchResult | null
  fetchError: string | null
  fetchProject: (projectId: string) => Promise<void>
}

export function useFetchProject(
  onSuccess?: (projectId: string) => void
): UseFetchProjectResult {
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const resultTimer = useRef<ReturnType<typeof setTimeout>>()
  const errorTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => {
      clearTimeout(resultTimer.current)
      clearTimeout(errorTimer.current)
    }
  }, [])

  const fetchProject = useCallback(async (projectId: string): Promise<void> => {
    setFetching(true)
    setFetchError(null)
    setFetchResult(null)
    clearTimeout(resultTimer.current)
    clearTimeout(errorTimer.current)
    try {
      const result = await window.electronAPI.invoke('git:fetch', projectId) as FetchResult
      setFetchResult(result)
      resultTimer.current = setTimeout(() => setFetchResult(null), 5000)
      onSuccess?.(projectId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fetch failed'
      setFetchError(message)
      errorTimer.current = setTimeout(() => setFetchError(null), 5000)
    } finally {
      setFetching(false)
    }
  }, [onSuccess])

  return { fetching, fetchResult, fetchError, fetchProject }
}
```

**Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/hooks/useFetchProject.ts
git commit -m "feat: add useFetchProject hook"
```

---

### Task 6: Add fetch button to `ProjectSidebar`

**Files:**
- Modify: `src/renderer/components/ProjectSidebar.tsx`
- Modify: `src/renderer/components/ProjectSidebar.styles.ts`

**Step 1: Add props and UI**

In `src/renderer/components/ProjectSidebar.tsx`:

1. Add to `ProjectSidebarProps` interface:
```ts
  fetchingProjectId: string | null
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetchProject: (projectId: string) => void
```

2. Add to `ProjectSidebar` function signature (destructure the new props) and pass them through `ProjectList` and into `ProjectItem`.

3. Add to `ProjectListProps` interface:
```ts
  fetchingProjectId: string | null
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetchProject: (projectId: string) => void
```

4. Add to `ProjectItemProps` interface:
```ts
  isFetching: boolean
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetch: () => void
```

5. In the `ProjectItem` component, add a fetch button in `itemRight` div, before the gear button:

```tsx
<button
  onClick={(e) => { e.stopPropagation(); onFetch() }}
  style={sidebarStyles.removeButton}
  aria-label={`Fetch ${project.name}`}
  title="Fetch latest from remote"
  disabled={isFetching}
>
  {isFetching ? '...' : '\u21BB'}
</button>
```

6. Below the `ProjectItem` div (after the settings popover), show the fetch status message when relevant:

```tsx
{fetchResult && (
  <div style={sidebarStyles.fetchMessage}>
    {fetchResult.commitCount > 0
      ? `Updated ${fetchResult.updatedBranch}: ${fetchResult.commitCount} new commit${fetchResult.commitCount !== 1 ? 's' : ''}`
      : `${fetchResult.updatedBranch} is up to date`}
  </div>
)}
{fetchError && (
  <div style={{ ...sidebarStyles.fetchMessage, color: 'var(--error, #f44)' }}>
    {fetchError}
  </div>
)}
```

**Step 2: Add styles**

In `src/renderer/components/ProjectSidebar.styles.ts`, add to the `sidebarStyles` object:

```ts
  fetchMessage: {
    padding: '2px 12px 4px 20px',
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
```

**Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: FAIL — `dock-panels.tsx` and `App.tsx` don't pass the new props yet. That's expected, we'll fix it in the next task.

**Step 4: Commit**

```bash
git add src/renderer/components/ProjectSidebar.tsx src/renderer/components/ProjectSidebar.styles.ts
git commit -m "feat: add fetch button and status message to ProjectSidebar"
```

---

### Task 7: Wire everything together in `dock-panels.tsx` and `App.tsx`

**Files:**
- Modify: `src/renderer/components/dock-panels.tsx`
- Modify: `src/renderer/App.tsx`

**Step 1: Update `DockAppState` interface**

In `src/renderer/components/dock-panels.tsx`, add to the `DockAppState` interface in the `// Projects panel` section:

```ts
  fetchingProjectId: string | null
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetchProject: (projectId: string) => void
```

**Step 2: Pass new props in `ProjectsPanel`**

Update the `ProjectsPanel` function to pass the new props to `ProjectSidebar`:

```tsx
function ProjectsPanel(): React.JSX.Element {
  const s = useDockState()
  return (
    <ProjectSidebar
      projects={s.projects}
      activeProjectId={s.activeProjectId}
      allProjectSessions={s.allProjectSessions}
      activeSessionId={s.sessionId}
      onSelectProject={s.onSelectProject}
      onSelectSession={s.onSelectSession}
      onRemoveProject={s.onRemoveProject}
      onUpdateProject={s.onUpdateProject}
      onDeleteAgent={s.onDeleteAgent}
      onNewAgent={s.onNewAgentFromHeader}
      onNewProject={s.onNewProject}
      onOpenSettings={s.onOpenSettings}
      fetchingProjectId={s.fetchingProjectId}
      fetchResult={s.fetchResult}
      fetchError={s.fetchError}
      onFetchProject={s.onFetchProject}
    />
  )
}
```

**Step 3: Wire in `App.tsx`**

In `src/renderer/App.tsx`:

1. Add the import:
```ts
import { useFetchProject } from './hooks/useFetchProject'
```

2. After the existing `const gitOps = useGitOperations(activeSessionId)` line, add the fetch hook with an `onSuccess` callback that refreshes ahead/behind for all sessions in the fetched project:

```ts
const handleFetchSuccess = useCallback((projectId: string) => {
  const projectSessions = sessionsByProject[projectId] ?? []
  for (const session of projectSessions) {
    void window.electronAPI.invoke('git:ahead-behind', session.id)
      .then((result) => {
        if (session.id === activeSessionId) {
          void gitOps.refreshAheadBehind()
        }
      })
      .catch(() => {})
  }
}, [sessionsByProject, activeSessionId, gitOps.refreshAheadBehind])

const fetchProject = useFetchProject(handleFetchSuccess)
```

3. Add these properties to the `dockState` object, in the `// Projects panel` section:

```ts
    fetchingProjectId: fetchProject.fetching ? null : null, // see note below
    fetchResult: fetchProject.fetchResult,
    fetchError: fetchProject.fetchError,
    onFetchProject: fetchProject.fetchProject,
```

Note: We need to track which project is being fetched. The simplest approach is to store the fetching project ID in the hook. Update the `useFetchProject` hook to also expose `fetchingProjectId`:

In `src/renderer/hooks/useFetchProject.ts`, change:
- Add `const [fetchingProjectId, setFetchingProjectId] = useState<string | null>(null)`
- Set `setFetchingProjectId(projectId)` at start, `setFetchingProjectId(null)` in finally
- Return `fetchingProjectId` in the result
- Change `fetching` to be derived: `fetching: fetchingProjectId !== null`

Then in `App.tsx`:
```ts
    fetchingProjectId: fetchProject.fetchingProjectId,
```

**Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Run all tests**

Run: `npm test`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/renderer/components/dock-panels.tsx src/renderer/App.tsx src/renderer/hooks/useFetchProject.ts
git commit -m "feat: wire git fetch through dock panels and App"
```

---

### Task 8: Final verification

**Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 2: Run all tests**

Run: `npm test`
Expected: ALL PASS

**Step 3: Manual smoke test**

Run: `npm run dev`

1. Open the app with a project that has a remote
2. Look for the `↻` button next to each project name in the sidebar
3. Click it — should show spinner, then result message
4. Verify ahead/behind counts update for active sessions
5. Message should auto-clear after 5 seconds

**Step 4: Commit any fixes if needed**
