---
description: How the native Viola harness plans a goal, runs each task as its own pipeline (chat-mode worker, gates, cross-harness review), and reports progress through a live run board.
covers: [src/main/viola, src/main/agent/runtimes.ts, src/main/agent/orchestrated-args.ts, src/shared/viola.ts, src/renderer/components/viola]
updated: 2026-09-02
owner: see .github/CODEOWNERS
---

# Viola — native multi-harness orchestration

Viola is a built-in Manifold agent harness. It is not a plugin panel and it is not a
Claude/Codex chat session with another label. Its runtime record has `id: 'viola'`,
`kind: 'orchestrator'`, and no CLI binary (`src/main/agent/runtimes.ts:39`). The New Agent list
therefore presents **Viola (alpha)** beside Claude Code, Codex, Copilot, and Gemini. The alpha
suffix belongs only to that launch button; sessions and the normal agent panel retain the Viola
identity and standard chat surface (`src/renderer/components/modals/AgentLaunchList.tsx:125`,
`src/renderer/components/editor/editor-shell/dock-agent-panel.tsx:165`).

Viola owns coordination but writes no product code. The engine is deterministic TypeScript; a
model only fills in the plan and each review verdict. The plan gate, worktree isolation, gates
before review, cross-harness review, and the bounded fix loop are enforced in code, not prose.

## Availability and creation

Viola has two preconditions, and both are enforced before any model call.

The supported worker harnesses are Claude, Codex, Copilot, and Gemini. Runtime discovery marks
Viola available only when at least two of those binaries are installed, because one harness
cannot independently review its own work (`src/main/agent/runtimes.ts:93`).

The project must also be able to host managed worktrees. A project added as a plain folder
(`kind: 'folder'`) always works in place: `SessionCreator` treats it as `noWorktree` and hands
every agent the project directory itself, whatever `newWorktree` asked for
(`src/main/session/session-creator.ts:41`, `:55`). Viola's guarantees all rest on isolation, so
it refuses to plan for such a project and says to re-add it as a git project
(`src/main/viola/engine.ts:73`). Selecting Viola
creates a normal session with `runtimeId: 'viola'` and chat mode. `SessionCreator` recognizes
the orchestrator kind, creates no PTY, and leaves the session waiting for its first goal
(`src/main/session/session-creator.ts:37`, `:126`).

`SessionManager` routes input, interruption, and disposal for that runtime to the native harness
instead of `SessionIoController` (`src/main/session/session-manager.ts:253`). Older worktree
metadata that used the temporary `conductor` profile flag or runtime id is read only as a
migration hint and becomes `runtimeId: 'viola'` during discovery
(`src/main/session/session-discovery.ts:105`). The run store likewise reads the temporary
`conductor-runs.json` filename until a Viola snapshot is written (`src/main/viola/store.ts:15`).

## Conversation and plan gate

The first user message is the goal. Viola picks the preferred installed worker as its
planning brain, falling back to Claude and then the first available worker. The brain runs on
its **default model** with a ten-minute budget: the call passes no model args, because a
runtime's `aiModelArgs` are the cheap commit-message settings, not a planning model
(`src/main/viola/harness.ts:33`, `:65`). The prompt lets the brain read the repository to
ground the plan and asks for one to four tasks (`src/main/viola/prompts.ts:3`, `:15`). Each task
carries a `purpose` of `implement` or `explore`, an optional suggested `worker`, and `gates`,
the shell commands that must exit 0 before review (`src/main/viola/types.ts:4`,
`src/main/viola/prompts.ts:7`). `parsePlanResponse` rejects unknown purposes and drops workers
that are not Viola harnesses (`src/main/viola/planner.ts:5`).

The plan appears as an ordinary assistant message with the route and gates per task, plus
**Start plan** and **Revise plan** actions. Nothing is spawned while the run is `planned`; a
revision is planned again and Start is the explicit execution gate
(`src/main/viola/harness.ts:31`, `src/main/viola/engine.ts:90`).

## Task pipelines

`start` runs every task as its own pipeline and awaits them concurrently, so a finished task is
reviewed while a slower sibling is still implementing (`src/main/viola/engine.ts:102`,
`src/main/viola/task-pipeline.ts:20`). The planner's suggested worker wins when it is
installed; otherwise tasks rotate through the available harnesses
(`src/main/viola/engine.ts:127`).

