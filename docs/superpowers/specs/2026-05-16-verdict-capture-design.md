# Verdict Capture per Session — Design

**Date:** 2026-05-16
**Status:** Draft

## Background

Manifold orchestrates parallel coding agents but currently captures only *process* status (`running` / `waiting` / `done` / `error`) via `StatusDetector`. It does not capture *output quality* — whether the user accepted the agent's work, edited it before accepting, or discarded it outright. Without that signal there is no data layer to support future sibling-comparison views, runtime ranking, or self-improving routing.

This spec defines the v1 collection layer only. UI and ranking are out of scope.

## Goal

Persist a per-session record `{task, runtime, outcome, metrics}` to disk as each agent session reaches a terminal state. Derive outcomes from existing lifecycle hooks; do not require new user action.

## Non-goals

- Verdict review UI (`verdicts:list` IPC is exposed for a future spec)
- Cross-project aggregation or ranking
- Runtime selection based on verdict data
- Explicit user-typed ratings

## Outcomes

| Outcome | Signal |
|---|---|
| `merged` | Branch merged into `baseBranch` at worktree-removal time (uses existing ahead/behind logic in `GitOperationsManager`) |
| `pr_created` | `PrCreator` succeeded — soft accept |
| `committed_only` | ≥1 commit but no merge / no PR. Interim during the session as commits land; becomes terminal if the worktree is torn down with the branch surviving but unmerged. |
| `discarded` | Worktree removed with no commits, or removed without merge/PR |
| `unknown` | Session crashed before any terminal signal |

`committed_only` is the only non-terminal state and gets updated in place as the session progresses.

## Captured fields

```ts
// src/shared/verdict-types.ts
export interface VerdictRecord {
  sessionId: string
  projectId: string
  branch: string
  runtime: string                        // 'claude' | 'codex' | 'gemini' | ...
  taskPrompt: TaskPrompt
  outcome: 'merged' | 'pr_created' | 'committed_only' | 'discarded' | 'unknown'
  createdAt: string                      // ISO 8601
  terminatedAt?: string                  // ISO 8601, set on terminal outcome
  durationMs?: number
  metrics: {
    agentCommits: number
    humanEdits: number
    diffLines: { added: number; removed: number }
    filesChanged: number
    prUrl?: string
  }
}

export type TaskPrompt =
  | { kind: 'full'; text: string }
  | {
      kind: 'truncated'
      head: string                       // first 1 KB
      middleSummary: string              // one-line LLM summary or '[middle omitted — N chars]'
      tail: string                       // last 1 KB
      originalLength: number
    }
```

## Components

```
src/main/store/verdict-store.ts          # JSON persistence at ~/.manifold/verdicts.json
src/main/store/prompt-summarizer.ts      # LLM-based middle summarization (with fallback)
src/main/session/verdict-recorder.ts     # Subscribes to lifecycle events, writes to store
src/shared/verdict-types.ts              # VerdictRecord, TaskPrompt
src/main/ipc/verdict-handlers.ts         # verdicts:list, verdicts:get (read-only)
```

All wired in `src/main/index.ts` alongside other managers via dependency injection.

### `VerdictStore`

JSON-backed, append-with-update-by-`sessionId`. Persisted at `~/.manifold/verdicts.json` (same directory and serialization style as `projects.json`, `config.json`). Bounded to the last 1000 records per project (FIFO eviction on write when the cap is exceeded).

Operations:
- `upsert(record)`
- `getBySessionId(sessionId)`
- `listByProject(projectId, limit?)`

### `VerdictRecorder`

Constructor deps: `SessionManager`, `PrCreator`, `GitOperationsManager`, `FileWatcher`, `StatusDetector`, `WorktreeManager`, `VerdictStore`, `PromptSummarizer`, `SettingsStore`.

Lifecycle:

1. **`SessionManager.createSession()`** — recorder writes an initial record with `outcome: 'unknown'`, `createdAt`, full `taskPrompt`, `runtime`, `branch`, `projectId`.
2. **`StatusDetector` transitions to `running` / `waiting`** — recorder tracks `running` time windows for the human-edit heuristic.
3. **`FileWatcher` `files:changed`** while agent is *not* `running` — increment `humanEdits`.
4. **`FileWatcher` git-status poll detects new commit on agent branch** — increment `agentCommits` and set interim outcome to `committed_only`.
5. **`PrCreator` success** — set `outcome: 'pr_created'`, store `prUrl`.
6. **`session-killer.removeWorktreeIfUnused` (or equivalent terminal path)** — finalize:
   - Check merged status against `baseBranch` via existing ahead/behind logic
   - Pick terminal outcome (`merged` / `discarded` / `committed_only` if branch survives but worktree torn down)
   - Snapshot `diffLines` and `filesChanged` from `DiffProvider`
   - Run prompt summarization if `taskPrompt` is over 2 KB
   - Set `terminatedAt`, `durationMs`

### `PromptSummarizer`

Pure function `summarize(middleText, aiSettings) → Promise<string>`.

- If `aiSettings.provider === 'openai'` and `openaiApiKey` set:
  - POST to `https://api.openai.com/v1/chat/completions`
  - Model: `aiSettings.chatModel ?? 'gpt-5.1'`
  - System: "Summarize the user's prompt content in a single sentence (max 200 chars). Focus on intent and constraints."
  - User: the middle text
