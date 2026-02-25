# No-Worktree Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow agents to run directly in the project's main checkout directory by checking out a branch with `git checkout` instead of creating a git worktree.

**Architecture:** Add a `noWorktree` boolean flag threaded through `SpawnAgentOptions` → `SessionManager` → `AgentSession`. SessionManager gains a new code path that runs `git checkout` in the project directory. The UI adds a checkbox in NewTaskModal and makes BranchPicker optionally allow the base branch.

**Tech Stack:** TypeScript, React, Electron IPC, node-pty, git CLI

---

### Task 1: Add `noWorktree` to shared types

**Files:**
- Modify: `src/shared/types.ts:66-75` (SpawnAgentOptions)
- Modify: `src/shared/types.ts:14-24` (AgentSession)

**Step 1: Add `noWorktree` to `SpawnAgentOptions`**

In `src/shared/types.ts`, add `noWorktree?: boolean` after the `prIdentifier` field:

```typescript
export interface SpawnAgentOptions {
  projectId: string
  runtimeId: string
  prompt: string
  branchName?: string
  existingBranch?: string
  prIdentifier?: string
  noWorktree?: boolean
  cols?: number
  rows?: number
}
```

**Step 2: Add `noWorktree` to `AgentSession`**

In the same file, add `noWorktree?: boolean` after `additionalDirs`:

```typescript
export interface AgentSession {
  id: string
  projectId: string
  runtimeId: string
  branchName: string
  worktreePath: string
  status: AgentStatus
  pid: number | null
  taskDescription?: string
  additionalDirs: string[]
  noWorktree?: boolean
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (new optional fields don't break anything)

**Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add noWorktree flag to SpawnAgentOptions and AgentSession"
```

---

### Task 2: Update SessionManager to handle no-worktree mode

**Files:**
- Modify: `src/main/session-manager.ts:42-94` (createSession)
- Modify: `src/main/session-manager.ts:153-182` (killSession)
- Modify: `src/main/session-manager.ts:108-126` (buildSession)
- Modify: `src/main/session-manager.ts:343-355` (toPublicSession)

**Step 1: Add gitExec and generateBranchName imports**

At the top of `src/main/session-manager.ts`, add:

```typescript
import { gitExec } from './git-exec'
import { generateBranchName } from './branch-namer'
```

**Step 2: Add no-worktree path in `createSession()`**

Replace the worktree resolution block (lines 46-72) with:

```typescript
    let worktree: { branch: string; path: string }

    if (options.noWorktree) {
      // No-worktree mode: checkout branch directly in project directory
      if (options.existingBranch) {
        await gitExec(['checkout', options.existingBranch], project.path)
        worktree = { branch: options.existingBranch, path: project.path }
      } else if (options.prIdentifier && this.branchCheckoutManager) {
        const branch = await this.branchCheckoutManager.fetchPRBranch(
          project.path,
          options.prIdentifier
        )
        await gitExec(['checkout', branch], project.path)
        worktree = { branch, path: project.path }
      } else {
        // Create new branch from current HEAD
        const branch = options.branchName ?? (await generateBranchName(project.path, options.prompt ?? ''))
        await gitExec(['checkout', '-b', branch], project.path)
        worktree = { branch, path: project.path }
      }
    } else if (options.prIdentifier && this.branchCheckoutManager) {
      const branch = await this.branchCheckoutManager.fetchPRBranch(
        project.path,
        options.prIdentifier
      )
      worktree = await this.branchCheckoutManager.createWorktreeFromBranch(
        project.path,
        branch,
        project.name
      )
    } else if (options.existingBranch && this.branchCheckoutManager) {
      worktree = await this.branchCheckoutManager.createWorktreeFromBranch(
        project.path,
        options.existingBranch,
        project.name
      )
    } else {
      worktree = await this.worktreeManager.createWorktree(
        project.path,
        project.baseBranch,
        project.name,
        options.branchName,
        options.prompt
      )
    }
```

**Step 3: Update `buildSession()` to pass `noWorktree`**

```typescript
  private buildSession(
    options: SpawnAgentOptions,
    worktree: { branch: string; path: string },
    ptyHandle: { id: string; pid: number }
  ): InternalSession {
    return {
      id: uuidv4(),
      projectId: options.projectId,
      runtimeId: options.runtimeId,
      branchName: worktree.branch,
      worktreePath: worktree.path,
      status: 'running',
      pid: ptyHandle.pid,
      ptyId: ptyHandle.id,
      outputBuffer: '',
      taskDescription: options.prompt || undefined,
      additionalDirs: [],
      noWorktree: options.noWorktree,
    }
  }
```