Every worker is an ordinary **interactive** Manifold session — a real terminal in its own tab, so
the human can watch one or take it over mid-run (`src/main/viola/task-pipeline.ts:172`). Only Viola
itself is a chat session. Two consequences follow from that choice, and both are handled rather
than assumed away:

- **Permission prompts would stall an unattended worker.** The registry's Claude entry passes
  `--allow-dangerously-skip-permissions`, which enables bypass "as an option, without it being
  enabled by default", so a worker launched with it alone still prompts — and the turn-end
  heuristic reads that idle prompt as a finished turn, leaving Viola to review an untouched tree.
  A session carrying `orchestratedBy` therefore gets its runtime's real bypass at launch
  (`src/main/agent/orchestrated-args.ts:13`, `src/main/session/session-creator.ts:154`). Human
  launched interactive sessions are untouched and keep prompting.
- **A terminal has no chat messages to read.** A worker's report is the tail of its PTY, so it is
  stripped of escape codes and bounded before it reaches a prompt or a summary
  (`src/main/viola/harness.ts:260`).

Each spawn is verified rather than trusted. A worker that asked for a worktree but came back on
Viola's own checkout means isolation was unavailable after all, and the task fails there, before
any turn, gate, or review runs (`src/main/viola/task-pipeline.ts:176`). A worker that is not
ready within 30 seconds, or a reviewer whose spawn fails, ends the task with that underlying
error (`src/main/viola/task-pipeline.ts:188`).

- **Explore tasks** share Viola's own checkout (`newWorktree: false`), receive a read-only prompt,
  and are done when their report returns; no reviewer is involved
  (`src/main/viola/task-pipeline.ts:37`, `src/main/viola/prompts.ts:46`).
- **Implement tasks** get a fresh managed worktree forked from the Viola session's committed
  `HEAD`, and their prompt ends with a request for a file:line report and the exact verification
  commands (`src/main/viola/task-pipeline.ts:53`, `src/main/viola/prompts.ts:33`).
- **Gates** run from the worktree root through a shell with a fifteen-minute cap and a bounded
  output tail (`src/main/viola/gates.ts:13`). One red gate earns one fix turn that carries the
  command output verbatim; a gate that stays red ends in `needs_attention` without spending a
  reviewer (`src/main/viola/task-pipeline.ts:98`, `src/main/viola/prompts.ts:85`).
- **Review** spawns a reviewer on a different harness in its own fresh worktree. Viola resets
  that scratch worktree to `HEAD` and applies the implementer's diff onto it, so the reviewer can
  read surrounding files and run the gates itself (`src/main/viola/git.ts:34`,
  `src/main/viola/task-pipeline.ts:141`). Because that reset and clean are destructive, `apply`
  first proves the target is a linked worktree and refuses a main checkout, which is somebody's
  real working copy (`src/main/viola/git.ts:54`). The prompt carries the diff stat, the implementer's
  report labelled as unverified claims, and the inline diff only below 60k characters; above
  that it tells the reviewer to run `git diff` locally rather than truncating silently
  (`src/main/viola/prompts.ts:5`, `:57`). A blocking verdict is sent once to the original
  implementer, the same reviewer re-reviews the fresh diff, and another failure becomes
  `needs_attention` (`src/main/viola/task-pipeline.ts:81`).
- **The verdict travels through a file, not the transcript.** A verdict has to be machine-readable,
  and a terminal worker's scrollback is screen redraws and box drawing, so hunting a JSON object in
  it is guesswork. The reviewer is told the exact path to write, and writing it is the one edit it
  is allowed; Viola clears any previous verdict first so a re-review cannot read the stale one, and
  falls back to parsing the reply only when no file was written
  (`src/main/viola/verdict-store.ts:20`, `src/main/viola/task-pipeline.ts:145`).

Workers are told to test, commit, optionally push/open a PR, and never merge. A passing task
records a discoverable PR URL, but local-only work is valid and remains visible through its
branch/worktree.

## Progress: a live board, not a rotating phrase

A worker turn has a thirty-minute budget, so a run can sit in one state for a long time. The chat
pane's default indicator only cycles random phrases from a 600-item list, and its elapsed badge
renders solely once the agent has *stopped*, so a long step looked indistinguishable from a hang.

The engine publishes a full run snapshot on every state change. The harness splits that stream in
two (`src/main/viola/harness.ts:192`):

