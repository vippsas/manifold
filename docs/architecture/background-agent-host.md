---
description: The main-process host that runs background agent jobs (the Ideas research agent) off the interactive session, persists progress, and reports it back to the renderer.
covers: [src/main/background-agent-host]
updated: 2026-06-08
owner: see .github/CODEOWNERS
---

# Background Agent Host — off-session research jobs

A *background agent* job is a long-running, non-interactive run that produces project
"Ideas" without occupying an interactive agent session. This subsystem owns the
per-project job state, the four-phase refresh pipeline (profile → research → synthesize →
rank), pause/resume/stop control, and the bridge that turns each research topic into a
one-shot runtime invocation. It does *not* hold a PTY: every model call is a fresh
non-interactive process spawned through `gitOps.aiGenerate`, and results reach the
renderer by snapshot polling rather than streamed PTY output. The research/profiling/
ranking logic itself lives in the repo-root `background-agent/` package — this code is the
main-process *host* that drives it and persists its state.

## Covered code

- `src/main/background-agent-host/background-agent-host.ts` — `BackgroundAgentHost`, the façade. Public methods (`refreshSuggestions`, `resumeSuggestions`, `pauseSuggestions`, `stopSuggestions`, `listSuggestions`, `getStatus`, `clearSuggestions`, `recordFeedback`) and the in-flight refresh registry.
- `src/main/background-agent-host/background-agent-refresh-runner.ts` — `BackgroundAgentRefreshRunner`: the actual job. `runFresh`/`runResume`/`continueRefresh` drive the four phases and check the control flag between topics.
- `src/main/background-agent-host/background-agent-refresh-state.ts` — pure state builders (`createProfilingState`, `createPausedState`, `createStoppedState`, `createFailedState`, `createRecoveredInterruptedState`, `withStatus`, `appendActivity`) plus `mapRequestedActionToRefreshState` and log helpers.
- `src/main/background-agent-host/background-agent-runtime.ts` — `resolveBackgroundAgentRuntime()` (which runtime + cwd a job uses) and `runBackgroundAgentPrompt()` (one-shot invocation via `gitOps.aiGenerate`, with research-mode arg/timeout selection).
- `src/main/background-agent-host/background-agent-research-client.ts` — `RuntimeWebResearchClient` implements the `WebResearchClient` port: runs one prompt per topic, parses lenient JSON, normalizes sources/suggestions, retries once on no-output.
- `src/main/background-agent-host/background-agent-research-prompt.ts` — `buildResearchPrompt()`: the per-topic research prompt and its JSON output schema.
- `src/main/background-agent-host/background-agent-store.ts` — `BackgroundAgentStore`: per-project state persisted to `~/.manifold/background-agent/state.json`.
- `src/main/background-agent-host/background-agent-types.ts` — `BackgroundAgentProjectState`, `BackgroundAgentHostDeps`, and the clone/`toSnapshot` projections.

## How it works

`BackgroundAgentHost` is the only public entry point. Its constructor takes
`BackgroundAgentHostDeps` (`settingsStore`, `projectRegistry`, `sessionManager`, `gitOps`)
and builds the store, a `RuntimeWebResearchClient`, and a `BackgroundAgentRefreshRunner`,
defaulting each but allowing override via options (`background-agent-host.ts:42`). It is
constructed once in `src/main/app/index.ts:83` and exposed over IPC.

**Refresh (the job).** `refreshSuggestions()` → `startRefresh(…, 'fresh')`
(`background-agent-host.ts:66`) coalesces concurrent calls per project: if an execution is
already in `inFlightRefreshes`, the new caller joins its promise instead of starting a
second run (`background-agent-host.ts:134`). The runner's `runFresh()`
(`background-agent-refresh-runner.ts:46`) walks four phases, persisting a status to the
store at each step: **profiling** — `loadLocalProjectInput()` + `buildProjectProfile()`
build a local profile and `generateResearchTopics()` derives topics; **researching** —
`continueRefresh()` (`background-agent-refresh-runner.ts:139`) loops topics, calling
`webResearchClient.research([topic], …)` one at a time and appending each
`WebResearchResult` to `pendingRefresh.completedResults`; **synthesizing** —
`finishReadyState()` (`:182`) runs `synthesizeSuggestions()`; **ranking** —
`rankSuggestions({ limit: 5, profile, feedbackEvents })` produces the final cards and the
status flips to `phase: 'ready'`, `isRefreshing: false` (`:215`). The resolved value is a
`BackgroundAgentSnapshot`.

