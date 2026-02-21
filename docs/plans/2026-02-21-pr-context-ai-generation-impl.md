# PR Context-Aware AI Generation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve AI-generated PR titles and descriptions by feeding the agent real git context (commit log + diff stat + truncated patch) instead of just the branch name.

**Architecture:** Add a `getPRContext()` method to `GitOperationsManager` that gathers commit log, diff stat, and truncated diff patch. Expose it via a new `git:pr-context` IPC channel. Update `PRPanel` to fetch this context and build richer prompts for the AI agent.

**Tech Stack:** Electron IPC, git CLI, React hooks, TypeScript

---

### Task 1: Add PRContext type to shared types

**Files:**
- Modify: `src/shared/types.ts:82-86` (append after `GitStatusDetail`)

**Step 1: Add the type**

Add at the end of `src/shared/types.ts`:

```ts
export interface PRContext {
  commits: string
  diffStat: string
  diffPatch: string
}
```

**Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add PRContext type for context-aware PR generation"
```

---

### Task 2: Add getPRContext method with tests (TDD)

**Files:**
- Modify: `src/main/git-operations.ts`
- Modify: `src/main/git-operations.test.ts`

**Step 1: Write the failing tests**

Add to `src/main/git-operations.test.ts` after the `aiGenerate` describe block:

```ts
// ---- getPRContext ----

