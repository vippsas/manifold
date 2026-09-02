---
description: How Manifold agent sessions are created, run, stopped, resumed, and rediscovered from on-disk worktrees — as tenants of a workspace's checkout, which they never create or remove.
covers: [src/main/session]
updated: 2026-09-02
owner: see .github/CODEOWNERS
---

# Session — agent session lifecycle

A *session* is one running (or dormant) agent: a runtime process attached to a git
worktree (or, for `noWorktree`/folder projects, the repo directory itself). This
subsystem owns the in-memory session map, the PTY wiring that streams agent output
to the renderer, and the logic that rebuilds sessions from disk on the next launch.

**A session is a tenant, not an owner.** The checkout it works in belongs to a workspace,
which cut it when it was created and removes it when it is removed
(`src/main/workspace/workspace-manager.ts:38`, `:69`). Several agents share one checkout the way
several people share one desk, so closing an agent leaves the place exactly as it was. Worktree
creation/removal itself lives in `src/main/git` — and on the ordinary path this code no longer
calls into it at all.

## Covered code

- `src/main/session/session-manager.ts` — `SessionManager`, the façade that holds the `Map<string, InternalSession>` and delegates to the helpers below.
- `src/main/session/session-lifecycle.ts` — `SessionLifecycle`: create/resume orchestration (resume in-flight dedup, dismissal clearing, verdict adoption). It's a permissive create primitive; the one-in-place-agent-per-repo policy is enforced at the `agent:spawn` IPC layer.
- `src/main/session/session-creator.ts` — `SessionCreator.create()`: resolves worktree + runtime, spawns the PTY, writes worktree meta.
- `src/main/session/session-discovery.ts` — `SessionDiscovery`: rebuilds dormant sessions by scanning worktrees on disk.
- `src/main/session/session-resume.ts` — `resumeAgentSession()` (re-spawn an interactive runtime) and `createShellPtySession()`.
- `src/main/session/session-killer.ts` — `SessionKiller`: tears down a session and leaves its checkout alone.
- `src/main/session/session-teardown.ts` — `SessionTeardown`: simple/developer-mode kill paths that auto-commit then checkout base.
- `src/main/session/session-stream-wirer.ts` — `SessionStreamWirer`: attaches PTY `onData`/`onExit` handlers, status/url/dir detection, NDJSON parsing.
- `src/main/session/session-io-controller.ts` — `SessionIoController`: input/interrupt/resize routing, post-SIGINT drain.
- `src/main/session/session-working-set.ts` — `SessionWorkingSet`: pushes a folder added to a workspace into the agents already running in it, and reports how far it got.
- `src/main/session/session-types.ts` — `InternalSession` (superset of the public `AgentSession`).
- `src/main/session/session-public.ts` — `toPublicSession()`: strips internal fields before returning over IPC.
- `src/main/session/session-meta-persister.ts` — `persistSessionMeta()`: writes worktree meta after a mutation.
- `src/main/session/transcript-usage-reader.ts` — `readClaudeTranscriptUsage()` (+ a `…Sync` variant for quit): sums token usage + counts human turns from Claude's on-disk JSONL transcript (deduped by `message.id`), located via the session id we spawn with (`locateClaudeTranscript()`). It additionally returns `byRate` (`ClaudeSessionUsage`, `:24`), the same tokens bucketed by model, speed, and cache-write duration for pricing (`:143`). The duration split matters: Claude Code writes **1-hour** caches (2x input), not 5-minute ones (1.25x), so the transcript's `usage.cache_creation.ephemeral_{5m,1h}_input_tokens` is read rather than the flat `cache_creation_input_tokens`; a transcript that predates the split bills as 5-minute (`:132`).
- `src/main/session/model-pricing.ts` — `estimateCostUsd()` (`:109`) turns per-model token buckets into a dollar estimate from a checked-in table of Anthropic's published per-MTok rates (`STANDARD` `:58`, the Opus-only fast-mode tier `FAST` `:73`). `rateKey()` (`:84`) is the bucket key — the model id, suffixed `#fast` when the turn ran in fast mode; `undated()` (`:89`) prices a dated snapshot id off its dateless form. An unknown model returns `usd: null` and is named in `unpricedModels` rather than priced by guess.
- `src/main/session/session-cost.ts` — `readSessionCost()` (`:23`): the live per-session estimate behind the agent tab's hover. Claude-only (`:24`), and transcript-only by design — the live accumulator is destructive, so reading it here would steal usage from the verdict recorder.
- `src/main/session/codex-usage-reader.ts` — `readCodexUsage()` (+ sync variant): locates Codex rollout JSONL via `~/.codex/state_5.sqlite`, parses token counts, and sums matching rollouts.
- `src/main/session/session-usage-accumulator.ts` — `SessionUsageAccumulator`: live token/turn tally for chat-mode turns; Claude adds per result, Codex replaces cumulative per-run totals before drain.
- `src/main/session/verdict-pr-verifier.ts` — `verifyVerdictPullRequests()`: re-checks cached `pr_created` verdicts with stored PR URLs, stamps PR freshness metadata, and flips merged PRs to `outcome: 'merged'`.

