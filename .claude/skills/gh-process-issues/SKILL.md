---
name: gh-process-issues
description: Sweep the GitHub issue queue and deliver one reviewable PR per labeled issue. Use when running the autonomous issue pipeline's self-firing sweep (scheduled or on demand), or when asked to process issues labeled `llm-github-issue`.
---

# Process LLM GitHub issues

The issue-tracker half of Manifold's self-firing agents (design: `docs/llm-github-issues.md`).
A human curates the queue by labeling an issue `llm-github-issue`; everything after the
label is autonomous. **The label fires the work; the human only answers questions in the
thread and merges the PR.** There is no chat to ask in — the conversation lives in the
issue thread, so the pipeline runs with no interactive prompts: every ambiguity resolves
to either a documented assumption or a `feedback-needed` stop.

## The state machine (read it from `gh`, no memory of past runs)

| State | How to read it | Move |
| --- | --- | --- |
| **Queued** | open + `llm-github-issue`, no `feedback-needed`, no open PR with `Fixes #n` | process |
| **Blocked** | `feedback-needed` present | skip — waiting on a human |
| **Delivered** | an open PR closes it | skip — review pending |
| **Done** | PR merged, issue auto-closed | leaves every query |

```bash
# The queue
gh issue list --label llm-github-issue --state open --json number,title,labels
# Per issue: blocked or already delivered?
gh issue view <n> --json labels,closedByPullRequestsReferences
gh pr list --search "Fixes #<n> in:body" --state open
```

Statelessness is the point — a sweep can crash, run twice, or run from another machine;
the tracker holds all the state.

## Sweep (scheduled daily, or on demand)

1. List the queue and classify each issue against the table above.
2. **Nothing Queued ⇒ stop.** No comments, no noise.
3. Process each Queued issue. **One issue → one PR.** When several Queued issues touch the
   same files, prefer one collective PR closing all of them (`Fixes #a`, `Fixes #b`); if
   branches have already diverged, comment on each PR/issue declaring the merge order.

## Process (per issue)

1. **Branch.** Work on `issue/<n>-<slug>` (an isolated worktree when running locally).
2. **Understand first.** Read the full thread — body *and* every comment — not just the title.
3. **Reproduce second.** Attempt a failing test, a scripted run, or drive the built app
   (the `verify` skill). A successful repro becomes the verification baseline ("this now
   passes"). A failed repro is posted to the thread as a comment (what was tried, on what)
   and work continues — non-reproducibility is recorded honestly, never hidden.
4. **Spec → plan, sized to the issue.** A trivial fix goes straight to a one-line plan
   comment. Anything with design surface gets a short spec comment, then a plan comment.
   Record every assumption made for a minor ambiguity in the spec comment.
5. **Implement.** Surgical changes only, on the branch.
6. **Verify (the `testing` skill).** Run the suite *before* changing anything for a
   baseline, then the suite **and** the typecheck gates after. Re-run the reproduction and
   confirm it now passes.
7. **Deliver (the `gh-create-pr` skill).** One PR, `Fixes #n` in the body, evidence
   attached: test output, the reproduction now passing, and before/after screenshots for
   user-facing issues (the `verify` skill). Post a comment on the issue linking the PR.

## Never ask synchronously

Two outcomes only, never a blocking question in a chat:

- **Minor ambiguity** → decide, and record the assumption in the spec comment and the PR.
- **Blocking ambiguity** — information only the reporter has, or a destructive /
  user-visible choice — → post the concrete question as a comment, add the
  `feedback-needed` label, and **stop work on that issue.** A human answers in the thread
  and removes the label; the next sweep resumes with the full thread as context.

## Rules

- **The label is the contract.** No `llm-github-issue`, no processing.
- **Raw sources are read-only.** The issue body and the human comments are the reporter's
  words — comment on them, but never edit, freshen, or close them.
- **Thread artifacts are point-in-time.** Like the wiki's frozen specs, the
  reproduction / spec / plan comments are never edited after posting — the PR diff is
  what's current.
- **The human merges.** The agent delivers a PR plus a linking comment; it never merges,
  never closes an issue directly, and never edits an issue body.
- **GitHub is the log.** No per-run `log.md` entry — every comment, label event, and PR is
  already the audit trail.
- The schema is alive: rules that survive a few sweeps get promoted into
  `CLAUDE.md` / `AGENTS.md`; the rest are dropped.
