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
4. If screenshots or images were provided in chat, upload them and embed the links (see Uploading Images below).
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

## Uploading Images

Images pasted into the chat thread appear in the conversation as `[image: /absolute/path/to/file.png]`
references. Those files live on this machine and are readable. Before writing the issue body, upload
each relevant one:

```bash
bash .claude/skills/gh-create-issue/scripts/upload-assets.sh <path> [<path>...]
```

The script commits the files to the repo's `issue-assets` branch and prints one
`![name](https://raw.githubusercontent.com/...)` line per file. Paste those lines into the
Evidence / Screenshots section of the issue body. Notes:

- The script targets the current repo by default; pass `--repo owner/name` to override.
- It requires push access. If the upload fails, fall back to the Evidence Rules below.
- Raw links only render for public repos. For a private repo, link the committed file path instead
  and say the image requires repo access.

## Codex Live Sync

When you update this checked-in skill and the task is specifically about Codex behavior, also sync the
live installed Codex copy before concluding the work:

```bash
bash .claude/skills/gh-create-issue/scripts/sync-codex-skill.sh
```

That copies the repo's `gh-create-issue` skill into `~/.codex/skills/gh-create-issue`, brings over the
asset-upload helper script, and rewrites the installed Codex copy so its command examples point at the
Codex path instead of `.claude/...`.

Do not assume the repo's `.codex/skills` symlink updates the live home-directory Codex skill.

## Evidence Rules

- Include short logs or error text inline when useful.
- If a screenshot exists but could not be uploaded to GitHub, say so plainly.
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