Not detailed here: `shell-*` (Manifold's AI shell prompt/suggestions), `nl-command-translator.*`, and `verdict-recorder.*` (per-session run records). They are session helpers, not the lifecycle core. **Cost estimation (the agent tab's hover):** Claude's transcript records tokens and `message.model`, never a price, so cost is derived, not read. `agent:session-usage` (`ipc/usage-handlers.ts`) → `readSessionCost()` → `readClaudeTranscriptUsage()` → `estimateCostUsd()`. The read is on hover, not on a timer, and it never touches `SessionUsageAccumulator` — `take()` (`session-usage-accumulator.ts:40`) deletes what it returns, so a hover served from it would silently zero the usage the verdict recorder writes at termination. Two honesty constraints the code keeps: an unrecognised model yields no number at all, and the figure is what the API *would* charge — on a subscription plan it is not money spent, which the tooltip says. The price table is checked in, so it goes stale when Anthropic changes rates or ships a model. **Token-usage capture (#728):** interactive Claude is spawned with `--session-id <session.id>` (`session-creator.ts:136`) so its transcript is locatable, and resume passes `--resume <session.id>` when that transcript exists (`session-resume.ts:69`). Codex chat-mode JSONL handles `event_msg/user_message` and `event_msg/token_count` in the stream dispatcher (`session-stream-json.ts:132`, `:138`), maps cumulative totals in `recordCodexTokenCount()` (`codex-stream-usage.ts:41`), and stores them with `SessionUsageAccumulator.replaceRun()` (`session-usage-accumulator.ts:31`). At termination the app-level resolver drains live usage first, then falls back to Claude transcript usage or Codex rollout usage (`app/index.ts:112`, `:117`, `:120`), using the created/terminated timestamps passed by `VerdictRecorder` (`verdict-recorder.ts:165`, `:208`). Codex rollout lookup prefers a persisted thread id when available, otherwise matches `cwd`, `source IN ('cli', 'exec')`, and the Manifold session time window in `state_5.sqlite` (`codex-usage-reader.ts:96`, `:102`). The Codex thread id is stored in worktree meta (`worktree-meta.ts:22`, `session-meta-persister.ts:17`) and restored during discovery (`session-discovery.ts:121`, `:163`). Because a normal quit kills PTYs without firing `agent:exit`, `before-quit` first calls `finalizeAllForQuitSync()` (`verdict-recorder.ts:203`, via `sessionManager.finalizeActiveVerdictsForQuit()` at `app-lifecycle.ts:90`) to write active sessions' usage synchronously (`VerdictStore.upsert` is a synchronous atomic write). PR verification is a separate, user-triggered cache refresh: `verifyVerdictPullRequests()` filters `pr_created` records with a stored `metrics.prUrl`, uses URL-based status lookup so renamed/deleted branches do not matter, records `prCheckedAt`/`prState`/failure metadata, and updates only merged PRs to `merged` (`verdict-pr-verifier.ts:16`, `:27`, `:35`). One cross-cutting note: the zsh prompt generated by `shell-prompt.ts` seeds its segment toggles at spawn but re-sources the shared `~/.manifold/shell-prompt-segments.zsh` (`shell-prompt-config.ts:13`) whenever it changes, so prompt-segment settings reach already-running shells at their next prompt render (settings-handlers writes that file at boot and on updates).

## How it works

`SessionManager` is the only public entry point. Its constructor builds and owns every
helper, passing each the shared `this.sessions` map and lambdas (`sendToRenderer`,
`getChatAdapter`, etc.) so they stay decoupled from the manager
(`session-manager.ts:48`). Memory/verdict/dismissal collaborators are wired post-construction
via setters (`setMemoryCapture`, `setVerdictRecorder`, `setDismissedAgents`, `setGitOps`, …).