**Runtime invocation.** Each topic is a *separate* one-shot process, not a session.
`resolveBackgroundAgentRuntime()` (`background-agent-runtime.ts:24`) picks the runtime from
the active interactive session's `runtimeId` (if one is supplied) else
`settings.defaultRuntime`, and the cwd from that session's `worktreePath` else the project
path. `runBackgroundAgentPrompt()` (`background-agent-runtime.ts:57`) selects research-mode
args per runtime (`--search` for codex, `--model opus --effort max` for claude, a
`/research` prefix for copilot, etc., `:115`) and a research-mode minimum timeout
(`:97`), then calls `gitOps.aiGenerate(runtime, prompt, cwd, extraArgs, …)` — which
`spawn`s the runtime binary, pipes the prompt, and SIGTERMs on timeout
(`src/main/git/git-operations.ts:118`). `RuntimeWebResearchClient.research()`
(`background-agent-research-client.ts:41`) builds the prompt, parses the model's JSON
output leniently (direct parse, then fenced block, then brace-slice;
`background-agent-research-client.ts:156`), normalizes sources/suggestions, and emits
`topic_started`/`topic_completed`/`topic_failed` progress events. A topic that throws is
swallowed into an empty result so one failure does not abort the run (`:86`); the runner
retries a topic once on "no usable output" / "stream disconnected" (`:128`, `:288`).

**Progress reporting.** There is no push channel. Every phase transition and each research
progress event calls `store.setProjectState()`, which writes the full state to disk
(`background-agent-store.ts:32`). The renderer drives a long-lived `invoke` for
`background-agent:refresh`/`:resume` and, while it is pending, polls
`background-agent:get-status` to surface intermediate `status` (phase, `stepLabel`,
`summary`, `detail`, `recentActivity`) until the invoke resolves the final snapshot
(`src/renderer/hooks/useBackgroundAgent.ts:164`). So the host streams by *persisting +
polling*, not by emitting `agent:*` events the way `SessionManager` does.

**Pause / stop.** Control is cooperative and checked between topics. `pauseSuggestions`/
`stopSuggestions` call `requestRefreshAction()` (`background-agent-host.ts:158`), which sets
`execution.requestedAction` on the live handle and writes a `pause_requested`/
`stop_requested` status. The runner reads that flag in `applyControlState()`
(`background-agent-refresh-runner.ts:265`) before and after each topic: `pause` snapshots a
resumable `paused` state (keeping `pendingRefresh`), `stop` clears `pendingRefresh`. Stop
issued while already paused short-circuits in the host without a live handle
(`background-agent-host.ts:83`).

**Resume.** `resumeSuggestions()` only proceeds when the persisted status is `paused` and a
`pendingRefresh` exists (`background-agent-host.ts:70`). `runResume()`
(`background-agent-refresh-runner.ts:96`) recomputes the remaining topics from
`pendingRefresh`, re-resolves the runtime, and re-enters `continueRefresh()`, which skips
the already-completed results and continues from the checkpoint.

**Feedback / ranking.** `recordFeedback()` validates the suggestion id and feedback type,
appends a `BackgroundAgentFeedbackEvent`, then re-ranks the current suggestions with the new
feedback (`background-agent-host.ts:94`). Feedback is fed back into `rankSuggestions` on the
next refresh as well.

## Key types and entry points

- `BackgroundAgentHost` — `background-agent-host.ts:36`. Public surface listed above; `startRefresh`/`requestRefreshAction`/`getLiveProjectState` are private.
- `BackgroundAgentRefreshRunner` — `background-agent-refresh-runner.ts:39`. `runFresh`, `runResume`, `continueRefresh`, `finishReadyState`, `applyControlState`.
- `BackgroundAgentProjectState` — `background-agent-types.ts:20`. Extends the public `BackgroundAgentSnapshot` (`background-agent/schemas/background-agent-types`) with `feedback[]` and `pendingRefresh`. `toSnapshot()` (`background-agent-types.ts:87`) strips those before returning over IPC.
- `BackgroundAgentRefreshExecutionControl` — `background-agent-refresh-state.ts:10`. The single mutable `{ requestedAction }` flag the host and runner share to coordinate pause/stop.
- `resolveBackgroundAgentRuntime()` / `runBackgroundAgentPrompt()` — `background-agent-runtime.ts:24` / `:57`. The non-interactive process boundary.
- `BackgroundAgentStore` — `background-agent-store.ts:20`. JSON persistence at `~/.manifold/background-agent/state.json`.