describe('getPRContext', () => {
  it('returns commits, diffStat, and truncated diffPatch', async () => {
    mockExecFileAsync
      .mockResolvedValueOnce({ stdout: 'abc1234 feat: add login\ndef5678 fix: typo\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: ' src/a.ts | 10 ++++\n src/b.ts |  3 ---\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'diff --git a/src/a.ts b/src/a.ts\n+new line\n', stderr: '' })

    const ctx = await git.getPRContext('/worktree', 'main')

    expect(ctx.commits).toBe('abc1234 feat: add login\ndef5678 fix: typo')
    expect(ctx.diffStat).toBe(' src/a.ts | 10 ++++\n src/b.ts |  3 ---')
    expect(ctx.diffPatch).toBe('diff --git a/src/a.ts b/src/a.ts\n+new line')
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'git', ['log', '--oneline', 'main..HEAD'], { cwd: '/worktree' },
    )
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'git', ['diff', '--stat', 'main..HEAD'], { cwd: '/worktree' },
    )
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      'git', ['diff', 'main..HEAD'], { cwd: '/worktree' },
    )
  })

  it('truncates diffPatch to 6000 chars', async () => {
    const longPatch = 'x'.repeat(8000)
    mockExecFileAsync
      .mockResolvedValueOnce({ stdout: 'abc feat\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: 'stat\n', stderr: '' })
      .mockResolvedValueOnce({ stdout: longPatch, stderr: '' })

    const ctx = await git.getPRContext('/worktree', 'main')

    expect(ctx.diffPatch.length).toBe(6000)
  })

  it('returns empty strings on error', async () => {
    mockExecFileAsync.mockRejectedValue(new Error('not a git repo'))

    const ctx = await git.getPRContext('/worktree', 'main')

    expect(ctx).toEqual({ commits: '', diffStat: '', diffPatch: '' })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/git-operations.test.ts`
Expected: FAIL — `getPRContext` is not a function.

**Step 3: Implement getPRContext**

Add to `src/main/git-operations.ts`, after the `aiGenerate` method but before the closing `}` of the class:

```ts
async getPRContext(
  worktreePath: string,
  baseBranch: string
): Promise<{ commits: string; diffStat: string; diffPatch: string }> {
  try {
    const [logResult, statResult, diffResult] = await Promise.all([
      execFileAsync('git', ['log', '--oneline', `${baseBranch}..HEAD`], { cwd: worktreePath }),
      execFileAsync('git', ['diff', '--stat', `${baseBranch}..HEAD`], { cwd: worktreePath }),
      execFileAsync('git', ['diff', `${baseBranch}..HEAD`], { cwd: worktreePath }),
    ])
    return {
      commits: logResult.stdout.trim(),
      diffStat: statResult.stdout.trim(),
      diffPatch: diffResult.stdout.trim().slice(0, 6000),
    }
  } catch {
    return { commits: '', diffStat: '', diffPatch: '' }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/git-operations.test.ts`
Expected: All PASS.

**Step 5: Commit**

```bash
git add src/main/git-operations.ts src/main/git-operations.test.ts
git commit -m "feat: add getPRContext method to GitOperationsManager"
```

---

### Task 3: Register git:pr-context IPC handler

**Files:**
- Modify: `src/main/ipc-handlers.ts:280-304` (inside `registerGitHandlers`)

**Step 1: Add the handler**

Inside `registerGitHandlers`, after the `git:resolve-conflict` handler, add:

```ts
ipcMain.handle('git:pr-context', async (_event, sessionId: string) => {
  const session = resolveSession(sessionManager, sessionId)
  const project = projectRegistry.getProject(session.projectId)
  if (!project) throw new Error(`Project not found: ${session.projectId}`)
  return gitOps.getPRContext(session.worktreePath, project.baseBranch)
})
```

**Step 2: Commit**

```bash
git add src/main/ipc-handlers.ts
git commit -m "feat: register git:pr-context IPC handler"
```

---

### Task 4: Whitelist git:pr-context in preload

**Files:**
- Modify: `src/preload/index.ts:3-38` (ALLOWED_INVOKE_CHANNELS array)

**Step 1: Add channel to whitelist**

Add `'git:pr-context'` to the `ALLOWED_INVOKE_CHANNELS` array, after `'git:resolve-conflict'`:

```ts
'git:resolve-conflict',
'git:pr-context',
'app:beep',
```

**Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: whitelist git:pr-context IPC channel in preload"
```

---

### Task 5: Add getPRContext to useGitOperations hook

**Files:**
- Modify: `src/renderer/hooks/useGitOperations.ts`

**Step 1: Import the type**

Add to the imports in `useGitOperations.ts`:

```ts
import type { AheadBehind, PRContext } from '../../shared/types'
```

**Step 2: Add to return interface**

Add to `UseGitOperationsResult`:

```ts
getPRContext: () => Promise<PRContext>
```

**Step 3: Add the callback**

Inside `useGitOperations`, after the `resolveConflict` callback:

```ts
const getPRContext = useCallback(async (): Promise<PRContext> => {
  if (!sessionRef.current) return { commits: '', diffStat: '', diffPatch: '' }
  try {
    return await window.electronAPI.invoke('git:pr-context', sessionRef.current) as PRContext
  } catch {
    return { commits: '', diffStat: '', diffPatch: '' }
  }
}, [])
```

**Step 4: Add to return object**

Add `getPRContext` to the returned object:

```ts
return { aheadBehind, conflicts, commit, aiGenerate, getPRContext, resolveConflict, refreshAheadBehind }
```

**Step 5: Commit**

```bash
git add src/renderer/hooks/useGitOperations.ts
git commit -m "feat: add getPRContext to useGitOperations hook"
```

---

### Task 6: Update PRPanel to use real git context for AI prompts

**Files:**
- Modify: `src/renderer/components/PRPanel.tsx`
- Modify: `src/renderer/App.tsx` (PRPanel props)

**Step 1: Update PRPanel props and prompts**

Replace the full `PRPanel.tsx` with the updated version that:
- Adds `getPRContext` prop
- Fetches context on mount
- Uses commits + diffStat + diffPatch in the AI prompts instead of just branch name

New props interface:

```ts
interface PRPanelProps {
  sessionId: string
  branchName: string
  baseBranch: string
  onAiGenerate: (prompt: string) => Promise<string>
  getPRContext: () => Promise<PRContext>
  onClose: () => void
}
```

New generation logic (replaces the two generate callbacks and the useEffect):

```ts
const [context, setContext] = useState<PRContext | null>(null)

useEffect(() => {
  void getPRContext().then(setContext)
}, [getPRContext])

const generateTitle = useCallback(async (ctx: PRContext): Promise<void> => {
  setGeneratingTitle(true)
  const prompt = `Write a short pull request title (≤60 chars, imperative mood) for these changes. Output only the title, nothing else.\n\nCommits:\n${ctx.commits}\n\nFiles changed:\n${ctx.diffStat}`
  const result = await onAiGenerate(prompt)
  if (result) setTitle(result)
  setGeneratingTitle(false)
}, [onAiGenerate])

const generateDescription = useCallback(async (ctx: PRContext): Promise<void> => {
  setGeneratingDesc(true)
  const prompt = `Write a pull request description in markdown. Include a brief summary and a bullet-point list of changes. Output only the markdown, nothing else.\n\nCommits:\n${ctx.commits}\n\nFiles changed:\n${ctx.diffStat}\n\nDiff (truncated):\n${ctx.diffPatch}`
  const result = await onAiGenerate(prompt)
  if (result) setDescription(result)
  setGeneratingDesc(false)
}, [onAiGenerate])

useEffect(() => {
  if (!context) return
  void generateTitle(context)
  void generateDescription(context)
}, [context, generateTitle, generateDescription])
```

**Step 2: Update App.tsx to pass getPRContext prop**

In `App.tsx`, update the PRPanel usage:

```tsx
{activePanel === 'pr' && activeSessionId && activeSession && (
  <PRPanel
    sessionId={activeSessionId}
    branchName={activeSession.branchName}
    baseBranch={activeProject?.baseBranch ?? settings.defaultBaseBranch}
    onAiGenerate={gitOps.aiGenerate}
    getPRContext={gitOps.getPRContext}
    onClose={handleClosePanel}
  />
)}
```

**Step 3: Import PRContext type in PRPanel**

```ts
import type { PRContext } from '../../shared/types'
```

**Step 4: Commit**

```bash
git add src/renderer/components/PRPanel.tsx src/renderer/App.tsx
git commit -m "feat: use real git context for AI-generated PR content"
```

---

### Task 7: Typecheck and verify

**Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

**Step 2: Run all tests**

Run: `npm test`
Expected: All pass.

**Step 3: Commit if any fixups needed**

Only if typecheck/tests revealed issues that required changes.
