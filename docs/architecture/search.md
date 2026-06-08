---
description: Manifold's cross-session search — code/file/memory modes, session/project scopes, literal vs regex matching, and the optional AI answer/rerank layer.
covers: [src/main/search]
updated: 2026-06-08
owner: see .github/CODEOWNERS
---

# Search — code, files, and memory across sessions

Search answers one question from the renderer: *given a query, a mode, and a scope,
what matches across this project's agent sessions?* It resolves a scope to a set of
`AgentSession`s, fans the query out across their worktrees (and optional additional
dirs), and merges three result sources — code lines (ripgrep), filenames (substring
scoring), and memory (SQLite FTS) — into one ranked `UnifiedSearchResult[]`. On top of
the exact engine sits an optional AI layer that either re-sorts the exact hits by
relevance (*rerank*) or answers a natural-language question grounded in them (*answer*).
The engine is read-only: it shells out to `rg`/`git`, reads files for context, and
never mutates the repo.

## Covered code

- `src/main/search/search-query-service.ts` — `executeSearchQuery()`, the orchestrator: resolves scope sessions, runs code/file/memory in parallel, merges and limits.
- `src/main/search/search-engine.ts` — root building (`buildCodeSearchRoots`), result factories (`createCodeSearchResult`/`createFileSearchResult`), and `sortAndLimitCodeResults` (dedupe + stable sort).
- `src/main/search/ripgrep-engine.ts` — `searchWithRipgrep()`: spawns `rg --vimgrep` per root, streams/parses lines, enforces a per-root limit and timeout.
- `src/main/search/gitgrep-fallback.ts` — `searchWithGitGrepFallback()`: `git grep` substitute used only when `rg` is absent.
- `src/main/search/code-search-service.ts` — `searchCodeInSessions()`: ripgrep → git-grep fallback, then attaches context lines.
- `src/main/search/code-search-context.ts` — `attachContextToCodeResults()`: reads each matched file once and slices `contextBefore`/`contextAfter`.
- `src/main/search/file-search-service.ts` — `searchFilesInSessions()`: lists files (`rg --files` or `git ls-files`) and scores each path.
- `src/main/search/substring-match.ts` — `substringScore()`: contiguous case-insensitive path matching with basename/boundary bonuses.
- `src/main/search/ai-search-service.ts` — `answerSearchQuestion()`: grounded NL answer with `[Sn]` citations.
- `src/main/search/search-rerank-service.ts` — `maybeRerankSearchResults()`: re-orders exact results by an AI-returned id list.
- `src/main/search/search-prompt-builder.ts` — `buildSearchAnswerPrompt`/`buildSearchRerankPrompt` and the per-source `[Sn]` block formatting.
- `src/main/search/search-ai-runtime.ts` — `resolveSearchAiRuntime()`: picks the runtime (`default` → active session's, else configured id).
- `src/main/search/search-context-service.ts` — `getSearchContext()`: lists a project's sessions (active first) for the scope picker.

Memory matching itself lives in `searchMemory()` inside `search-query-service.ts`; the underlying FTS query/store are in `src/main/memory` (see Interactions).

## How it works

**Modes.** `SearchMode` is `'code' | 'files' | 'memory' | 'everything'`
(`src/shared/search-types.ts:4`). `executeSearchQuery` derives which sources to run:
code runs for `code`/`everything`, files run for `files`/`code`/`everything`, and
memory is gated by `shouldSearchMemory` (`search-query-service.ts:51`) — off for pure
`code`/`files`, and off (with a warning) when the mode is `memory`/`everything` *and*
`matchMode === 'regex'`, since memory has no regex path. Code and file searches run
concurrently (`Promise.all`, `search-query-service.ts:27`); memory runs synchronously
after.

**Scopes.** `SearchScopeKind` is `'active-session' | 'visible-roots' |
'all-project-sessions' | 'memory-only'` (`search-types.ts:6`). `resolveScopeSessions`
(`search-query-service.ts:64`) maps each to sessions: `all-project-sessions` uses the
given `sessionIds` or falls back to `discoverSessionsForProject`; `active-session` and
`visible-roots` resolve the single `activeSessionId`; `memory-only` returns no sessions
(code/file searches are then empty by construction). `visible-roots` additionally pulls
in each session's `additionalDirs` as extra search roots
(`buildCodeSearchRoots`, `search-engine.ts:22`); other scopes only include them when
`scope.includeAdditionalDirs` is set. Roots are de-duplicated by resolved path
(`pushRoot`, `search-engine.ts:134`).

**Code search.** `searchCodeInSessions` (`code-search-service.ts:14`) calls
`searchWithRipgrep`, which spawns one `rg` per root with `--vimgrep --no-heading`
(`buildRipgrepArgs`, `ripgrep-engine.ts:127`). Flags map directly from the request:
`-i` unless `caseSensitive`, `-w` for `wholeWord`, `-F` for `matchMode === 'literal'`
(so regex is the default), plus `-g`/`-g !` for include/exclude globs. Output is
streamed and parsed line-by-line (`/^(.*?):(\d+):(\d+):(.*)$/`,
`ripgrep-engine.ts:159`); each root is killed once it hits `limit`
(`ripgrep-engine.ts:75`) and aborts after a 10 s timeout
(`RIPGREP_TIMEOUT_MS`, `ripgrep-engine.ts:5`). Exit code 1 (no match) yields `[]`;
other non-zero codes reject. Results are deduped by `file:line:column` and stably
sorted by branch → path → line → column (`sortAndLimitCodeResults`,
`search-engine.ts:113`), then each match gets ±`contextLines` (default 1) of
surrounding lines attached by reading the file once (`code-search-context.ts:6`).

**File (filename) search.** `searchFilesInSessions` (`file-search-service.ts:24`) lists
every tracked file via `rg --files` (`buildRipgrepFilesArgs`, `:72`), capped at
`FILE_SCAN_CAP = 20_000` per root (`:11`), then scores each path with
`substringScore`. Matching is a *contiguous* case-insensitive substring — the whole
query must appear verbatim, so scattered letters never match
(`substring-match.ts:16`). Scoring starts at 1000 with a `+100` basename bonus, `+30`
word-boundary bonus (incl. camelCase), minus the match offset and a mild length
penalty; results sort by score descending then path (`file-search-service.ts:66`).

**Memory search.** `searchMemory` (`search-query-service.ts:87`) only runs in literal
mode. It builds an FTS query (`buildMemoryFtsQuery`), then for each project id calls
`memoryStore.search(...)` for compressed summaries and, when no narrowing filters are
set, also runs a raw `interactions_fts MATCH` query for chat-line hits
(`search-query-service.ts:122`). Rows are sanitized/noise-filtered, mapped to
`UnifiedSearchResult` with `source: 'memory'`, sorted by FTS `rank` (ascending = better),
and sliced to `limit`. Memory respects `scope.projectIds` (multi-project), prefixing
result ids with the project id when more than one project is searched
(`toScopedMemoryId`, `:201`).

**Merge.** `mergeResults` (`search-query-service.ts:209`) returns just the relevant
slice for `files`/`memory`; for `code`/`everything` it puts files first (capped at
`FILE_RESULTS_IN_COMBINED = 25` so a broad filename query can't crowd out code), then
code, then memory, capped at `limit` (default 100). The response carries `total`,
`tookMs`, and any accumulated `warnings`.

**AI layer.** The `search:query` handler always runs the exact engine first, then
passes the result through `maybeRerankSearchResults` (`search-handlers.ts:95`). Rerank
is a no-op unless `settings.search.ai` is `enabled`, `mode === 'rerank'`, and there are
≥2 results (`search-rerank-service.ts:23`). It takes the top `maxContextResults`,
builds a prompt asking for source ids in order (`buildSearchRerankPrompt`,
`search-prompt-builder.ts:20`), runs `gitOps.aiGenerate` (45 s timeout), parses
`\bS(\d+)\b` ids, and re-orders that pool ahead of the untouched remainder
(`reorderResults`, `:73`). Any failure or unusable output appends a warning and returns
the exact order unchanged. **Answer** mode is separate (`search:ask` →
`answerSearchQuestion`, `ai-search-service.ts:15`): it requires `mode === 'answer'`,
takes the top `maxContextResults` as citations, prompts the model to answer using only
those sources and cite `[Sn]` (`buildSearchAnswerPrompt`, `:3`, 90 s timeout), then
extracts the cited ids (`extractUsedCitations`, `:80`) and guarantees a citation trail
(`ensureAnswerHasCitationTrail`, `:97`). When the exact retrieval is empty, the ask
handler falls back to keyword-extracted regex (code) + literal (memory) queries before
giving up (`executeAskRetrieval`/`buildAskFallbackQueries`, `search-handlers.ts:121`).

## Key types and entry points

- `executeSearchQuery(deps, request)` — `search-query-service.ts:15`. The exact-search orchestrator; returns `SearchQueryResponse`.
- `maybeRerankSearchResults(deps, request, retrieval)` — `search-rerank-service.ts:15`. AI re-sort, wraps the exact response.
- `answerSearchQuestion(deps, request, retrieval)` — `ai-search-service.ts:15`. Grounded NL answer with citations.
- `getSearchContext(sessionManager, projectId, activeSessionId)` — `search-context-service.ts:4`. Sessions for the scope picker.
- `SearchQueryRequest` / `SearchQueryResponse` — `src/shared/search-types.ts:28` / `:108`. The request carries `mode`, `scope`, `matchMode`, `caseSensitive`, `wholeWord`, glob filters, `limit`, `contextLines`, `memoryFilters`.
- `UnifiedSearchResult` — `search-types.ts:106`. Union of `CodeSearchResult`, `FileSearchResult`, `MemorySearchResultItem`, discriminated by `source`.
- `SearchAiSettings` — `src/shared/types.ts:145`. `{ enabled, mode: 'answer' | 'rerank', runtimeId, citationLimit, maxContextResults }`; defaults `citationLimit: 6`, `maxContextResults: 8` (`src/shared/defaults.ts:35`).

## Interactions

- **IPC** (`src/main/ipc/search-handlers.ts`): registers `search:context`, `search:view-state:get`/`:set`, `search:query` (exact → maybe-rerank), and `search:ask` (retrieval+fallback → answer). These five channels are the entire renderer surface (`src/preload/index.ts:98`).
- **Session manager** (`src/main/session`): `discoverSessionsForProject` resolves scope sessions; `getSession(id)` resolves the active session, its `worktreePath` (the AI runtime cwd), and `runtimeId`. Search reads `worktreePath`, `additionalDirs`, `branchName`, `runtimeId`, `projectId` off each `AgentSession`.
- **Memory** (`src/main/memory`): `memoryStore.search()` (`memory-store.ts:121`) for compressed results; `buildMemoryFtsQuery` (`store/memory-fts-query.ts:38`) for the FTS expression; `sanitizeMemoryText`/`isNoise`/`truncate` from `memory-capture` for the interaction rows.
- **Git ops** (`src/main/git`): `gitOps.aiGenerate(runtime, prompt, cwd, args, opts)` (`git-operations.ts:118`) spawns the runtime for both rerank and answer.
- **Agent runtimes** (`src/main/agent`): `getRuntimeById()` resolves the chosen runtime in `resolveSearchAiRuntime` (`search-ai-runtime.ts:1`).
- **Settings / project / view-state** (`src/main/store`): `settingsStore.getSettings().search?.ai` gates the AI layer; `projectRegistry.getProject()` supplies the fallback cwd; `searchViewStore` persists per-project UI state for the view-state channels.
- **External binaries**: `rg` (ripgrep) is primary; `git grep` / `git ls-files` are fallbacks triggered only on `ENOENT` (ripgrep missing).

## Invariants & gotchas

- **Regex is the default; `-F` is the opt-out.** `matchMode === 'literal'` adds `-F`/`git grep -F`; anything else is treated as a regex (`ripgrep-engine.ts:139`, `gitgrep-fallback.ts:68`). The UI must send `literal` for plain-text queries or regex metacharacters are interpreted.
- **Memory never does regex.** `regex` + a memory-touching mode disables memory with a warning rather than erroring (`shouldSearchMemory`, `search-query-service.ts:55`). The AI ask fallback works around this by issuing a separate literal memory query (`search-handlers.ts:164`).
- **Empty query short-circuits everywhere.** Code, file, and memory paths all bail on a blank trimmed query, so a scope with no query returns nothing rather than every file.
- **The fallback only fires on a missing binary.** `searchCodeInSessions` catches solely `isRipgrepUnavailable` (ENOENT); a real ripgrep error (timeout, bad regex) propagates and surfaces as a failed query (`code-search-service.ts:34`). git-grep results have no `column` and slightly different snippet shape.
- **Per-root limits are not a global limit.** Each `rg`/`git grep` invocation is capped at `limit`, so N roots can yield up to N×`limit` raw matches before `sortAndLimitCodeResults` trims to `limit` (`ripgrep-engine.ts:13`). Filename scanning is separately capped at 20 000 files per root, warning when truncated.
- **AI is strictly post-hoc and best-effort.** Rerank only reorders the exact top `maxContextResults` (never adds/drops results), and answer cites only retrieved sources — both fail soft to the exact results/a warning, so a misconfigured or slow runtime degrades gracefully rather than blocking search.
- **`runtimeId: 'default'` follows the active session.** `resolveSearchAiRuntime` resolves `default` to the active session's runtime, else `settings.defaultRuntime` (`search-ai-runtime.ts:15`); the AI cwd is that session's `worktreePath`, falling back to the project path.
