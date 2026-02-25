# Git Fetch: Keep Base Branch Current

## Problem

When multiple agents work in parallel on isolated worktree branches, the local base branch (e.g., `main`) can fall behind the remote. New agent worktrees then branch off stale code, and existing agents' ahead/behind counts don't reflect the true remote state.

## Solution

An on-demand "Fetch" button in the project sidebar that fetches from origin and fast-forwards the local base branch. After a successful fetch, all active sessions in that project auto-refresh their ahead/behind counts.

## Design Decisions

- **On-demand only** — no automatic or periodic fetching.
- **Fetch + fast-forward** — uses `git fetch origin <branch>:<branch>` to update the local ref directly without requiring the branch to be checked out. Fails safely if the branch has diverged (non-fast-forward).
- **Project-level operation** — the IPC channel takes `projectId`, not `sessionId`.
- **Informative feedback** — shows commit count and ref range on success, error message on failure. Auto-clears after 5 seconds.

## Changes

### 1. Shared Types (`src/shared/types.ts`)

Add `FetchResult` interface:

```ts
export interface FetchResult {
  updatedBranch: string
  previousRef: string
  currentRef: string
  commitCount: number
}
```

### 2. Backend (`src/main/git-operations.ts`)

Add `fetchAndUpdate(projectPath, baseBranch)` method:

1. `git rev-parse --short <baseBranch>` — capture previous ref
2. `git fetch origin` — update all remote-tracking refs
3. `git fetch origin <baseBranch>:<baseBranch>` — fast-forward local ref (fails safely if diverged)
4. `git rev-parse --short <baseBranch>` — capture new ref
5. `git rev-list --count <prev>..<curr>` — count new commits
6. Return `FetchResult`

### 3. IPC Handler (`src/main/ipc/git-handlers.ts`)

Add `git:fetch` handler in `registerGitHandlers`:

```ts
ipcMain.handle('git:fetch', async (_event, projectId: string): Promise<FetchResult> => {
  const project = projectRegistry.getProject(projectId)
  if (!project) throw new Error(`Project not found: ${projectId}`)
  return gitOps.fetchAndUpdate(project.path, project.baseBranch)
})
```

### 4. Preload Whitelist (`src/preload/index.ts`)

Add `'git:fetch'` to `ALLOWED_INVOKE_CHANNELS`.

### 5. Renderer Hook (`src/renderer/hooks/useGitOperations.ts`)

Extend with:
- `fetching: boolean` state
- `fetchResult: FetchResult | null` state (auto-clears after 5s)
- `fetchError: string | null` state (auto-clears after 5s)
- `fetchProject(projectId: string)` action
- `onFetchSuccess(projectId: string)` callback prop for wiring ahead/behind refresh

### 6. UI (`src/renderer/components/ProjectSidebar.tsx`)

Add a fetch button per `ProjectItem`:
- Shows `↻` icon by default
- Shows spinner while fetching
- Inline result message after completion (e.g., "Updated main: 3 new commits")

### 7. Wiring (`src/renderer/App.tsx`)

Connect fetch success callback to re-invoke `git:ahead-behind` for all active sessions in the fetched project.

### 8. Tests

Unit test for `fetchAndUpdate()` in `src/main/git-operations.test.ts`, mocking `execFileAsync` to verify:
- Correct git commands are called in order
- Returns proper `FetchResult` with commit count
- Handles non-fast-forward errors gracefully
- Handles network/fetch errors

## Out of Scope

- Automatic/periodic fetching
- Rebase/merge of agent worktree branches onto updated base
- Pull for individual agent sessions
