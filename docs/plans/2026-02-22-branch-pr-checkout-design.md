# Existing Branch/PR Checkout in New Task Dialog

**Date:** 2026-02-22

## Problem

When creating a new agent task, Manifold always creates a new branch from the project's base branch. Users cannot point an agent at an existing branch or an open pull request. This is needed for code review, continuing work started elsewhere, or picking up a colleague's branch.

## Design

### UI: NewTaskModal Tabs

The modal gains two top-level tabs at the top: **"New Branch"** (default, current flow) and **"Existing Branch/PR"**.

**"New Branch" tab** — unchanged from today.

**"Existing Branch/PR" tab** contains:
- Task description textarea (the agent still needs a prompt)
- Agent dropdown (same as new branch)
- Two **sub-tabs**: "Branch" and "Pull Request"

#### Branch sub-tab
- A filterable text input with a dropdown listing branches from the project repo.
- Branches are fetched via a new `git:list-branches` IPC channel.
- The list includes both local and remote branches (`git fetch` runs first, then `git branch -a` is parsed). Remote branches are shown without the `origin/` prefix. Duplicates (local + remote with same name) are deduplicated.
- `manifold/` prefixed branches (existing agent worktrees) and HEAD are filtered out.

#### Pull Request sub-tab
- A text input accepting a PR number (e.g., `42`) or a GitHub PR URL (e.g., `https://github.com/org/repo/pull/42`).
- On submit, Manifold fetches the PR branch from the remote via `gh` CLI.

### Data Flow

```
User selects "Existing Branch/PR" tab
  → "Branch" sub-tab: picks a branch from dropdown
    → Submit → agent:spawn with { existingBranch: "feature/foo" }
  → "PR" sub-tab: enters PR number
    → Submit → agent:spawn with { prIdentifier: "42" }

SessionManager.createSession():
  if existingBranch → BranchCheckoutManager.createWorktreeFromBranch()
  if prIdentifier   → BranchCheckoutManager.fetchPRBranch() → createWorktreeFromBranch()
  else              → WorktreeManager.createWorktree() (current flow)
```

### Types

```ts
// Updated SpawnAgentOptions
export interface SpawnAgentOptions {
  projectId: string
  runtimeId: string
  prompt: string
  branchName?: string       // new branch flow: custom branch name
  existingBranch?: string   // existing branch to check out
  prIdentifier?: string     // PR number or URL to fetch
  cols?: number
  rows?: number
}
```

Only one of `branchName`, `existingBranch`, or `prIdentifier` should be set per request.

### New Module: BranchCheckoutManager

File: `src/main/branch-checkout-manager.ts`

```ts
class BranchCheckoutManager {
  constructor(private storagePath: string) {}

  // Runs git fetch, then lists all branches (local + remote, deduplicated).
  // Filters out manifold/* worktree branches and HEAD.
  async listBranches(projectPath: string): Promise<string[]>

  // Parses PR number from raw number or GitHub URL.
  // Runs `gh pr view <number> --json headRefName` to get branch name.
  // Runs `git fetch origin <branch>` to ensure it's available locally.
  // Returns the branch name.
  async fetchPRBranch(projectPath: string, prIdentifier: string): Promise<string>

  // Runs `git worktree add <worktreePath> <branch>` (no -b flag).
  // Returns { branch, path }.
  async createWorktreeFromBranch(
    projectPath: string,
    branch: string,
    projectName: string
  ): Promise<{ branch: string; path: string }>
}
```

### New IPC Channels

| Channel | Direction | Payload | Response |
|---------|-----------|---------|----------|
| `git:list-branches` | invoke | `{ projectId }` | `string[]` |
| `git:fetch-pr-branch` | invoke | `{ projectId, prIdentifier }` | `{ branch: string }` |

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Branch doesn't exist | Error shown in modal: "Branch 'xyz' not found" |
| PR not found | Error: "PR #42 not found or gh not authenticated" |
| `gh` not installed | Warning in PR sub-tab: "GitHub CLI required. Install from cli.github.com" |
| Worktree conflict | Error: "A worktree already exists for branch 'xyz'" |
| Fetch fails (network) | Error: "Failed to fetch from remote. Check your network connection." |

### Files Changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `existingBranch`, `prIdentifier` to `SpawnAgentOptions` |
| `src/main/branch-checkout-manager.ts` | **New** — branch listing, PR fetch, worktree-from-existing |
| `src/main/branch-checkout-manager.test.ts` | **New** — unit tests |
| `src/main/session-manager.ts` | Inject `BranchCheckoutManager`, route in `createSession()` |
| `src/main/index.ts` | Instantiate `BranchCheckoutManager`, pass to deps |
| `src/main/ipc/agent-handlers.ts` | Register `git:list-branches`, `git:fetch-pr-branch` handlers |
| `src/preload/index.ts` | Whitelist `git:list-branches`, `git:fetch-pr-branch` |
| `src/renderer/components/NewTaskModal.tsx` | Tab UI, branch picker, PR input |
| `src/renderer/components/NewTaskModal.styles.ts` | Tab and sub-tab styles |

### Non-goals

- Reusing existing worktrees for the same branch (always creates new worktree)
- Browsing PRs from a list (user must know the PR number/URL)
- Cross-repo PR checkout (only the project's own remote)
