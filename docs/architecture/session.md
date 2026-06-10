---
description: How Manifold agent sessions are created, run, stopped, resumed, and rediscovered from on-disk worktrees.
covers: [src/main/session]
updated: 2026-06-10
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

Not detailed here: `shell-*` (Manifold's AI shell prompt/suggestions), `nl-command-translator.*`, and `verdict-recorder.*` (per-session run records). They are session helpers, not the lifecycle core.

## How it works

`SessionManager` is the only public entry point. Its constructor builds and owns every
helper, passing each the shared `this.sessions` map and lambdas (`sendToRenderer`,
`getChatAdapter`, etc.) so they stay decoupled from the manager
(`session-manager.ts:45`). Memory/verdict collaborators are wired post-construction via
setters (`setMemoryCapture`, `setVerdictRecorder`, `setGitOps`, …).

**Create.** `createSession()` (`session-manager.ts:175`) enforces the one-`noWorktree`-agent-per-project
rule, then delegates to `SessionCreator.create()` (`session-creator.ts:35`). For `noWorktree`
sessions the call is serialized via `createNoWorktreeInFlight` (`session-manager.ts:47`) — a
per-project in-flight promise map that coalesces concurrent spawns so only one session is ever
created (TOCTOU guard). The creator resolves a worktree from the many `SpawnAgentOptions`
shapes — existing path, `stayOnBranch`, `existingBranch`, PR checkout, or a fresh
`WorktreeManager.createWorktree()` — then resolves the runtime via `getRuntimeById()`.
Chat-mode sessions created without a first message *defer* the runtime spawn (`deferRuntime`,
`session-creator.ts:107`): the session exists in `waiting` status with `ptyId: ''` and no PTY;
the first message later routes through `spawnPrintModeFollowUp`. Otherwise `PtyPool.spawn()`
starts the process, the stream wirer attaches handlers, and `writeWorktreeMeta()` persists
the runtime/task/displayName so the session is rediscoverable. Back in the manager, the new
session is added to the map, memory capture starts, and the renderer is told via
`agent:sessions-changed`.

**Run.** `SessionStreamWirer.wireOutputStreaming()` (`session-stream-wirer.ts:112`) is the hot
path. Each PTY chunk appends to `session.outputBuffer` (capped at 100 KB, trimmed to 50 KB),
runs `detectStatus`/`detectAddDir`/`detectUrl`, feeds the chat adapter, and emits
`agent:output`/`agent:status`/`agent:activity`. Chat-mode print runs instead use
`wireStreamJsonOutput()` (`session-stream-wirer.ts:189`), which buffers partial NDJSON lines
in `streamJsonLineBuffer` and dispatches each complete event to `handleStreamJsonEvent`.
Input flows the other way through `SessionIoController.sendInput()` (`session-io-controller.ts:48`):
non-interactive sessions spawn a fresh print-mode follow-up; shell sessions route through the
NL/suggestion helpers only while at the prompt line.

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

**Resume.** `resumeSession()` (`session-manager.ts:260`) is a no-op when a PTY already exists,
and for chat-mode sessions only updates `runtimeId` (they never hold a long-running PTY).
For interactive sessions it serializes concurrent calls via `resumeInFlight`
(`session-manager.ts:45`) — a per-session-id in-flight promise map that ensures at most one
PTY is spawned even if two callers race before either's spawn completes. It calls
`resumeAgentSession()` (`session-resume.ts:13`), which re-reads worktree meta for missing
fields, refreshes managed-worktree guards, injects memory context, spawns a new PTY, and
re-wires output/exit. This is the path that brings a dormant discovered session back to life.

**Discover-on-disk.** On launch the renderer's `agent:sessions` IPC calls
`discoverSessionsForProject()` or `discoverAllSessions()`. `SessionDiscovery`
(`session-discovery.ts:14`) lists the project's worktrees via `WorktreeManager.listWorktrees()`,
and for any worktree not already tracked it reads its meta and inserts a dormant
`InternalSession` with `status: 'done'`, `pid: null`, `ptyId: ''`
(`session-discovery.ts:85`). If a project has no worktrees and nothing in memory, it falls
back to checking whether the main repo sits on a non-base branch and, if so, surfaces that as
a dormant `noWorktree` session (`session-discovery.ts:128`). `discoverAllSessions()`
(`session-discovery.ts:160`) repeats this across all projects and additionally stubs
simple-mode projects living under the managed projects base, picking a feature branch when
the repo is parked on base (`session-discovery.ts:198`).

## Key types and entry points

- `SessionManager` — `session-manager.ts:28`. Public surface: `createSession`, `resumeSession`, `killSession`, `killAllSessionsOnWorktree`, `discoverSessionsForProject`, `discoverAllSessions`, `sendInput`, `interruptSession`, `resize`, `renameSession`, `createShellSession`.
- `InternalSession` — `session-types.ts:14`. Extends `AgentSession` (`src/shared/types.ts:15`) with `ptyId`, `outputBuffer`, `streamJsonLineBuffer`, `nonInteractiveOutputMode`, shell/NL state, etc. `toPublicSession()` (`session-public.ts:4`) projects it down for IPC.
- `SessionCreator.create()` — `session-creator.ts:35`. The worktree-resolution + spawn decision tree.
- `SessionDiscovery.discoverSessionsForProject()` — `session-discovery.ts:43`. The serialized on-disk scan.
- `resumeAgentSession()` — `session-resume.ts:13`. Re-spawn for interactive sessions.
- `SessionStreamWirer.wireOutputStreaming()` / `wireStreamJsonOutput()` — `session-stream-wirer.ts:112` / `:189`. PTY → renderer wiring.

## Interactions

- **Agent runtimes / PTY** (`src/main/agent`): `PtyPool.spawn/write/kill/onData/onExit` is the process boundary; `getRuntimeById()` resolves the binary/args/env; `buildSimpleRuntimeCommand()` builds print-mode args; `claudeAnsiThemeArgs()` syncs the embedded Claude Code palette to Manifold's theme.
- **Git / worktrees** (`src/main/git`): `WorktreeManager`, `BranchCheckoutManager`, `worktree-meta` (`readWorktreeMeta`/`writeWorktreeMeta`), `managed-worktree` (`prepareManagedWorktree`, `commitManagedWorktree`), and raw `gitExec`. Session meta lives in the worktree, not a central store — that is what makes discovery possible.
- **IPC** (`src/main/ipc/agent-handlers.ts`): `agent:spawn` → `createSession`, `agent:resume` → `resumeSession`, `agent:kill`/`agent:kill-worktree` → killers, `agent:sessions` → discovery, `agent:replay` → `getOutputBuffer`, plus the `shell:*` handlers.
- **Renderer / preload** (`src/preload/index.ts:151`): the renderer never touches the map; it listens to `agent:output`, `agent:activity`, `agent:activity-state`, `agent:status`, `agent:exit`, and `agent:sessions-changed`, all emitted through `SessionManager.sendToRenderer`.
- **Store** (`src/main/store`): `ProjectRegistry` resolves project path/baseBranch and caches `slashCommands`; `VerdictStore` backs the verdict recorder.
- **Memory** (`src/main/memory`): `MemoryCapture` (start/stop per session), `MemoryInjector.injectContext()` (on create and resume), `MemoryCompressor.compressSession()` (on developer-mode teardown).
- **Dev server** (`src/main/app/dev-server-manager.ts`): owns `spawnPrintModeFollowUp`, `startDevServerSession`, and `probeSlashCommands`; the manager delegates the chat-mode follow-up turn and dev-server lifecycle to it.

## Invariants & gotchas

- **Concurrent-spawn guards.** Three operations carry in-flight promise maps to prevent races: `discoveryInFlight` (`session-discovery.ts:15`) serializes `discoverSessionsForProject` per project id; `createNoWorktreeInFlight` (`session-manager.ts:47`) coalesces concurrent `noWorktree` `createSession` calls; `resumeInFlight` (`session-manager.ts:45`) deduplicates concurrent `resumeSession` calls so only one PTY is ever spawned per session.
- **At most one `noWorktree` agent per project.** Enforced in `createSession()` (`session-manager.ts:175`); concurrent calls are serialized via `createNoWorktreeInFlight` — the second caller coalesces onto the same in-flight promise so only one session is created.
- **Deferred chat sessions have `ptyId: ''` and status `waiting`.** Treat empty `ptyId` as "no live process"; `resumeSession` and many helpers short-circuit on it. Each chat turn is a fresh print-mode process, not a persistent PTY.
- **Worktree removal is path-shared-aware.** A worktree is only removed when no other session references its path (`removeWorktreeIfUnused` / `hasOtherLiveSessionsOnPath`); workspace sessions remove the whole `workspaceWorktreePaths` set instead.
- **Teardown skips base checkout for `noWorktree`.** Checking out base in the live repo dir would drop `.gitignore` and surface `node_modules` as untracked, breaking the next spawn (`session-teardown.ts:53`).
- **Meta is the source of truth on disk.** If `writeWorktreeMeta` fails, `nonInteractive` and friends are lost on next launch (both `session-creator.ts:187` and `session-meta-persister.ts:16` log this loudly). Discovery reconstructs sessions purely from worktree meta + branch state.
- **`outputBuffer` is bounded.** It is trimmed to the trailing 50 KB once over 100 KB, so detectors and `agent:replay` only ever see recent output.
- **Stale print-mode exits are guarded.** Both `wirePrintModeExitHandling` and `wirePrintModeInitialExitHandling` ignore an exit whose `ptyId` no longer matches the session's current one, so a slow-closing previous turn can't overwrite a newer turn's `running` status or wipe its `ptyId`/`pid` (`session-stream-wirer.ts:230`, `:272`).
- **No `await` between spawn and listener wiring.** `create()` reads worktree meta *before* `PtyPool.spawn()` (`session-creator.ts:141`, `:145`) so wiring (`session-creator.ts:169`, `:177`) runs synchronously after spawn. A process that exits during an await gap would have its pool entry deleted, so `onData`/`onExit` wiring would throw `'PTY not found'`, reject `create()`, and strand the freshly created worktree (#496).