- If `aiSettings.provider === 'azure'` and `azureApiKey` + `azureEndpoint` + `azureChatDeployment` set:
  - POST to `{endpoint}/openai/deployments/{azureChatDeployment}/chat/completions?api-version=...`
- Otherwise, or on any error/timeout: return `'[middle omitted — N chars]'` where N is `middleText.length`.

Timeout: 10s. No retry. Failure path is silent (logged to `~/.manifold/debug.log` but never blocks the verdict).

### `prompt-truncator` helper

Inside `verdict-recorder.ts` (or co-located helper):

```ts
async function buildTaskPrompt(text: string, summarizer: PromptSummarizer, aiSettings: AiServiceSettings): Promise<TaskPrompt> {
  if (text.length <= 2048) return { kind: 'full', text }
  const head = text.slice(0, 1024)
  const tail = text.slice(-1024)
  const middle = text.slice(1024, -1024)
  const middleSummary = await summarizer.summarize(middle, aiSettings)
  return { kind: 'truncated', head, middleSummary, tail, originalLength: text.length }
}
```

Called only at finalization, so the LLM cost is off the hot path.

### IPC

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `verdicts:list` | invoke | `{ projectId, limit? }` | `VerdictRecord[]` |
| `verdicts:get` | invoke | `{ sessionId }` | `VerdictRecord \| null` |

Both whitelisted in `preload/index.ts`. No renderer code consumes them yet — that's the next spec.

## Settings changes

Rename type `TranscriptionSettings` → `AiServiceSettings` in `src/shared/watch-types.ts`. The settings field name on `Settings` stays `transcription` to avoid config migration.

New optional fields:

```ts
export interface AiServiceSettings {
  provider: 'openai' | 'azure' | 'none'
  openaiApiKey?: string
  azureApiKey?: string
  azureEndpoint?: string
  azureDeployment?: string             // existing — transcription deployment

  chatModel?: string                   // NEW — default 'gpt-5.1'
  azureChatDeployment?: string         // NEW — Azure chat deployment (no default)
}
```

Settings dialog UI:
- Add "Chat model" text input (placeholder and default `gpt-5.1`) — shown when provider is `openai`
- Add "Chat deployment" text input — shown when provider is `azure`

Existing transcriber code keeps working unchanged; only the type name is updated at its import site.

## Data flow diagram

```
  createSession()
      │
      ▼
  VerdictStore.upsert({ outcome: 'unknown', taskPrompt: full })
      │
      ▼
  ─── StatusDetector windows ────────────────────────────────┐
  ─── FileWatcher events ────────────────────────────────────┤
      │                                                       │
      │ agentCommits++ → outcome: 'committed_only'           │
      │ humanEdits++   (when not running)                     │
      │ pr_created     → outcome: 'pr_created' + prUrl       │
      │                                                       │
      ▼                                                       │
  removeWorktreeIfUnused()                                    │
      │                                                       │
      ├─ branch merged? → outcome: 'merged'                  │
      ├─ no commits?    → outcome: 'discarded'               │
      └─ else           → outcome: 'committed_only' (kept)   │
      │                                                       │
      ▼                                                       │
  finalize: snapshot diff, summarize prompt (if >2KB), set    │
           terminatedAt + durationMs                          │
      │                                                       │
      ▼                                                       │
  VerdictStore.upsert(final record) ◄─────────────────────────┘
```

## Error handling

- **Verdict store write failure** — logged, recorder continues. Lost verdicts are tolerable; the recorder is not on the user's hot path.
- **Summarization failure** — silent fallback to `'[middle omitted — N chars]'`. Verdict still written.
- **Crash before terminal outcome** — record stays at `outcome: 'unknown'`. On next app start, no recovery sweep; stale `unknown` records are pruned by the 1000-record cap eventually.
- **Concurrent writes** — `VerdictStore` serializes writes via a simple promise queue (same pattern as `settings-store.ts`).

## Testing

| File | Coverage |
|---|---|
| `verdict-store.test.ts` | Upsert by sessionId, list by project, FIFO eviction at 1000, JSON round-trip |
| `verdict-recorder.test.ts` | Each outcome path: `merged`, `pr_created`, `committed_only`, `discarded`, `unknown`. Human-edit increment when status is `waiting`. Agent-commit increment from git-status events. Finalization snapshots diff/duration. |
| `prompt-summarizer.test.ts` | OpenAI success, Azure success, missing key → fallback, non-2xx → fallback, timeout → fallback, prompt ≤2KB → no call made (this is enforced upstream in recorder, but test the summarizer is never called) |
| `verdict-handlers.test.ts` | IPC list/get round-trip |
| `settings-store.test.ts` (extend) | `chatModel` and `azureChatDeployment` persist and default correctly |

All tests use the existing patterns: fetch mock for HTTP calls (per `transcriber.test.ts`), in-memory store for persistence, event-emitter fakes for lifecycle wiring.

## Open items deferred to follow-up specs

- Sibling comparison view consuming `verdicts:list`
- Cross-project runtime ranking
- Verdict-informed runtime auto-selection
- Azure chat deployment validation in settings (currently trust user input)
- Verdict CSV / JSON export
- Transitioning `pr_created` records to `merged` when the PR is later merged on GitHub (would require polling `gh` or a webhook)
