---
description: How the native Viola harness plans a goal, delegates independent tasks to isolated agent worktrees, and cross-reviews every diff.
covers: [src/main/viola, src/main/agent/runtimes.ts]
updated: 2026-09-02
owner: see .github/CODEOWNERS
---

# Viola — native multi-harness orchestration

Viola is a built-in Manifold agent harness. It is not a plugin panel and it is not a
Claude/Codex chat session with another label. Its runtime record has `id: 'viola'`,
`kind: 'orchestrator'`, and no CLI binary (`src/main/agent/runtimes.ts:38`). The New Agent list
therefore presents **Viola (alpha)** beside Claude Code, Codex, Copilot, and Gemini. The alpha
suffix belongs only to that launch button; sessions and the normal agent panel retain the Viola
identity and standard chat surface (`src/renderer/components/modals/AgentLaunchList.tsx:125`,
`src/renderer/components/editor/editor-shell/dock-agent-panel.tsx:165`).

Viola owns coordination but writes no product code. A CLI harness supplies the private
planning model call, implementation agents do the coding, and a different CLI harness reviews
each diff. The user only sees Viola as the parent identity; the selected planning runtime is
an internal dependency (`src/main/viola/harness.ts:51`).

## Availability and creation

The supported worker harnesses are Claude, Codex, Copilot, and Gemini. Runtime discovery marks
Viola available only when at least two of those binaries are installed, because one harness
cannot independently review its own work (`src/main/agent/runtimes.ts:79`). Selecting Viola
creates a normal session with `runtimeId: 'viola'` and chat mode. `SessionCreator` recognizes
the orchestrator kind, creates no PTY, and leaves the session waiting for its first goal
(`src/main/session/session-creator.ts:37`, `:126`, `:176`).

`SessionManager` routes input, interruption, and disposal for that runtime to the native harness
instead of `SessionIoController` (`src/main/session/session-manager.ts:253`). Older worktree
metadata that used the temporary `conductor` profile flag or runtime id is read only as a
migration hint and becomes `runtimeId: 'viola'` during discovery
(`src/main/session/session-discovery.ts:105`). The run store likewise reads the temporary
`conductor-runs.json` filename until a Viola snapshot is written.

## Conversation and plan gate

The first user message is the goal. Viola picks the preferred installed worker as its
planning brain, falling back to Claude and then the first available worker. The planning prompt
requires one to four standalone tasks with concrete acceptance conditions and explicitly says
that Viola itself writes no code (`src/main/viola/harness.ts:53`,
`src/main/viola/planner.ts:5`).

The response appears as an ordinary assistant message with **Start plan** and **Revise plan**
actions. Nothing is spawned while the run is `planned`; a revision is planned again and Start
is the explicit execution gate (`src/main/viola/harness.ts:131`,
`src/main/viola/engine.ts:68`). This keeps the goal workflow conversational rather than
introducing a separate form or custom webview.

## Delegation and review

1. The engine assigns tasks round-robin across the installed worker harnesses and spawns all
   implementation agents concurrently (`src/main/viola/engine.ts:104`).
2. Every implementation agent gets a fresh managed worktree forked from the Viola session's
   committed `HEAD`. The child is an ordinary visible Manifold session, not a hidden plugin
   worker (`src/main/viola/engine.ts:138`, `src/main/plugins/agent-spawn-service.ts:46`).
3. After implementation turns finish, Viola creates one reviewer agent per task on a harness
   different from its implementer. Separate sessions keep concurrent reviews and their context
   isolated. Reviewers run through Manifold's chat/print-mode path and receive the
   acceptance contract plus `git diff --binary` from the worker's captured starting SHA
   (`src/main/viola/engine.ts:180`, `:250`).
4. A blocking verdict is sent once to the original implementation agent, preserving its
   worktree and context. The same reviewer checks the new diff once more; another failure becomes
   `needs_attention` instead of an unbounded loop (`src/main/viola/engine.ts:223`).

Workers are told to test, commit, optionally push/open a PR, and never merge
(`src/main/viola/planner.ts:45`). A passing task records a discoverable PR URL, but local-only
work is valid and remains visible through its branch/worktree (`src/main/viola/engine.ts:233`).

## State, interruption, and failures

Run snapshots are stored under the parent session id in `<storageRoot>/viola-runs.json`
(`src/main/viola/store.ts:10`). A stored `running` run becomes `stopped` after an app restart
because live child turns cannot be resumed safely (`src/main/viola/engine.ts:54`).

Stop aborts an in-flight planning subprocess or active child turns. It does not merge, delete,
or rewrite worker branches/worktrees (`src/main/viola/harness.ts:110`,
`src/main/viola/engine.ts:129`). Spawn failures, timeouts, empty diffs, and failed re-reviews
remain explicit task errors or `needs_attention`; healthy siblings can still finish.

## Tests

- `planner.test.ts` pins the delegated-plan and structured-review protocols.
- `engine.test.ts` pins the two-harness precondition, plan gate, isolated parallel fan-out,
  cross-harness review, and bounded fix loop.
- Session, renderer, and chooser tests pin native runtime creation, harness routing, normal chat
  rendering, and the availability message.