**Step 4: Update `killSession()` to skip worktree removal**

Replace the worktree cleanup block (lines 172-181) with:

```typescript
    if (session.projectId && !session.noWorktree) {
      try {
        await this.worktreeManager.removeWorktree(
          this.projectRegistry.getProject(session.projectId)?.path ?? '',
          session.worktreePath
        )
      } catch {
        // Worktree cleanup is best-effort
      }
    }
```

**Step 5: Update `toPublicSession()` to include `noWorktree`**

```typescript
  private toPublicSession(session: InternalSession): AgentSession {
    return {
      id: session.id,
      projectId: session.projectId,
      runtimeId: session.runtimeId,
      branchName: session.branchName,
      worktreePath: session.worktreePath,
      status: session.status,
      pid: session.pid,
      taskDescription: session.taskDescription,
      additionalDirs: session.additionalDirs,
      noWorktree: session.noWorktree,
    }
  }
```

**Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 7: Run tests**

Run: `npm test`
Expected: PASS (existing tests should still pass)

**Step 8: Commit**

```bash
git add src/main/session-manager.ts
git commit -m "feat: add no-worktree code path in SessionManager"
```

---

### Task 3: Add `allowBaseBranch` prop to BranchPicker

**Files:**
- Modify: `src/renderer/components/new-task/BranchPicker.tsx`

**Step 1: Add the prop and update the disable logic**

Add `allowBaseBranch?: boolean` to the props and change the `isBase` usage:

```typescript
export function BranchPicker({
  branches,
  baseBranch,
  filter,
  onFilterChange,
  selected,
  onSelect,
  loading,
  allowBaseBranch,
}: {
  branches: BranchInfo[]
  baseBranch: string
  filter: string
  onFilterChange: (v: string) => void
  selected: string
  onSelect: (v: string) => void
  loading: boolean
  allowBaseBranch?: boolean
}): React.JSX.Element {
```

Then change line 56 area. Replace:

```typescript
            const isBase = b.name === baseBranch
```

With:

```typescript
            const isBase = b.name === baseBranch && !allowBaseBranch
```

This makes the base branch selectable when `allowBaseBranch` is true.

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/components/new-task/BranchPicker.tsx
git commit -m "feat: add allowBaseBranch prop to BranchPicker"
```

---

### Task 4: Add no-worktree checkbox to NewTaskModal

**Files:**
- Modify: `src/renderer/components/NewTaskModal.tsx`
- Modify: `src/renderer/hooks/useResetOnOpen.ts`
- Modify: `src/renderer/components/NewTaskModal.styles.ts`

**Step 1: Add `noWorktree` state to NewTaskModal**

In `src/renderer/components/NewTaskModal.tsx`, add state after the `error` state declaration (line 55):

```typescript
  const [noWorktree, setNoWorktree] = useState(false)
```

**Step 2: Add `setNoWorktree` to `useResetOnOpen` call**

Update the `useResetOnOpen` call to include the new setter. In `NewTaskModal.tsx`, update the call (around line 70):

```typescript
  useResetOnOpen(
    visible, defaultRuntime, initialDescription,
    setTaskDescription, setRuntimeId, setLoading, setUseExisting, setExistingSubTab,
    setBranches, setBranchFilter, setSelectedBranch, setPrs, setPrFilter, setSelectedPr, setError,
    setNoWorktree
  )
```

In `src/renderer/hooks/useResetOnOpen.ts`, add the parameter and reset it:

```typescript
export function useResetOnOpen(
  visible: boolean,
  defaultRuntime: string,
  initialDescription: string,
  setTaskDescription: (v: string) => void,
  setRuntimeId: (v: string) => void,
  setLoading: (v: boolean) => void,
  setUseExisting: (v: boolean) => void,
  setExistingSubTab: (v: ExistingSubTab) => void,
  setBranches: (v: BranchInfo[]) => void,
  setBranchFilter: (v: string) => void,
  setSelectedBranch: (v: string) => void,
  setPrs: (v: PRInfo[]) => void,
  setPrFilter: (v: string) => void,
  setSelectedPr: (v: number | null) => void,
  setError: (v: string) => void,
  setNoWorktree: (v: boolean) => void
): void {
  useEffect(() => {
    if (!visible) return
    setTaskDescription(initialDescription)
    setRuntimeId(defaultRuntime)
    setLoading(false)
    setUseExisting(false)
    setExistingSubTab('branch')
    setBranches([])
    setBranchFilter('')
    setSelectedBranch('')
    setPrs([])
    setPrFilter('')
    setSelectedPr(null)
    setError('')
    setNoWorktree(false)
  }, [visible, defaultRuntime, initialDescription, setTaskDescription, setRuntimeId, setLoading, setUseExisting, setExistingSubTab, setBranches, setBranchFilter, setSelectedBranch, setPrs, setPrFilter, setSelectedPr, setError, setNoWorktree])
}
```

**Step 3: Add the checkbox to the modal body**

After the existing "Continue on an existing branch or PR" checkbox (line 214), add:

```tsx
          <label style={modalStyles.checkboxLabel}>
            <input
              type="checkbox"
              checked={noWorktree}
              onChange={(e) => setNoWorktree(e.target.checked)}
            />
            No worktree (run in project directory)
          </label>
