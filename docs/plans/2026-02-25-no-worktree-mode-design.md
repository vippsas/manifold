# No-Worktree Mode Design

## Problem

Manifold always creates a git worktree for each agent session. Sometimes users want to run an agent directly in the project's main checkout directory without worktree isolation — e.g., for quick tasks on the current branch, or when worktree overhead is unwanted.

## Solution

Add a `noWorktree` flag that lets the agent run in the project's main directory, checking out a branch with `git checkout` instead of `git worktree add`.

## Constraints

- Only one no-worktree agent at a time per project (shared working directory).
- On session kill/exit, leave the branch as-is — no automatic switch back.

## Shared Types

Add `noWorktree?: boolean` to both `SpawnAgentOptions` and `AgentSession` in `src/shared/types.ts`.

## UI (NewTaskModal)

Add a "No worktree (run in project directory)" checkbox, independent of the existing "Continue on an existing branch or PR" checkbox.

| useExisting | noWorktree | Behavior |
|---|---|---|
| false | false | Current default: new worktree + new branch |
| true | false | Current: worktree from existing branch/PR |
| false | true | New `manifold/...` branch from current branch in project dir (show info note) |
| true | true | Branch list with `main` enabled; checkout selected branch in project dir |

### BranchPicker

Add `allowBaseBranch?: boolean` prop. When true, stop disabling the base branch so the user can select `main`.

### canSubmit

When `noWorktree && !useExisting`, no branch selection is required. Show info text: "A new branch will be created from the current branch in your project directory."

## SessionManager.createSession()

New code path before existing worktree logic:

```
if (options.noWorktree) {
  if (options.existingBranch) {
    git checkout <branch> in project.path
  } else {
    git checkout -b manifold/<name> in project.path
  }
  worktree = { branch, path: project.path }
}
```

`worktreePath` is set to `project.path`.

## SessionManager.killSession()

Skip `worktreeManager.removeWorktree()` when `session.noWorktree` is true. Only kill PTY and clean up watchers.

## SessionManager.discoverSessionsForProject()

No changes. No-worktree sessions won't be discovered after restart since they have no worktree directory. This is fine — nothing to clean up.

## InternalSession / buildSession()

Set `noWorktree` from `options.noWorktree`. Propagated to `AgentSession` via `toPublicSession()`.

## Worktree metadata

Still write `.manifold.json` in the project directory for runtime info persistence.
