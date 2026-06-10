---
description: Per-project session memory — the SQLite store, interaction capture, AI/regex compression, and the (currently disabled) resume-time context injector.
covers: [src/main/memory]
updated: 2026-06-10
owner: see .github/CODEOWNERS
---

# Memory — per-project session memory

*Memory* records what agents did across sessions so that past work is searchable and
(eventually) re-injectable. Each project gets its own SQLite database. As a session runs,
`MemoryCapture` writes a stream of cleaned **interactions**; periodically and at teardown a
`MemoryCompressor` distils those interactions into structured **observations** and a
**session summary**. `MemoryStore` owns the schema, full-text search, and stats; IPC handlers
expose search/timeline/stats to the renderer. The `MemoryInjector` exists but its main entry
point is currently a no-op (see *Invariants & gotchas*).

## Covered code

- `src/main/memory/memory-store.ts` — `MemoryStore`: one `better-sqlite3` DB per `projectId`, all read/write queries, FTS search delegation, `prune`/`deleteProject`/`close`.
- `src/main/memory/store/memory-store-schema.ts` — `MEMORY_STORE_SCHEMA_SQL` (tables, FTS5 virtual tables, triggers) and `applyMemoryStoreMigrations` (idempotent `ALTER TABLE`s).
- `src/main/memory/store/memory-store-parsers.ts` — row → typed-object parsers (`parseInteractionRow`, `parseObservationRow`, `parseSessionSummaryRow`).
- `src/main/memory/store/memory-store-search.ts` — `searchMemoryRecords` / `searchObservationRecords`: FTS5 joins over observations + summaries with type/concept/runtime filters.
- `src/main/memory/store/memory-fts-query.ts` — `buildMemoryFtsQuery`: tokenises, drops stop words, quotes each token for FTS5.
- `src/main/memory/memory-capture.ts` — `MemoryCapture`: subscribes to chat output, sanitises/filters noise, stores interactions, triggers incremental compression. Also exports `sanitizeMemoryText`, `isNoise`, `truncate`.
- `src/main/memory/tool-detector.ts` — `ToolDetector`: regex-scrapes Claude/Gemini PTY output into `ToolUseEvent`s (which file was Read/Edit/Write/Bash).
- `src/main/memory/memory-compressor.ts` — `MemoryCompressor`: incremental (regex) compression during a session and full (AI, regex-fallback) compression at teardown.
- `src/main/memory/compression-prompts.ts` — `buildCompressionPrompt`: the XML-output prompt sent to the compression runtime.
- `src/main/memory/memory-parse.ts` — `parseCompressionResponse`: three-tier XML → JSON → null parsing of the AI response.
- `src/main/memory/memory-regex-fallback.ts` — `buildRegexFallbackResult`: heuristic summary/observation built without any AI call.
- `src/main/memory/memory-classify.ts` — observation-type/concept detection and the interaction-scoring heuristic.
- `src/main/memory/memory-injector.ts` — `MemoryInjector`: builds the `MANIFOLD.md` context block and can strip it again; `injectContext()` is currently disabled.

Shared shapes live in `src/shared/memory-types.ts` (`MemoryInteraction`, `MemoryObservation`, `SessionSummary`, `ToolUseEvent`, `MemorySearchResult`, `MemoryStats`, `MemorySettings`).

## How it works

**One DB per project.** `MemoryStore.getDb(projectId)` lazily opens
`~/.manifold/memory/<projectId>.db` (overridable via the constructor `basePath`), sets
`journal_mode = WAL`, runs `MEMORY_STORE_SCHEMA_SQL`, applies migrations, and caches the
handle in a `Map` (`memory-store.ts:25`). The schema defines four base tables —
`sessions`, `interactions`, `observations`, `session_summaries` — each backed by an FTS5
virtual table kept in sync by `AFTER INSERT`/`AFTER DELETE` triggers
(`memory-store-schema.ts:3`). JSON-array columns (`facts`, `concepts`, `filesTouched`,
`decisionsMade`, `filesChanged`, `toolEvents`) are stored as serialised strings and parsed
back by the parser helpers.