**Create.** `createSession()` delegates to `SessionLifecycle.createSession()`
(`session-manager.ts:192`, `session-lifecycle.ts:38`), which resolves the project then calls
`SessionCreator.create()` (`session-creator.ts:36`). `noWorktree` agents run directly in the
repo and share one working tree, which can only be on one branch at a time — so there is **one
in-place agent per repo**. The `agent:spawn` IPC's `focusOrClearInPlaceSessions`
(`agent-handlers.ts`) enforces this: when a *live* in-place session exists it **focuses** it
(returns it) if the new spawn targets the same branch or no specific branch, but **throws** if a
*different* branch/PR was requested (can't run two in-place agents) — the form also blocks that
selection up front. Otherwise it clears *finished* in-place sessions before the spawn so discovery
cannot resurrect them. Concurrent no-worktree spawns for one project are serialized
(`noWorktreeSpawnsInFlight`) so two racing spawns can't both create in-place agents. The
creator resolves a worktree from the many `SpawnAgentOptions`
shapes — existing path, `stayOnBranch`, `existingBranch` (legacy "launch on this branch"),
PR checkout, the **no-worktree base-branch model**, or a fresh `WorktreeManager.createWorktree()`
— then resolves the runtime via `getRuntimeById()`. The two shapes that matter now are the two
a workspace sends: `existingWorktreePath` (join the workspace's checkout) and
`noWorktree` + `stayOnBranch` (a home workspace, i.e. the clone). Those are now the **only two
shapes the UI produces at all** — every launch goes through `workspace:spawn-agent`, which
chooses between them from the workspace itself (`workspace-manager.ts:225`). The New Agent form
sends no worktree, branch or PR option of its own, so both the trailing `createWorktree()`
fallback (`session-creator.ts:113`) and the base-branch model below are left to direct
IPC/plugin callers. The fresh-worktree fallback starts from `options.baseBranch` when supplied,
otherwise from the project's base branch (`session-creator.ts:113`). Viola uses that direct
path so every delegated worktree starts from its base agent's committed `HEAD` rather than
silently falling back to the repository default.

**No-worktree base-branch model** (no longer reachable from the UI; kept for IPC/plugin
callers). The agent's base branch is `options.baseBranch` or the project's base branch. With a blank name
(`options.autoName`) the agent **works directly on that base branch** (`git checkout <base>`, no
new branch) and is named after it. With a typed name it **cuts a new branch off the base**
(`git checkout -b <slug> <base>`). Both paths assert a clean tree first unless
`options.allowDirtyWorktree` — so switching the shared working
copy never silently carries uncommitted changes onto the base. Either way the base becomes the session's `baseBranch`
(`session-creator.ts`), which `toPublicSession` carries so the session-scoped git handlers
(diff/PR/ahead-behind) compare against it instead of the project base. The blank-name placeholder
prompt is only a fallback and is never stored as the task, so the agent is identified by its branch
(the sidebar falls back to the branch label when there's no task/displayName). No random-city
branches are created for no-worktree agents.
Chat-mode sessions created without a first message *defer* the runtime spawn (`deferRuntime`,
`session-creator.ts:107`): the session exists in `waiting` status with `ptyId: ''` and no PTY;
the first message later routes through `spawnPrintModeFollowUp`. Otherwise `PtyPool.spawn()`
starts the process, the stream wirer attaches handlers, and `writeWorktreeMeta()` persists
the runtime/task/displayName so the session is rediscoverable. The name typed in the New Agent
dialog arrives as `SpawnAgentOptions.displayName` and becomes exactly that — the agent's name and
its tab title (`session-creator.ts:189`); it is no longer a branch hint, because the workspace
owns the branch. A native orchestrator such as Viola deliberately uses this deferred shape
permanently: `runtime.kind === 'orchestrator'` forces chat mode and prevents a PTY spawn, while
`runtimeId: 'viola'` persists the harness identity. Lifecycle startup also skips the CLI
slash-command probe for that runtime (`session-creator.ts:37`, `:126`,
`session-lifecycle.ts:56`). `SessionManager` routes its input/interrupt/kill operations to the
registered harness controller instead of the PTY I/O controller (`session-manager.ts:253`).
Back in the lifecycle, the new
session is added to the map, any dismissal recorded for that project + branch is lifted
(`session-lifecycle.ts:84`), memory capture starts, and the renderer is told via
`agent:sessions-changed`. Verdict creation also snapshots the optional agent display
name as `VerdictRecord.title`, and agent configuration keeps that title in sync for
Statistics rows.

**Run.** `SessionStreamWirer.wireOutputStreaming()` (`session-stream-wirer.ts:112`) is the hot
path. Each PTY chunk appends to `session.outputBuffer` (capped at 100 KB, trimmed to 50 KB),
runs `detectStatus`/`detectAddDir`/`detectUrl`, feeds the chat adapter **only for chat-mode
sessions** (`session-stream-wirer.ts:144` — an interactive agent paints a TUI, and its redraw
frames stripped of ANSI would land in chat history as unreadable half-sentences), and emits
`agent:output`/`agent:status`/`agent:activity`. Chat-mode print runs instead use
`wireStreamJsonOutput()` (`session-stream-wirer.ts:189`), which buffers partial NDJSON lines
in `streamJsonLineBuffer` and dispatches each complete event to `handleStreamJsonEvent`.
Input flows the other way through `SessionIoController.sendInput()` (`session-io-controller.ts:48`):
non-interactive sessions spawn a fresh print-mode follow-up; shell sessions route through the
NL/suggestion helpers only while at the prompt line.

**Shell prompt (zsh & bash).** `createShellPtySession()` (`session-resume.ts:89`) picks the
user's `$SHELL` and branches on `detectShell()` (`shell-prompt.ts:41`): a zsh shell gets a temp
`ZDOTDIR`, while a bash shell gets a temp `--rcfile` built by `createManifoldBashRcFile()`
(`shell-prompt.ts:58`) and is spawned as `bash --rcfile <dir>/.bashrc -i` (`session-resume.ts:121`,
`:128`).

**Stop — and leave the place standing.** `killSession()` → `SessionKiller.killSession()`
(`session-killer.ts:31`) deletes the session from the map, kills its PTYs (agent, dev-server,
slash-command probe), clears chat + memory + image temp dirs and stops the file watcher — each
`--add-dir` plus the worktree poll, the latter **only if no other live session shares the path**
(`cleanupSession`, `session-killer.ts:54`; `worktreeSharedWithOther`, `:89`). It removes **no
worktree and no branch**: the checkout is the workspace's, and the workspace's other agents are
still working there (`session-killer.ts:28`). `retireSession()` is now only the same teardown
under a name that says why (agent-settings replacement, `:45`). The higher-level
`SessionTeardown` paths (`session-teardown.ts`) auto-commit dirty managed worktrees before
killing and, for worktree-based sessions, checkout the base branch afterward — but deliberately
skip the base checkout for `noWorktree` sessions to avoid exposing build artifacts
(`session-teardown.ts:53`); they no longer run `git worktree remove` either.

**Resume.** `resumeSession()` (`session-lifecycle.ts:115`) is a no-op when a PTY already exists,
and for chat-mode sessions only updates `runtimeId` (they never hold a long-running PTY).
For interactive sessions it serializes concurrent calls via `resumeInFlight`
(`session-lifecycle.ts:32`) — a per-session-id in-flight promise map that ensures at most one
PTY is spawned even if two callers race before either's spawn completes. It calls
`resumeAgentSession()` (`session-resume.ts:15`), which re-reads worktree meta for missing
fields, refreshes managed-worktree guards, injects memory context, spawns a new PTY, and
re-wires output/exit. For interactive Claude it adds `--resume <session.id>` when an on-disk
transcript for that id exists (`session-resume.ts:65`), so the resumed conversation continues
in the same transcript. This is the path that brings a dormant discovered session back to life.
Resumed interactive workspace agents rebuild their runtime-specific working-set arguments from
`additionalDirs`, so changing runtime or returning from chat to terminal does not lose access to
the workspace's other repositories (`session-resume.ts`).

**Configure.** `configureSession()` validates the requested runtime before touching the running
process (`session-manager.ts`). A name-only edit updates and persists the existing session. A
runtime/view change clears persisted chat, retires the old process/session without removing its
worktrees, and creates a fresh session id on the same branch, primary path, workspace roots, and
additional directories. The new id prevents Claude/Codex from resuming the previous conversation;
chat mode starts waiting for a first message while terminal mode launches a new interactive CLI.
PTY exit handlers also require the exiting id to still be the session's current `ptyId`, so a slow
exit from a replaced process cannot mark a newer process done (`session-stream-wirer.ts`).

**Branch tracking.** `branchName` is a reading of the checkout, not a fixed property of the
session: the agent runs `git checkout -b`, the PR flow renames the branch, or the user switches
it in the shell terminal. The constructor registers `applyBranchChange` with the file watcher's
`setOnBranchChanged` (`session-manager.ts:138`), so each 2 s poll that reports a different branch
for a watched checkout moves **every session working in that checkout** onto it and broadcasts
`agent:sessions-changed` — the watcher polls a path once, under whichever session id watched it
last, and a checkout is on one branch, so its sibling agents moved with it. Nothing
is persisted — worktree meta has no branch field; discovery re-reads the branch from the checkout
(`session-discovery.ts:106`, `:150`). Only *watched* checkouts track it, and registering the
watch is `createSession`'s own job (`watchCheckout`, `session-manager.ts:220`) — the checkout
plus every `--add-dir` folder, for whoever created the session. Doing it at the `agent:spawn`
handler instead left the paths of every session created straight through the manager unpolled —
workspace agents above all (`workspace-manager.ts:217`), whose status bar then kept the branch
the agent started on. Resume registers its own (`agent-handlers.ts:234`); a dormant session gets
its branch fresh from discovery instead.

**Discover-on-disk.** On launch the renderer's `agent:sessions` IPC calls
`discoverSessionsForProject()` or `discoverAllSessions()`. `SessionDiscovery`
(`session-discovery.ts:15`) lists the project's worktrees via `WorktreeManager.listWorktrees()`,
and for any worktree not already tracked it reads its meta and inserts a dormant
`InternalSession` with `status: 'done'`, `pid: null`, `ptyId: ''`
(`session-discovery.ts:91`). If a project has no worktrees and nothing in memory, it falls
back to checking whether the main repo sits on a non-base branch and, if so, surfaces that as
a dormant `noWorktree` session (`session-discovery.ts:136`). `discoverAllSessions()`
(`session-discovery.ts:168`) repeats this across all projects and additionally stubs
simple-mode projects living under the managed projects base, picking a feature branch when
the repo is parked on base (`session-discovery.ts:215`). Both branch-state fallbacks skip
branches the user explicitly deleted: they consult the persisted `DismissedAgentsStore`
(wired via `setDismissedAgents`, `session-discovery.ts:31`) so a deleted dormant agent is not
resurrected from leftover branch checkout state (`session-discovery.ts:140`, `:222`; #679).

### Pushing a folder into a running agent

A session's working set is decided when its process is spawned — the `--add-dir` flags are argv,
and argv is immutable. So a folder added to a workspace after its agents started is invisible to
them, and `WorkspaceManager.addProject()` hands it to `SessionManager.addWorkingDir()`, which
delegates to `SessionWorkingSet.addDirToWorkspace()` (`session-working-set.ts:55`).

**State first, delivery second.** Every matching live session gets the folder recorded — pushed
onto `additionalDirs`, mapped into `workspaceWorktreePaths`, persisted, watched, and broadcast as
`agent:dirs-changed` (`session-working-set.ts:90`). That alone is enough for two of the three
cases, because both re-derive their flags from that array rather than remembering argv:
a print-mode/chat follow-up rebuilds its command per turn (`app/dev-server-manager.ts:190`) and
`resumeAgentSession()` rebuilds it on the next launch (`session-resume.ts:57`).

**Interactive agents get typed into**, but only where the runtime actually supports it.
`runtimeAddDirCommand()` (`src/main/agent/add-dir-command.ts:22`) holds what was probed against
the real CLIs: Claude Code takes `/add-dir <path>` and then raises a confirmation dialog whose
default answer accepts; Copilot takes it outright; **Codex has no such command**, and typing one
would submit it to the model as an ordinary prompt — so it is never injected there. The injection
waits for the agent to be at an idle composer, which is stricter than `status === 'waiting'`: that
status also covers a permission dialog, where a stray Enter would answer the question
(`PENDING_QUESTION`, `session-working-set.ts:32`). Success is not assumed — it is read back from
the runtime's own output via `detectAddDir()`.

**Every outcome is reported.** Each session emits one `agent:working-set-notice`
(`WorkingSetDelivery` in `src/shared/types.ts`): `live`, `next-turn`, `restart-required`, or
`manual` when the automatic attempt failed, carrying the command for the user to type. The
renderer shows everything but `live` as a toast (`src/shared/WorkingSetToast.tsx`) — a silent
failure would leave the user believing an agent can see a folder it cannot. The renderer raises
one variant itself rather than receiving it: `not-added`, for a folder that never joined the
workspace at all, so there was no agent to reach and no session to name it
(`useWorkingSetNotices.report()`, `App.tsx:285`). Same reason, one step earlier — the sidebar's
"Add Folder…" has no error surface of its own, so without it a failed add is a click that does
nothing.

## Key types and entry points

- `SessionManager` — `session-manager.ts`. Public surface includes `createSession`, `resumeSession`, `configureSession`, `killSession`, discovery, input/interrupt/resize, `renameSession`, `setSessionLocked` (deletion protection; mirrors `renameSession` — mutate → `persistSessionMeta` → broadcast, `session-manager.ts:266`), and shell-session creation. There is no `killAllSessionsOnWorktree`: a checkout is not a thing agents are killed by.
- `SessionLifecycle` — `session-lifecycle.ts:30`. `createSession()` / `resumeSession()` orchestration behind the manager's delegating methods (`session-manager.ts:192`, `:206`).
- `InternalSession` — `session-types.ts:14`. Extends `AgentSession` (`src/shared/types.ts:15`) with `ptyId`, `outputBuffer`, `streamJsonLineBuffer`, `nonInteractiveOutputMode`, shell/NL state, etc. `toPublicSession()` (`session-public.ts:4`) projects it down for IPC.
- `SessionCreator.create()` — `session-creator.ts:35`. The worktree-resolution + spawn decision tree.
- `SessionDiscovery.discoverSessionsForProject()` — `session-discovery.ts:43`. The serialized on-disk scan.
- `resumeAgentSession()` — `session-resume.ts:13`. Re-spawn for interactive sessions.
- `SessionStreamWirer.wireOutputStreaming()` / `wireStreamJsonOutput()` — `session-stream-wirer.ts:112` / `:189`. PTY → renderer wiring.

## Interactions

- **Agent runtimes / PTY** (`src/main/agent`): `PtyPool.spawn/write/kill/onData/onExit` is the process boundary; `getRuntimeById()` resolves the binary/args/env; `buildSimpleRuntimeCommand()` builds print-mode args; `claudeAnsiThemeArgs()` syncs the embedded Claude Code palette to Manifold's theme.
- **Git / worktrees** (`src/main/git`): `WorktreeManager`, `BranchCheckoutManager`, `worktree-meta` (`readWorktreeMeta`/`writeWorktreeMeta`), `managed-worktree` (`prepareManagedWorktree`, `commitManagedWorktree`), and raw `gitExec`. Session meta lives in the worktree, not a central store — that is what makes discovery possible.
- **IPC** (`src/main/ipc/agent-handlers.ts`): `agent:spawn` → `createSession`, `agent:resume` → `resumeSession`, `agent:configure` → `configureSession`, `agent:kill` → killer, `agent:sessions` → discovery, `agent:replay` → `getOutputBuffer`, plus the `shell:*` handlers. There is no `agent:kill-worktree` — removing a checkout is `workspace:remove`. `agent:set-locked` → `setSessionLocked` toggles deletion protection, and `agent:kill` refuses a locked session before any teardown.
- **Renderer / preload** (`src/preload/index.ts:151`): the renderer never touches the map; it listens to `agent:output`, `agent:activity`, `agent:activity-state`, `agent:status`, `agent:exit`, and `agent:sessions-changed`, all emitted through `SessionManager.sendToRenderer`.
- **Store** (`src/main/store`): `ProjectRegistry` resolves project path/baseBranch and caches `slashCommands`; `VerdictStore` backs the verdict recorder; `DismissedAgentsStore` records explicitly deleted agents so discovery skips them (`setDismissedAgents`, `session-manager.ts:149`).
- **Memory** (`src/main/memory`): `MemoryCapture` (start/stop per session), `MemoryInjector.injectContext()` (on create and resume), `MemoryCompressor.compressSession()` (on developer-mode teardown).
- **Dev server** (`src/main/app/dev-server-manager.ts`): owns `spawnPrintModeFollowUp`, `startDevServerSession`, and `probeSlashCommands`; the manager delegates the chat-mode follow-up turn and dev-server lifecycle to it.

## Invariants & gotchas

- **Concurrent-spawn guards.** Two operations carry in-flight promise maps to prevent races: `discoveryInFlight` (`session-discovery.ts:16`) serializes `discoverSessionsForProject` per project id; `resumeInFlight` (`session-lifecycle.ts:32`) deduplicates concurrent `resumeSession` calls so only one PTY is ever spawned per session.
- **One `noWorktree` (in-place) agent per project.** In-place agents share the repo's single working tree/HEAD (only one branch at a time), so a second can't coexist. `focusOrClearInPlaceSessions` (`agent-handlers.ts`), invoked from `agent:spawn`: focuses a *live* in-place session when the new spawn targets the same/no branch, throws when a *different* branch/PR is requested, and otherwise clears *finished* in-place sessions so discovery cannot resurrect a dead branch state. `agent:spawn` serializes concurrent no-worktree spawns per project (`noWorktreeSpawnsInFlight`) to close the check-then-create race. `SessionManager.createSession` itself stays permissive — the policy is at the IPC layer.
- **Discovery never resurrects a dismissed branch.** Deleting an agent (from its tab's × in the Agent panel) records a project+branch dismissal (`agent-handlers.ts`, `agent:kill`); both dormant-session fallbacks check it (`session-discovery.ts:140`, `:222`) and creating a new session on that branch lifts it (`session-lifecycle.ts:84`). Internal kills (mode switch, respawn) don't record dismissals — only the explicit `agent:kill` IPC path does (#679).
- **A locked agent cannot be deleted.** `locked` is persisted in the worktree meta (`worktree-meta.ts:25`), written by `session-meta-persister.ts:18`, read back at all three discovery construction sites, and surfaced by `toPublicSession` — so the protection survives a restart. Deletion is refused at both ends: the renderer's single `requestDeleteAgent` chokepoint never opens the confirm dialog (`hooks/app/useAppOverlays.ts:79`), and `agent:kill` throws before any teardown. Locking only blocks deletion — it never stops or interrupts the running agent.

- **Deferred chat sessions have `ptyId: ''` and status `waiting`.** Treat empty `ptyId` as "no live process"; `resumeSession` and many helpers short-circuit on it. Each chat turn is a fresh print-mode process, not a persistent PTY.
- **Interactive Codex working sets require a writable sandbox.** When a session has additional directories, `SessionCreator` adds `--sandbox workspace-write` before Codex's repeated `--add-dir` flags (`session-creator.ts:147`). This overrides a read-only user profile for that multi-root launch; otherwise Codex ignores every extra writable root.
- **Closing an agent removes nothing.** No teardown path in this folder removes a worktree or deletes a branch — not `killSession`, not `retireSession`, not the mode-switch teardowns (`session-killer.ts:28`, `session-teardown.ts`). Checkouts come and go with their workspace (`workspace-manager.ts:69`). The shared-path guard survives only for *unwatching*, since several sessions can poll one checkout (`session-killer.ts:66`).
- **Teardown skips base checkout for `noWorktree`.** Checking out base in the live repo dir would drop `.gitignore` and surface `node_modules` as untracked, breaking the next spawn (`session-teardown.ts:53`).
- **Meta is the source of truth on disk.** If `writeWorktreeMeta` fails, `nonInteractive` and friends are lost on next launch (both `session-creator.ts:187` and `session-meta-persister.ts:16` log this loudly). Discovery reconstructs sessions purely from worktree meta + branch state.
- **`outputBuffer` is bounded.** It is trimmed to the trailing 50 KB once over 100 KB, so detectors and `agent:replay` only ever see recent output.
- **Stale PTY exits are guarded.** Interactive and print-mode exit handlers ignore an exit whose `ptyId` no longer matches the session's current one, so a slow-closing replaced process can't overwrite a newer mode/runtime's status or wipe its `ptyId`/`pid` (`session-stream-wirer.ts`).
- **No `await` between spawn and listener wiring.** `create()` reads worktree meta *before* `PtyPool.spawn()` (`session-creator.ts:141`, `:145`) so wiring (`session-creator.ts:169`, `:177`) runs synchronously after spawn. A process that exits during an await gap would have its pool entry deleted, so `onData`/`onExit` wiring would throw `'PTY not found'`, reject `create()`, and strand the freshly created worktree (#496).
