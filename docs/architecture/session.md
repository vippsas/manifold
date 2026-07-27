---
description: How Manifold agent sessions are created, run, stopped, resumed, and rediscovered from on-disk worktrees.
covers: [src/main/session]
updated: 2026-07-27
owner: see .github/CODEOWNERS
---

# Session — agent session lifecycle

A *session* is one running (or dormant) agent: a runtime process attached to a git
worktree (or, for `noWorktree`/folder projects, the repo directory itself). This
subsystem owns the in-memory session map, the PTY wiring that streams agent output
to the renderer, and the logic that rebuilds sessions from disk on the next launch.
Worktree creation/removal itself lives in `src/main/git` — this code only calls into it.

## Covered code

- `src/main/session/session-manager.ts` — `SessionManager`, the façade that holds the `Map<string, InternalSession>` and delegates to the helpers below.
- `src/main/session/session-lifecycle.ts` — `SessionLifecycle`: create/resume orchestration (resume in-flight dedup, dismissal clearing, verdict adoption). It's a permissive create primitive; the one-in-place-agent-per-repo policy is enforced at the `agent:spawn` IPC layer.
- `src/main/session/session-creator.ts` — `SessionCreator.create()`: resolves worktree + runtime, spawns the PTY, writes worktree meta.
- `src/main/session/session-discovery.ts` — `SessionDiscovery`: rebuilds dormant sessions by scanning worktrees on disk.
- `src/main/session/session-resume.ts` — `resumeAgentSession()` (re-spawn an interactive runtime) and `createShellPtySession()`.
- `src/main/session/session-killer.ts` — `SessionKiller`: tears down a session and removes its worktree if unused.
- `src/main/session/session-teardown.ts` — `SessionTeardown`: simple/developer-mode kill paths that auto-commit then checkout base.
- `src/main/session/session-stream-wirer.ts` — `SessionStreamWirer`: attaches PTY `onData`/`onExit` handlers, status/url/dir detection, NDJSON parsing.
- `src/main/session/session-io-controller.ts` — `SessionIoController`: input/interrupt/resize routing, post-SIGINT drain.
- `src/main/session/session-types.ts` — `InternalSession` (superset of the public `AgentSession`).
- `src/main/session/session-public.ts` — `toPublicSession()`: strips internal fields before returning over IPC.
- `src/main/session/session-meta-persister.ts` — `persistSessionMeta()`: writes worktree meta after a mutation.
- `src/main/session/transcript-usage-reader.ts` — `readClaudeTranscriptUsage()` (+ a `…Sync` variant for quit): sums token usage + counts human turns from Claude's on-disk JSONL transcript (deduped by `message.id`), located via the session id we spawn with (`locateClaudeTranscript()`).
- `src/main/session/codex-usage-reader.ts` — `readCodexUsage()` (+ sync variant): locates Codex rollout JSONL via `~/.codex/state_5.sqlite`, parses token counts, and sums matching rollouts.
- `src/main/session/session-usage-accumulator.ts` — `SessionUsageAccumulator`: live token/turn tally for chat-mode turns; Claude adds per result, Codex replaces cumulative per-run totals before drain.
- `src/main/session/verdict-pr-verifier.ts` — `verifyVerdictPullRequests()`: re-checks cached `pr_created` verdicts with stored PR URLs, stamps PR freshness metadata, and flips merged PRs to `outcome: 'merged'`.