- **The live board** gets every snapshot, pushed to the renderer on `viola:run`
  (allow-listed in `src/preload/index.ts:169`). Each task carries `stateSince`, stamped by the one
  helper every transition goes through, so the clock can never drift from the state
  (`src/shared/viola.ts:46`, `src/main/viola/task-pipeline.ts:197`).
- **The chat log** gets milestones only — done, needs attention, failed
  (`src/main/viola/format.ts:42`). Repeating in-flight states in a transcript that only grows
  buries the outcomes; the board updates in place instead.

On the renderer side a module-level store owns the subscription
(`src/renderer/components/viola/viola-run-store.ts`). It attaches on first use rather than at
import, and never detaches: a per-component listener would go deaf whenever the user switched
tabs, so returning to a Viola tab mid-run would show a board several states stale. `ViolaRunBoard`
renders one row per task — title, step, harness, and a clock that ticks every second, which is
what distinguishes a slow step from a dead one. A row opens its worker's own session through the
dock's `onOpenSibling`, since Viola's children are ordinary visible sessions. A fixing row names
the blocking finding it is addressing, the one detail that used to reach the chat log. The board
is passed to `ChatPane` as its `activity` slot, so it replaces the phrases for Viola only and
every other runtime is untouched (`src/renderer-shared/chat/ChatPane.tsx:183`).

The final summary still lists each task's route, PR or error, and quotes explore reports inline
(`src/main/viola/format.ts:28`).

## Guardrails

Manifold cannot intercept a worker's tool calls, so the guard rides on the worker's own CLI.
`spawnAgent` marks every Viola worker with `orchestratedBy` (`src/main/plugins/agent-spawn-service.ts:92`),
persisted in worktree meta and restored on discovery (`src/main/session/session-creator.ts:245`,
`src/main/session/session-discovery.ts:132`). Chat-mode Claude turns for such sessions add
`--settings` with a `permissions.deny` list covering force-push, remote-ref hard resets,
recursive deletes of root or home, and `gh pr merge` (`src/main/agent/simple-runtime.ts:14`,
`:51`, `src/main/app/dev-server-manager.ts:185`). Claude enforces deny rules in every permission
mode, including bypass; the other CLIs have no equivalent hook and stay prompt-guarded only. The
fan-out cap is `MAX_TASKS` (`src/main/viola/prompts.ts:3`).

## State, interruption, and failures

Run snapshots are stored under the parent session id in `<storageRoot>/viola-runs.json`
(`src/main/viola/store.ts:15`). A stored `running` run becomes `stopped` after an app restart
because live child turns cannot be resumed safely (`src/main/viola/engine.ts:53`).

Stop aborts an in-flight planning subprocess, active child turns, and running gates. It does
not merge, delete, or rewrite worker branches/worktrees (`src/main/viola/harness.ts:110`,
`src/main/viola/gates.ts:17`). Spawn failures, timeouts, empty diffs, red gates, and failed
re-reviews remain explicit task errors or `needs_attention`; healthy siblings still finish.

## Tests

- `prompts.test.ts` and `planner.test.ts` pin the plan/review protocol, the explore and gate
  fields, and the no-silent-truncation rule.
- `engine.test.ts` pins the two-harness precondition, plan gate, chat-mode fan-out, per-task
  pipelining, gates before review, explore reports, worker routing, and the bounded fix loop.
- `harness.test.ts` pins the default-model planner call, live progress lines, and the summary.
- `git.test.ts`, `gates.test.ts`, and `verdict-store.test.ts` run real git, real shell commands,
  and real files in temp repos, including a linked-worktree apply, the refusal to touch a main
  checkout, and the clear-before-review that prevents a stale verdict.
- `orchestrated-args.test.ts` and `session-creator.test.ts` pin that an orchestrated interactive
  worker gets a real bypass while a human-launched session keeps prompting.
- `ViolaRunBoard.test.tsx` pins the row contents, the ticking clock, the click-through, and the
  states that render nothing; `viola-run-store.test.ts` pins snapshot caching across remounts and
  malformed-payload tolerance; `ChatPane.test.tsx` pins the activity slot replacing the phrases.
  `ViolaRunBoard.fixture.tsx` backs `npm run screenshot:component ViolaRunBoard`.
- `engine.test.ts` and `harness.test.ts` pin both preconditions and the non-isolated-spawn abort.
- Session, renderer, and chooser tests pin native runtime creation, harness routing,
  `orchestratedBy` persistence, and the guarded Claude turn.