## Interactions

- **IPC** (`src/main/ipc/background-agent-handlers.ts`): `background-agent:refresh` → `refreshSuggestions`, `:resume` → `resumeSuggestions`, `:pause`/`:stop`/`:clear`/`:feedback`/`:list-suggestions`/`:get-status` → the matching host methods. All are `ipcMain.handle` request/response; none emit events.
- **Renderer** (`src/renderer/hooks/useBackgroundAgent.ts`, `src/renderer/components/background-agent`): owns the long invoke + status-poll loop and renders the Ideas panel/cards. The renderer never holds job state; it reconstructs from snapshots.
- **Sessions / runtimes** (`src/main/session`, `src/main/agent`): `SessionManager.getSession()` supplies the active session's `runtimeId`/`worktreePath` so a job runs with the same runtime and in the same worktree as the user's interactive agent; `getRuntimeById()` resolves the binary/args.
- **Git** (`src/main/git/git-operations.ts`): `GitOperationsManager.aiGenerate()` is the spawn boundary for every prompt; it is the only way this host executes a model.
- **Store** (`src/main/store`): `ProjectRegistry.getProject()` resolves path/name; `SettingsStore.getSettings().defaultRuntime` is the fallback runtime.
- **background-agent package** (repo-root `background-agent/`): the host imports the profile builder, topic generator, synthesizer, ranker, the `WebResearchClient` port, and the shared schema types. The host is the runtime adapter for those pure modules.

## Invariants & gotchas

- **One refresh per project at a time.** `inFlightRefreshes` keys by project id; a second `refresh`/`resume` joins the existing promise rather than starting a parallel run (`background-agent-host.ts:134`). There is no global concurrency cap across projects.
- **No PTY, no event stream.** Unlike `SessionManager`, this host never emits `agent:*` events. Progress is only observable by polling `background-agent:get-status`, which reads the persisted state. If the renderer stops polling, it sees nothing until the final snapshot resolves.
- **State lives on disk, full-rewrite per step.** Every `setProjectState` serializes the entire `state.json` (`background-agent-store.ts:97`). A refresh writes once per phase and once per topic, so the file is rewritten many times during a run.
- **Cooperative cancel only.** `pause`/`stop` take effect *between* topics, never mid-prompt; a request set during a topic waits for that runtime call to finish (or time out) before the status flips to `paused`/`stopped` (`background-agent-refresh-runner.ts:265`).
- **Stale-refresh recovery.** If the process died mid-run, the persisted status still reads `isRefreshing: true` but no handle exists. `getLiveProjectState()` detects this (`isRefreshing` true with nothing in `inFlightRefreshes`) and rewrites it to a recovered `error` state that is resumable iff `pendingRefresh` survived (`background-agent-host.ts:193`, `background-agent-refresh-state.ts:125`).
- **Resume needs a `pending` checkpoint.** Resume is a no-op unless status is `paused` and `pendingRefresh` is non-null; a `stop` clears `pendingRefresh`, so a stopped run can only be re-`refresh`ed, never resumed (`background-agent-host.ts:70`, `background-agent-refresh-runner.ts:265`).
- **One failed topic ≠ failed run.** `RuntimeWebResearchClient.research()` converts a topic error into an empty result and continues; only profiling/topic-generation failures (outside the loop) fail the whole refresh (`background-agent-research-client.ts:86`, `background-agent-refresh-runner.ts:88`).
- **Model output is untrusted JSON.** `parseResearchOutput` tolerates fenced/garbage output and `normalizeSources`/`normalizeSuggestionHints` drop malformed entries and clamp to `maxSourcesPerTopic`/`maxSuggestionsPerTopic`; the prompt explicitly forbids invented sources and local file access (`background-agent-research-prompt.ts:21`).