**Capture (write path).** When a session is created or resumed, `SessionManager` calls
`MemoryCapture.startCapturing()` (`session-manager.ts:202`, `:244`), which `upsertSession()`s
the row and subscribes to `chatAdapter.onMessage` (`memory-capture.ts:111`). Each agent/user
message is stripped of any injected memory-context markers, run through `ToolDetector` (agent
messages only), then `storeInteraction()` `sanitizeMemoryText()`s it, drops it if `isNoise()`,
drops likely echoes of recent user input, and otherwise `insertInteraction()`s it
(`memory-capture.ts:206`). Interactive (PTY) sessions also feed raw keystrokes through
`recordInput()`, which decodes CSI/backspace/enter to reconstruct typed user lines
(`memory-capture.ts:145`, called from `session-io-controller.ts:52`).

**Incremental compression.** Every 5th stored interaction
(`INCREMENTAL_COMPRESSION_INTERVAL`), capture calls
`MemoryCompressor.compressIncremental()` (`memory-capture.ts:237`). That reads the
interactions newer than the last-compressed timestamp; once a batch of ≥5 accumulates it runs
the **regex fallback** (no AI cost) and inserts one observation, returning the new high-water
timestamp (`memory-compressor.ts:43`).

**Full compression (teardown).** On developer-mode teardown, `SessionTeardown` calls
`MemoryCompressor.compressSession()` (`session-teardown.ts:100`). It loads all interactions
and, if there are ≥3, resolves the cheapest installed runtime in priority order
`['claude','gemini','codex']` (`memory-compressor.ts:18`), builds the XML prompt with any
accumulated `ToolUseEvent`s, and runs it via `runAiPrompt` (60 s timeout). The response is
parsed three-tier (XML → JSON → null) by `parseCompressionResponse`; on any miss — no runtime,
empty/unparseable output, or thrown error — it falls back to `buildRegexFallbackResult`
(`memory-compressor.ts:91`–`130`). Either way it `insertSessionSummary()` + N
`insertObservation()`, then `endSession()` and clears the session's tool-event buffer.

**Search (read path).** `memory:search` runs `MemoryStore.search()` → `searchMemoryRecords`,
which FTS-matches observations and summaries, applies `type`/`concepts`/`runtimeId` filters,
and orders by FTS `rank` (`memory-store-search.ts:17`). The handler then optionally unions in
raw-interaction FTS matches (only when no runtime/concept filter and type is unset or
`task_summary`) and re-sorts by rank (`memory-handlers.ts:94`). `memory:timeline` paginates
observations + summaries + interactions by an opaque compound `(createdAt, id)` cursor — the
id tiebreak keeps rows that share a timestamp at the page boundary from being skipped; `memory:stats`
returns counts via a single aggregate query (`memory-store.ts:175`).

**Injection.** `MemoryInjector.injectContext()` is called on create and resume
(`session-creator.ts:195`, `session-resume.ts:45`) but returns immediately —
*"Memory injection disabled — feature not ready yet"* (`memory-injector.ts:45`). The
`buildContextMarkdown()` builder (token-budgeted Recent Sessions / Key Observations / Key
Learnings sections wrapped in HTML markers) and `cleanupContextFile()` exist and are tested,
but nothing writes the block into a worktree today.

**Lifecycle & pruning.** All four collaborators are constructed once in `app/index.ts:95`–`101`
and wired into `SessionManager`. On startup `memoryStore.pruneAll(rawRetentionDays ?? 30)`
deletes interactions older than the retention window (`app-lifecycle.ts:67`), opening each
historical `.db` open-prune-close so it does not leak a cached handle (a live cached handle is
reused in place); on quit
`memoryStore.close()` closes every cached DB (`app-lifecycle.ts:95`). `memory:clear` and
`agent:delete-project` call `deleteProject`, which closes the handle and unlinks the `.db`,
`-wal`, and `-shm` files (`memory-store.ts:201`).

## Key types and entry points

- `MemoryStore` — `memory-store.ts:17`. Surface: `getDb`, `upsertSession`/`endSession`, `insertInteraction`/`insertObservation`/`insertSessionSummary`, `search`/`searchObservations`, the `getRecent*`/`getSessionInteractions`/`getObservationsBySession` readers, `getStats`, `prune`/`pruneAll`, `deleteObservation`/`deleteProject`, `close`.
- `MemoryCapture` — `memory-capture.ts:92`. `startCapturing`/`stopCapturing`, `recordInput`, `setMemoryCompressor`.
- `MemoryCompressor` — `memory-compressor.ts:20`. `compressIncremental` (sync, regex), `compressSession` (async, AI+fallback), `addToolEvents`/`getToolEvents`/`clearSession`.
- `MemoryInjector` — `memory-injector.ts:39`. `injectContext` (no-op today), `buildContextMarkdown`, `cleanupContextFile`.
- `ToolDetector.detect()` — `tool-detector.ts:60`. PTY text → `ToolUseEvent[]`.
- `buildCompressionPrompt` / `parseCompressionResponse` / `buildRegexFallbackResult` — the compression pipeline's prompt, parser, and AI-free fallback.

