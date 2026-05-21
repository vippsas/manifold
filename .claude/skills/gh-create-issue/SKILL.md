---
name: gh-create-issue
description: Create GitHub issues from agent findings, bugs, regressions, UX problems, or follow-up work. Use when the user asks to create, file, or draft a GitHub issue and the result should be a structured issue body plus a `gh issue create` command.
---

# GitHub Issue Creation

Create issues with a concrete, reproducible body instead of a one-line summary.

## When To Use

Use this skill when the user asks to:

- create a GitHub issue
- file a bug
- report an agent-found problem
- draft an issue body for manual review

Do not use it for PRs, code reviews, or release notes.

## Workflow

1. Gather the minimum factual context first.
2. Prefer concrete repro steps, observed behavior, expected behavior, and scope.
3. If the repo has an issue template, mirror its structure rather than inventing a new format.
4. If screenshots or images were provided in chat, note whether they are actually uploadable.
5. Write the issue body to a temp markdown file.
6. Create the issue with `gh issue create --body-file ...`.
7. Return the created issue URL to the user.

## Structure

Unless the repository clearly uses a different format, prefer sections like:

- `## Summary`
- `## Issue Type`
- `## Priority`
- `## Agent Context`
- `## Area`
- `## Expected Behavior`
- `## Actual Behavior`
- `## Steps to Reproduce`
- `## Evidence`
- `## Frequency`
- `## Suspected Cause`
- `## Suggested Next Step`
- `## Validation After Fix`

Keep issue bodies factual. Avoid speculative root causes unless labeled as suspicion.

## Evidence Rules

- Include short logs or error text inline when useful.
- If a screenshot exists but is not actually uploaded to GitHub, say so plainly.
- Do not claim an image is attached unless the issue body contains a real image link or upload.

## Command Pattern

Use a temp file for the body:

```bash
gh issue create --repo <owner/repo> --title "<title>" --body-file /private/tmp/<file>.md
```

If a `--template` flag conflicts with `--body-file`, prefer the explicit rendered body file.

## Quality Bar

- Title should identify the user-facing problem, not the investigation process.
- Repro steps should be short and ordered.
- Validation should explain how to know the fix worked.
- Mention worktree path, branch, runtime, or model only when they help reproduce or scope the issue.
