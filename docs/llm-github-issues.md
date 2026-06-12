# LLM GitHub Issues for Manifold — autonomous issue processing

A pattern for operating Manifold's issue tracker as an LLM-drained queue: a scheduled
agent reads every issue labeled `llm-github-issue`, understands and reproduces it, specs
and implements a fix, and delivers one reviewable PR per issue — without ever asking a
question in a chat, because nobody is in the chat.

This file is self-contained — hand it to your agent and instantiate the specifics
together.

## Starting point: issues aren't unworked — they're worked in the wrong mode

Today an issue gets processed when a human reads the tracker, picks one, opens an agent
session, and feeds it in. That costs synchronous attention twice: once to start the work,
and again for every question the agent asks mid-task. The tracker is a queue with no
consumer — the human is the consumer, the scheduler, and the message bus all at once.

The llm-wiki (docs/llm-wiki.md) already proved the better shape on documentation drift: a detectable signal, a
scheduled agent, one PR per item, a human who only approves. The difference here is where
the signal comes from. The wiki computes staleness from git; an issue queue cannot be
computed — deciding *which* issues an agent should own is curation. So the human's act of
curation **is** the signal: adding the label puts the issue in the queue, and everything
after the label is autonomous.

## The one change that matters: every human touchpoint becomes asynchronous state

An interactive session blocks on its human. An autonomous one cannot — so the whole
pattern is a single inversion: **the conversation moves out of the chat and into the
issue thread.**

- Work starts from a **label**, not a prompt: `llm-github-issue` (created at bootstrap
  if missing).
- A question becomes **state**, not a blocker: post a comment asking it, add the
  `feedback-needed` label, skip the issue — the sweep moves on.
- An answer arrives as a **comment**: the human replies in the thread and removes
  `feedback-needed`; the next sweep picks the issue up with the full thread as context.
- Delivery is a **PR**, never a merge: the review gate is unchanged.

Because every touchpoint is asynchronous, the pipeline must run with no interactive
mechanism at all — no clarifying questions, no plan-approval gates. Ambiguity resolves to
exactly one of two things: a documented assumption, or a `feedback-needed` stop.

## The three layers

- **Raw sources** (read-only truth): the issue body and the human comments — the
  reporter's words; the agent comments on them but never edits or closes them — plus the
  code, the test suite, and CI.
- **The work products** (LLM-produced): reproduction notes, specs, and plans posted as
  issue comments, and the branch + PR carrying the evidence. Thread artifacts are
  point-in-time by nature — the wiki's frozen-spec rule applies: they are never
  freshened; the PR diff is what's current.
- **The schema** (the rules): the state machine and rules below, operated by the skill,
  promoted into `CLAUDE.md` / `AGENTS.md` as they survive cycles.

## The state machine (measurable from `gh`)

Four states, all queryable, so the sweep needs no memory of previous runs:

| State | Meaning | Next move |
| --- | --- | --- |
| **Queued** | open + `llm-github-issue`, no `feedback-needed`, no open PR referencing it | process |
| **Blocked** | `feedback-needed` present | skip until a human answers and removes the label |
| **Delivered** | an open PR closes it (`Fixes #n`) | skip — review pending |
| **Done** | PR merged; `Fixes #n` auto-closed the issue | leaves every query |

```bash
# The queue
gh issue list --label llm-github-issue --state open --json number,title,labels
# Already delivered? (an open PR references it ⇒ skip)
gh issue view 123 --json closedByPullRequestsReferences
gh pr list --search "Fixes #123 in:body" --state open
```

Statelessness is the point: a sweep can crash, run twice, or run from another machine —
the tracker holds all the state.

## The schema (the actual rules)

**1. The label is the contract.** Only issues labeled `llm-github-issue` enter the
queue. No label, no processing — labeling is the human's deliberate hand-off.

**2. Understand first, reproduce second.** Read the full thread, not just the body. Then
attempt reproduction — a failing test, a scripted run, or driving the built app. A
successful reproduction becomes the verification baseline ("this now passes"). A failed
one is posted to the thread as a comment (what was tried, on what) and work continues —
non-reproducibility is recorded honestly, never silently.

**3. Spec → plan → implement, in the thread.** Sized to the issue: a trivial fix can go
straight to a plan; anything with design surface gets a short spec comment, then a plan
comment, then implementation in an isolated worktree on its own branch
(`issue/<n>-<slug>`).

**4. Never ask synchronously.** A minor ambiguity → decide, and record the assumption in
the spec comment and the PR. A blocking ambiguity — information only the reporter has, or
a destructive / user-visible choice — → post the concrete question as a comment, add
`feedback-needed`, and stop work on that issue. The human answers in the thread and
removes the label; the next sweep resumes.

**5. Tests before and after; evidence in the PR.** Run the suite before changing
anything to establish the baseline (the `testing` skill says how), and the suite plus the
typecheck gates after. The PR carries the evidence: test output, the reproduction now
passing, and before/after screenshots (the `verify` skill drives the built app) when the
issue is user-facing.

**6. One issue → one PR**, `Fixes #n` in the body. Overlap rule: when several queued
issues touch the same files, prefer one collective PR closing all of them (`Fixes #a`,
`Fixes #b`); if the work has already diverged onto separate branches, post a comment on
each PR and issue declaring which PR must merge first.

**7. The human merges.** The agent never merges, never closes an issue directly, and
never edits an issue body. Delivery is a PR plus a comment on the issue linking it.

**8. GitHub is the log.** Unlike the wiki, there is no `log.md` entry per run — every
action already leaves its audit trail in the tracker (a comment, a label event, a PR).

## Operations

- **Sweep** (scheduled, once a day): query the queue, classify every labeled issue
  against the state machine, process the queued ones.
- **Process** (per issue): worktree → understand → reproduce → spec → plan → implement →
  verify.
- **Deliver:** one PR per issue (or one collective PR per overlap group), evidence
  attached, delivery comment on the issue.
- **Unblock** (the only human operation mid-flight): answer in the thread, remove
  `feedback-needed`.

## Bootstrapping (first move)

This document is the design; none of the machinery exists yet. In order:

1. **Create the labels.** `gh label create llm-github-issue` (the queue) and
   `gh label create feedback-needed` (blocked on a human), with descriptions.
2. **Write the skill.** One checked-in skill, `gh-process-issues` — the sweep plus the
   per-issue pipeline — mirroring `wiki-doc-sync`'s shape and reusing the existing
   `testing`, `verify`, and `gh-create-pr` skills. Split into separate sweep and
   per-issue skills only if it outgrows one page.
3. **Schedule the routine.** A scheduled run firing `/gh-process-issues` once a day,
   exactly as the wiki's doc-sync routine fires `/wiki-doc-sync`. This step is not
   optional: the routine is the queue's only consumer — without it the label is just a
   label and nothing fires.
4. **Trial on one issue.** Label one small, reproducible issue and watch a full cycle —
   label → reproduction comment → PR with evidence — before trusting the system with a
   real queue.

## Principles

The same division of labor as the wiki, with sharper edges because the agent ships code,
not prose. The human curates the queue (labels issues in), answers questions (in the
thread), and approves PRs; the agent does everything in between and is never trusted to
merge. GitHub is the substrate: labels are the state machine, comments are the message
bus, PRs are the review gate, and `Fixes #n` is the lifecycle wiring — review, audit
history, and revert come for free. And the schema is alive — rules that survive a few
sweeps get promoted into `CLAUDE.md` / `AGENTS.md`; the rest are dropped.