## Interactions

- **Session** (`src/main/session`): the only writer of memory. `SessionManager` owns the instances and calls `startCapturing`/`stopCapturing` (`session-manager.ts:202`, `session-killer.ts:95`); `SessionIoController` forwards keystrokes via `recordInput` (`session-io-controller.ts:52`); `SessionTeardown` triggers `compressSession` (`session-teardown.ts:100`); `SessionCreator`/`resumeAgentSession` call the (disabled) `injectContext`.
- **Chat adapter** (`src/main/agent/chat-adapter`): `chatAdapter.onMessage(sessionId, …)` is the capture subscription source. `ToolUseEvent`s are scraped from this same agent text.
- **Agent runtimes** (`src/main/agent`): `listRuntimesWithStatus()` picks the compression runtime; `runAiPrompt()` executes it in `-p` (print) mode; the regex fallback runs when none is installed.
- **Settings store** (`src/main/store/settings-store`): supplies `MemorySettings` (`rawRetentionDays`, injection budget/method, etc.); `memory:settings` reads/writes them.
- **IPC** (`src/main/ipc/memory-handlers.ts`): `memory:search`, `memory:get`, `memory:timeline`, `memory:stats`, `memory:delete`, `memory:clear`, `memory:settings`. `agent:delete-project` (`agent-handlers.ts:242`) also calls `deleteProject`.
- **App lifecycle** (`src/main/app`): construction (`index.ts:95`), startup prune (`app-lifecycle.ts:67`), shutdown close (`app-lifecycle.ts:95`).

## Invariants & gotchas

- **Injection is disabled.** `injectContext()` returns before doing anything (`memory-injector.ts:45`). Memory is captured, compressed, and searchable, but it is *not* fed back into agent prompts today — `MANIFOLD.md` is never written by this path. The builder/cleanup code is live but unreferenced from the runtime.
- **FTS tables are derived, not authoritative.** `interactions_fts`/`observations_fts`/`session_summaries_fts` are kept in sync purely by triggers (`memory-store-schema.ts:34`+). A raw `INSERT`/`DELETE` that bypasses those triggers would desync search.
- **Migrations are try/catch-swallowed.** `applyMemoryStoreMigrations` runs `ALTER TABLE … ADD COLUMN` and ignores the "duplicate column" error on every subsequent open (`memory-store-schema.ts:116`). New columns must be added there, not in the `CREATE TABLE` body, or older DBs won't get them.
- **Noise filtering is aggressive and shared.** `sanitizeMemoryText` + `isNoise` drop short, mostly-non-alphanumeric, spaced-out-TUI, spinner, and worktree-path lines (`memory-capture.ts:49`, `:69`). The same helpers run again in the search/timeline handlers, so a stored interaction can still be filtered out at read time.
- **Two compression tiers, different triggers.** Incremental compression is regex-only and fires every 5 interactions mid-session; full compression is AI-first (falling back to regex) and fires once at developer-mode teardown. A session killed outside the teardown path gets only the incremental observations, no summary.
- **`compressIncremental` waits for a full batch.** It returns the unchanged `sinceTimestamp` until ≥5 new interactions exist (`memory-compressor.ts:51`), so the high-water mark only advances in batches of five.
- **`endSession` only runs via `compressSession`.** `sessions.endedAt` is stamped in `compressSession`'s `finally` (`memory-compressor.ts:132`); sessions that never reach teardown keep `endedAt = NULL`.
- **Tool-event buffers are in-memory per compressor.** `addToolEvents` accumulates in a `Map` cleared by `compressSession`'s `finally` (teardown path) and by `MemoryCapture.stopCapturing` via `clearSession` (all other kill paths); tool events are not persisted independently of the interaction/observation rows that reference them.
