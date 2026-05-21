---
name: gh-create-pr
description: Create GitHub pull requests for completed fixes or features. Use when the user asks to prepare, push, or open a PR and the result should include a meaningful remote branch name, commit, and PR title tied to the actual bug fix or main change rather than an agent or worktree name.
---

# GitHub PR Creation

Create PRs with names that describe the fix, not the agent or workspace.

## When To Use

Use this skill when the user asks to:

- create a PR
- prepare a branch and open a PR
- push a fix and submit it against `main` or another base branch

Do not use it for issue creation only.

## Naming Rules

The branch pushed to the remote should be named after the bug fix or primary change.

Good examples:

- `fix-codex-mcp-env`
- `fix-better-sqlite3-node-26`
- `fix-split-view-terminal-editor`
- `update-session-layout-persistence`

Bad examples:

- `agent-issue-template`
- `codex-worktree-123`
- `manifold-kristiansand`
- `adam-temp-branch`

If the current local branch name is unrelated or noisy, create or switch to a clean fix-named branch before committing and pushing.

Use a `manifold/` prefix only if the repository convention requires it. The important part is that the suffix clearly describes the fix.

## PR Title Rules

The PR title should match the main bug fix or change, not the branch name accident or implementation process.

Good examples:

- `fix: codex manifold-orchestrator MCP startup`
- `build: update better-sqlite3 for Node 26 support`
- `fix: keep agent terminal and editor visible in split view`

Avoid titles like:

- `agent fixes`
- `worktree cleanup`
- `branch sync`
- `codex changes`

## Workflow

1. Check `git status` and current branch.
2. Fetch the latest base branch if the user asked for the latest `main` or latest base.
3. If needed, create a clean fix-named branch from the intended base branch.
4. Stage only the intended changes.
5. Commit with a message that describes the main fix.
6. Push the fix-named branch to origin.
7. Create the PR against the requested base branch.
8. Link related issues in the PR body when appropriate.

## Branch Selection

Before pushing:

- If the current branch already cleanly matches the fix, keep it.
- If it does not match the fix, create a new branch with a fix-based name.
- Do not open a PR from an unrelated branch just because the changes happen to be there.

## PR Body

Prefer a short PR body with:

- `## Summary`
- `## Testing`
- issue links such as `Closes #123` when correct

Keep it factual and concise.

## Quality Bar

- Remote branch name should be understandable without knowing the agent context.
- PR title should let a reviewer infer the user-facing bug or primary fix.
- If the fix only resolves one issue from a broader dependency family, say so explicitly in the PR body.
