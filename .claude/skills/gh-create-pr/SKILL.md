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

## Base Branch Default

Unless the user explicitly asks for another base branch, assume the PR should target `main`.

That default affects both:

- the branch you prepare locally
- the base branch you pass when creating the PR

Do not silently target a feature branch or the current branch's upstream just because that is where the worktree started.

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
2. Determine the intended base branch. Default to `main` unless the user specified another base.
3. Fetch the latest remote state for that base branch before preparing the PR branch.
4. If the PR targets `main`, check whether the local branch needs to be rebased, merged, or recreated from the latest `origin/main`.
5. If needed, create a clean fix-named branch from the intended base branch.
6. Stage only the intended changes.
7. Commit with a message that describes the main fix.
8. Push the fix-named branch to origin.
9. Create the PR against the requested base branch.
10. Link related issues in the PR body when appropriate.

## Codex Live Sync

When you update this checked-in skill and the task is specifically about Codex behavior, also sync the
live installed Codex copy before concluding the work:

```bash
bash .claude/skills/gh-create-pr/scripts/sync-codex-skill.sh
```

That copies the repo's `gh-create-pr` skill into `~/.codex/skills/gh-create-pr` so the next Codex
session uses the updated instructions.

Do not assume the repo's `.codex/skills` symlink updates the live home-directory Codex skill.

## Sync Requirement For `main`

When the PR should target `main`, do not open the PR until you have checked whether the work needs to be brought up to date with `origin/main`.

Minimum expectation:

- run `git fetch origin main`
- compare the working branch against `origin/main`
- if the branch is behind, decide whether to rebase onto `origin/main`, merge `origin/main`, or create a fresh branch from `origin/main` and move the change there

Preferred order:

1. Rebase onto `origin/main` when that is safe and consistent with the repo workflow.
2. If rebasing is not appropriate, at least merge or pull the latest `main` changes into the branch before opening the PR.
3. If the current branch is noisy, unrelated, or based on the wrong branch, create a new fix-named branch from the updated `main` and continue there.

Do not assume the current worktree branch is current enough just because it already has an upstream.

## Branch Selection

Before pushing:

- If the current branch already cleanly matches the fix, keep it.
- If the PR should target `main`, prefer a branch that is based on the latest `origin/main`.
- If it does not match the fix, create a new branch with a fix-based name.
- If the current branch was forked from the wrong base, create a new fix-based branch from the intended base instead of opening the PR from the old branch.
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