Not detailed here: `shell-*` (Manifold's AI shell prompt/suggestions), `nl-command-translator.*`, and `verdict-recorder.*` (per-session run records). They are session helpers, not the lifecycle core. **Token-usage capture (#728):** interactive Claude is spawned with `--session-id <session.id>` (`session-creator.ts:136`) so its transcript is locatable, and resume passes `--resume <session.id>` when that transcript exists (`session-resume.ts:69`). Codex chat-mode JSONL handles `event_msg/user_message` and `event_msg/token_count` in the stream dispatcher (`session-stream-json.ts:132`, `:138`), maps cumulative totals in `recordCodexTokenCount()` (`codex-stream-usage.ts:41`), and stores them with `SessionUsageAccumulator.replaceRun()` (`session-usage-accumulator.ts:31`). At termination the app-level resolver drains live usage first, then falls back to Claude transcript usage or Codex rollout usage (`app/index.ts:112`, `:117`, `:120`), using the created/terminated timestamps passed by `VerdictRecorder` (`verdict-recorder.ts:165`, `:208`). Codex rollout lookup prefers a persisted thread id when available, otherwise matches `cwd`, `source IN ('cli', 'exec')`, and the Manifold session time window in `state_5.sqlite` (`codex-usage-reader.ts:96`, `:102`). The Codex thread id is stored in worktree meta (`worktree-meta.ts:22`, `session-meta-persister.ts:17`) and restored during discovery (`session-discovery.ts:121`, `:163`). Because a normal quit kills PTYs without firing `agent:exit`, `before-quit` first calls `finalizeAllForQuitSync()` (`verdict-recorder.ts:203`, via `sessionManager.finalizeActiveVerdictsForQuit()` at `app-lifecycle.ts:90`) to write active sessions' usage synchronously (`VerdictStore.upsert` is a synchronous atomic write). PR verification is a separate, user-triggered cache refresh: `verifyVerdictPullRequests()` filters `pr_created` records with a stored `metrics.prUrl`, uses URL-based status lookup so renamed/deleted branches do not matter, records `prCheckedAt`/`prState`/failure metadata, and updates only merged PRs to `merged` (`verdict-pr-verifier.ts:16`, `:27`, `:35`). One cross-cutting note: the zsh prompt generated by `shell-prompt.ts` seeds its segment toggles at spawn but re-sources the shared `~/.manifold/shell-prompt-segments.zsh` (`shell-prompt-config.ts:13`) whenever it changes, so prompt-segment settings reach already-running shells at their next prompt render (settings-handlers writes that file at boot and on updates).

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
— then resolves the runtime via `getRuntimeById()`.

**No-worktree base-branch model.** The agent's base branch is `options.baseBranch` (a branch
picked in the New Agent form's Advanced section) or the project's base branch. With a blank name
(`options.autoName`) the agent **works directly on that base branch** (`git checkout <base>`, no
new branch) and is named after it. With a typed name it **cuts a new branch off the base**
(`git checkout -b <slug> <base>`). Both paths assert a clean tree first unless
`options.allowDirtyWorktree` (the form confirms and sets it) — so switching the shared working
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
the runtime/task/displayName so the session is rediscoverable. Back in the lifecycle, the new
session is added to the map, any dismissal recorded for that project + branch is lifted
(`session-lifecycle.ts:84`), memory capture starts, and the renderer is told via
`agent:sessions-changed`. Verdict creation also snapshots the optional agent display
name as `VerdictRecord.title`, and agent configuration keeps that title in sync for
Statistics rows.

**Run.** `SessionStreamWirer.wireOutputStreaming()` (`session-stream-wirer.ts:112`) is the hot
path. Each PTY chunk appends to `session.outputBuffer` (capped at 100 KB, trimmed to 50 KB),
runs `detectStatus`/`detectAddDir`/`detectUrl`, feeds the chat adapter, and emits
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

**Stop.** `killSession()` → `SessionKiller.killSession()` (`session-killer.ts:33`) deletes the
session from the map, kills its PTYs (agent, dev-server, slash-command probe), clears chat +
memory + image temp dirs and stops the file watcher — each `--add-dir` plus the worktree poll,
the latter **only if no other live session shares the path** (`cleanupSession`,
`session-killer.ts:87`; `worktreeSharedWithOther`) — then removes the worktree under the same
shared-path guard (`removeWorktreeIfUnused`, `:113`). The
higher-level `SessionTeardown` paths (`session-teardown.ts`) auto-commit dirty managed
worktrees before killing and, for worktree-based sessions, checkout the base branch
afterward — but deliberately skip the base checkout for `noWorktree` sessions to avoid
exposing build artifacts (`session-teardown.ts:53`).

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

## Key types and entry points

- `SessionManager` — `session-manager.ts`. Public surface includes `createSession`, `resumeSession`, `configureSession`, `killSession`, `killAllSessionsOnWorktree`, discovery, input/interrupt/resize, `renameSession`, legacy `setSessionLocked`, and shell-session creation.
- `SessionLifecycle` — `session-lifecycle.ts:30`. `createSession()` / `resumeSession()` orchestration behind the manager's delegating methods (`session-manager.ts:192`, `:206`).
- `InternalSession` — `session-types.ts:14`. Extends `AgentSession` (`src/shared/types.ts:15`) with `ptyId`, `outputBuffer`, `streamJsonLineBuffer`, `nonInteractiveOutputMode`, shell/NL state, etc. `toPublicSession()` (`session-public.ts:4`) projects it down for IPC.
- `SessionCreator.create()` — `session-creator.ts:35`. The worktree-resolution + spawn decision tree.
- `SessionDiscovery.discoverSessionsForProject()` — `session-discovery.ts:43`. The serialized on-disk scan.
- `resumeAgentSession()` — `session-resume.ts:13`. Re-spawn for interactive sessions.
- `SessionStreamWirer.wireOutputStreaming()` / `wireStreamJsonOutput()` — `session-stream-wirer.ts:112` / `:189`. PTY → renderer wiring.

## Interactions

- **Agent runtimes / PTY** (`src/main/agent`): `PtyPool.spawn/write/kill/onData/onExit` is the process boundary; `getRuntimeById()` resolves the binary/args/env; `buildSimpleRuntimeCommand()` builds print-mode args; `claudeAnsiThemeArgs()` syncs the embedded Claude Code palette to Manifold's theme.
- **Git / worktrees** (`src/main/git`): `WorktreeManager`, `BranchCheckoutManager`, `worktree-meta` (`readWorktreeMeta`/`writeWorktreeMeta`), `managed-worktree` (`prepareManagedWorktree`, `commitManagedWorktree`), and raw `gitExec`. Session meta lives in the worktree, not a central store — that is what makes discovery possible.
- **IPC** (`src/main/ipc/agent-handlers.ts`): `agent:spawn` → `createSession`, `agent:resume` → `resumeSession`, `agent:configure` → `configureSession`, `agent:kill`/`agent:kill-worktree` → killers, `agent:sessions` → discovery, `agent:replay` → `getOutputBuffer`, plus the `shell:*` handlers. `agent:set-locked` remains readable for backward compatibility, but deletion no longer treats the legacy `locked` flag specially.
- **Renderer / preload** (`src/preload/index.ts:151`): the renderer never touches the map; it listens to `agent:output`, `agent:activity`, `agent:activity-state`, `agent:status`, `agent:exit`, and `agent:sessions-changed`, all emitted through `SessionManager.sendToRenderer`.
- **Store** (`src/main/store`): `ProjectRegistry` resolves project path/baseBranch and caches `slashCommands`; `VerdictStore` backs the verdict recorder; `DismissedAgentsStore` records explicitly deleted agents so discovery skips them (`setDismissedAgents`, `session-manager.ts:149`).
- **Memory** (`src/main/memory`): `MemoryCapture` (start/stop per session), `MemoryInjector.injectContext()` (on create and resume), `MemoryCompressor.compressSession()` (on developer-mode teardown).
- **Dev server** (`src/main/app/dev-server-manager.ts`): owns `spawnPrintModeFollowUp`, `startDevServerSession`, and `probeSlashCommands`; the manager delegates the chat-mode follow-up turn and dev-server lifecycle to it.

## Invariants & gotchas

- **Concurrent-spawn guards.** Two operations carry in-flight promise maps to prevent races: `discoveryInFlight` (`session-discovery.ts:16`) serializes `discoverSessionsForProject` per project id; `resumeInFlight` (`session-lifecycle.ts:32`) deduplicates concurrent `resumeSession` calls so only one PTY is ever spawned per session.
- **One `noWorktree` (in-place) agent per project.** In-place agents share the repo's single working tree/HEAD (only one branch at a time), so a second can't coexist. `focusOrClearInPlaceSessions` (`agent-handlers.ts`), invoked from `agent:spawn`: focuses a *live* in-place session when the new spawn targets the same/no branch, throws when a *different* branch/PR is requested, and otherwise clears *finished* in-place sessions so discovery cannot resurrect a dead branch state. `agent:spawn` serializes concurrent no-worktree spawns per project (`noWorktreeSpawnsInFlight`) to close the check-then-create race. `SessionManager.createSession` itself stays permissive — the policy is at the IPC layer.
- **Discovery never resurrects a dismissed branch.** Deleting an agent from the sidebar records a project+branch dismissal (`agent-handlers.ts`, `agent:kill`); both dormant-session fallbacks check it (`session-discovery.ts:140`, `:222`) and creating a new session on that branch lifts it (`session-lifecycle.ts:84`). Internal kills (mode switch, respawn) don't record dismissals — only the explicit `agent:kill` IPC path does (#679).
- **Old lock metadata is inert.** Worktrees created by older versions may still contain a persisted `locked` flag (`worktree-meta.ts:24`). Discovery retains it for compatibility, but the renderer has no lock affordance and both session and whole-worktree deletion ignore it (`agent-handlers.ts:140`, `:161`).

- **Deferred chat sessions have `ptyId: ''` and status `waiting`.** Treat empty `ptyId` as "no live process"; `resumeSession` and many helpers short-circuit on it. Each chat turn is a fresh print-mode process, not a persistent PTY.
- **Worktree removal is path-shared-aware.** A worktree is only removed when no other session references its path (`removeWorktreeIfUnused` / `hasOtherLiveSessionsOnPath`); workspace sessions remove the whole `workspaceWorktreePaths` set instead.
- **Teardown skips base checkout for `noWorktree`.** Checking out base in the live repo dir would drop `.gitignore` and surface `node_modules` as untracked, breaking the next spawn (`session-teardown.ts:53`).
- **Meta is the source of truth on disk.** If `writeWorktreeMeta` fails, `nonInteractive` and friends are lost on next launch (both `session-creator.ts:187` and `session-meta-persister.ts:16` log this loudly). Discovery reconstructs sessions purely from worktree meta + branch state.
- **`outputBuffer` is bounded.** It is trimmed to the trailing 50 KB once over 100 KB, so detectors and `agent:replay` only ever see recent output.
- **Stale PTY exits are guarded.** Interactive and print-mode exit handlers ignore an exit whose `ptyId` no longer matches the session's current one, so a slow-closing replaced process can't overwrite a newer mode/runtime's status or wipe its `ptyId`/`pid` (`session-stream-wirer.ts`).
- **No `await` between spawn and listener wiring.** `create()` reads worktree meta *before* `PtyPool.spawn()` (`session-creator.ts:141`, `:145`) so wiring (`session-creator.ts:169`, `:177`) runs synchronously after spawn. A process that exits during an await gap would have its pool entry deleted, so `onData`/`onExit` wiring would throw `'PTY not found'`, reject `create()`, and strand the freshly created worktree (#496).