```

**Step 4: Show info note when noWorktree is checked without useExisting**

After the new checkbox, add:

```tsx
          {noWorktree && !useExisting && (
            <p style={modalStyles.infoText}>
              A new branch will be created from the current branch in your project directory.
            </p>
          )}
```

**Step 5: Add `infoText` style**

In `src/renderer/components/NewTaskModal.styles.ts`, add after `errorText`:

```typescript
  infoText: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    margin: 0,
    fontStyle: 'italic',
  },
```

**Step 6: Pass `allowBaseBranch` to BranchPicker**

Update the `BranchPicker` usage (around line 242) to pass the new prop:

```tsx
                <BranchPicker
                  branches={branches}
                  baseBranch={effectiveBaseBranch}
                  filter={branchFilter}
                  onFilterChange={setBranchFilter}
                  selected={selectedBranch}
                  onSelect={setSelectedBranch}
                  loading={branchesLoading}
                  allowBaseBranch={noWorktree}
                />
```

**Step 7: Update `canSubmit` logic**

The current `canSubmit` already requires a branch selection when `useExisting` is true. When `noWorktree` is true and `useExisting` is false, no branch selection is needed (new branch auto-created). The existing logic handles this correctly — no change needed.

**Step 8: Update `handleSubmit` to pass `noWorktree`**

Replace the `handleSubmit` callback body (the `if/else if/else` block inside) with:

```typescript
      if (useExisting && existingSubTab === 'branch') {
        onLaunch({
          projectId: effectiveProjectId,
          runtimeId,
          prompt: taskDescription.trim(),
          existingBranch: selectedBranch,
          noWorktree: noWorktree || undefined,
        })
      } else if (useExisting && existingSubTab === 'pr') {
        onLaunch({
          projectId: effectiveProjectId,
          runtimeId,
          prompt: taskDescription.trim(),
          prIdentifier: String(selectedPr),
          noWorktree: noWorktree || undefined,
        })
      } else {
        onLaunch({
          projectId: effectiveProjectId,
          runtimeId,
          prompt: taskDescription.trim(),
          noWorktree: noWorktree || undefined,
        })
      }
```

The `noWorktree || undefined` pattern avoids sending `false` — keeps the field absent when not set.

**Step 9: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 10: Run tests**

Run: `npm test`
Expected: PASS

**Step 11: Commit**

```bash
git add src/renderer/components/NewTaskModal.tsx src/renderer/hooks/useResetOnOpen.ts src/renderer/components/NewTaskModal.styles.ts
git commit -m "feat: add no-worktree checkbox to NewTaskModal"
```

---

### Task 5: Manual smoke test

**Step 1: Start dev mode**

Run: `npm run dev`

**Step 2: Test no-worktree + new branch**

1. Open New Agent dialog
2. Enter a task description
3. Check "No worktree (run in project directory)"
4. Verify the info note appears: "A new branch will be created from the current branch in your project directory."
5. Do NOT check "Continue on an existing branch"
6. Click Start Agent
7. Verify agent runs in the project directory (not a worktree subdirectory)
8. Verify a new `manifold/...` branch was created

**Step 3: Test no-worktree + existing branch**

1. Open New Agent dialog
2. Enter a task description
3. Check "No worktree (run in project directory)"
4. Check "Continue on an existing branch or PR"
5. Verify `main` is selectable in the branch list (not grayed out)
6. Select a branch
7. Click Start Agent
8. Verify agent runs on the selected branch in the project directory

**Step 4: Test kill no-worktree session**

1. Kill the running no-worktree agent
2. Verify the branch is left as-is (not switched back)
3. Verify no worktree removal errors in logs

**Step 5: Commit final state**

```bash
git add -A
git commit -m "feat: no-worktree mode complete"
```
