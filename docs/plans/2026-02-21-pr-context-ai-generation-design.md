# PR Context-Aware AI Generation

## Problem

The PR creation panel generates title and description using only the branch name (e.g. `manifold/oslo`). This produces generic, unhelpful descriptions. The agent CLI (claude, codex, gemini) is already available via non-interactive `-p` mode — we just need to feed it real git context.

## Design

### New `PRContext` type

```ts
interface PRContext {
  commits: string   // git log --oneline base..HEAD
  diffStat: string  // git diff --stat base..HEAD
  diffPatch: string // git diff base..HEAD, truncated to ~6000 chars
}
```

### Backend: `GitOperationsManager.getPRContext()`

Runs three git commands against the worktree, truncates the patch to keep the prompt within token limits, and returns a `PRContext` object.

### New IPC channel: `git:pr-context`

Takes a `sessionId`, resolves worktree path and base branch, calls `getPRContext()`.

### Frontend: PRPanel uses context for richer prompts

On mount, fetches `PRContext` via the new IPC. Title and description generation prompts include commits, diff stat, and truncated patch instead of just the branch name.

- Title prompt: "Write a short PR title (≤60 chars, imperative mood) for these changes: [commits] [diff stat]"
- Description prompt: "Write a PR description in markdown with a brief summary and bullet-point list of changes: [commits] [diff stat] [truncated patch]"

### Files touched

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `PRContext` interface |
| `src/main/git-operations.ts` | Add `getPRContext()` method |
| `src/main/ipc-handlers.ts` | Register `git:pr-context` handler |
| `src/preload/index.ts` | Whitelist `git:pr-context` channel |
| `src/renderer/hooks/useGitOperations.ts` | Add `getPRContext()` function |
| `src/renderer/components/PRPanel.tsx` | Use context for richer prompts |

### Unchanged

- CommitPanel already uses the actual diff — no changes needed.
- The existing `git:ai-generate` IPC remains the mechanism for calling the agent CLI.
