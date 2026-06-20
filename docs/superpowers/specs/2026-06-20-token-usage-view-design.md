# Token-usage view — design (issue #728)

**Status:** approved design, ready for implementation plan
**Issue:** [#728 — Cost & usage view: tokens and cost per session per runtime](https://github.com/vippsas/manifold/issues/728)
**Date:** 2026-06-20

## Summary

Surface **token usage and turn count per session, per runtime** in the existing
Statistics panel. Tokens are captured from each runtime's own records and finalized into
the per-session verdict at session end, so the data persists in `verdicts.json` and
survives restart.

This is the first slice of #728. **Cost estimation (tokens → dollars) and budget warnings
are explicitly out of scope** — deferred to a follow-up, because they require a maintained
per-model price table. The issue's own non-goals already flag "mark estimates as estimates"
and a missing pricing source of truth; shipping tokens-only avoids that maintenance burden
now.

## Decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Coverage | Interactive Claude + chat-mode; Codex/other = n/a | Interactive parallel agents are the issue's motivation; Claude exposes usage, Codex does not capture it today |
| Cost | Tokens only, no dollars | No price table to maintain; tokens are ground truth |
| Extra metric | Turns per session | Requested: count human prompt→response cycles within a session's working context |
| Surface | Extend `manifold.statistics` plugin | Data already hangs off `VerdictRecord`, which Statistics reads |
| Capture timing | Finalize at session end | Simple, uniform, persists; accepted trade-off below |

**Accepted trade-off of session-end capture:** a long-running interactive agent shows
nothing until it terminates, and a hard force-quit of Manifold misses that session's
tokens. Cleanly-ended sessions satisfy the acceptance criterion "aggregates persist and
survive restart."

## Data model

Extend `VerdictMetrics` (`src/shared/verdict-types.ts:18`). Both new fields are **optional**,
so existing `verdicts.json` records and runtimes that expose nothing stay valid and render
as n/a.

```ts
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface VerdictMetrics {
  agentCommits: number
  humanEdits: number
  diffLines: { added: number; removed: number }
  filesChanged: number
  prUrl?: string
  tokenUsage?: TokenUsage   // absent ⇒ runtime exposed no usage (n/a)
  turns?: number            // human prompt→response cycles; absent ⇒ n/a
}
```

"Per day / over time" needs no stored aggregate — it is bucketing existing `record.createdAt`
timestamps at read-time in the plugin, the same way per-runtime stats are already derived.

## Definitions

- **Turn** = one human prompt → agent response cycle within a session's working context.
  Tool calls / tool results inside a single response do **not** count. So `turns` is how many
  times the human prompted the agent in that session.

## Capture — two sources, one finalize point

Both sources resolve into the same `{ tokenUsage, turns }` and are written by
`VerdictRecorder.onSessionTerminated` (`src/main/session/verdict-recorder.ts:124`), the
existing terminal hook that already finalizes diff stats, outcome, and duration. A single
injected resolver dep keeps the recorder source-agnostic:

```ts
// new VerdictRecorderDeps member
resolveSessionUsage?: (
  sessionId: string,
  worktreePath: string,
  runtime: string,
) => Promise<{ tokenUsage: TokenUsage; turns: number } | null>
```

`onSessionTerminated` calls it through the existing `safe()` wrapper (never throws into the
lifecycle path) and merges the result into `metrics` on the final `store.upsert`.

### Source A — interactive Claude: transcript at session end

Interactive sessions run in a PTY and emit no JSON, but Claude Code writes a durable JSONL
transcript to disk. To locate it deterministically:

1. **Identity plumbing.** Pass `--session-id <session.id>` to the interactive Claude spawn.
   `claude` v2.1.183 supports `--session-id <uuid>` (verified). `session.id` is already a
   `uuidv4` (`session-creator.ts:237`); generate it *before* the spawn so it can be both the
   CLI arg (near the `claudeAnsiThemeArgs` assembly at `session-creator.ts:131`) and the
   `InternalSession.id`.
2. **Locate by uuid, not path encoding.** Claude stores transcripts at
   `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` (encoding replaces `/` and `.` with
   `-`). Rather than re-derive that encoding, glob `~/.claude/projects/*/<session-id>.jsonl`
   — the uuid is unique, so this is robust to any encoding quirk.
3. **Read + sum.** A new pure module `src/main/session/transcript-usage-reader.ts` parses the
   JSONL line-by-line in one pass:
   - sum `message.usage.{input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens}`
     across `assistant` entries;
   - count `turns` = `user` entries that carry a human text message (exclude `tool_result`
     and meta/synthetic entries).
   - Malformed lines are skipped; empty/missing file ⇒ `null`.

### Source B — chat-mode Claude: live accumulation

Chat/print-mode turns already flow through `handleClaudeStreamJsonEvent`
(`src/main/session/session-stream-json.ts:78`), where the `result` event is parsed. That
event carries Claude's `usage` block. Add usage capture there:

- On each `result` event, read `event.usage` and add it to a small per-session accumulator;
  count one turn per completed turn (`markTurnCompleted`, `session-stream-json.ts:339`, which
  already fires once per chat turn).
- Hold the accumulator in a dedicated `SessionUsageAccumulator` (a `Map<sessionId, …>`),
  **not** on `InternalSession`, so it survives independent of session-object teardown during
  kill. The resolver reads and clears it at termination.

The app wires `resolveSessionUsage` (in `src/main/app/index.ts`, where `VerdictRecorder` is
constructed at line 103) to try the accumulator first (chat-mode), then fall back to the
transcript reader when `runtime === 'claude'`. Codex and other runtimes return `null`.

## Surface — extend `manifold.statistics`

`VerdictRecord` already reaches the plugin as `ProjectVerdicts[]`, so the new `metrics` fields
ride along once the shared type is updated (and the plugin's bundled `manifold` type
declaration regenerated).

- `aggregates.ts` (`resources/plugins/manifold.statistics/src/webview/aggregates.ts:28`):
  extend `RuntimeStats` with summed `inputTokens`, `outputTokens`, `cacheReadTokens`,
  `cacheCreationTokens`, and `turns`; sum them in `computeRuntimeStats`. Records without
  `tokenUsage` contribute nothing (n/a).
- `StatisticsPanel.tsx` (`renderRuntimeGrid`, line 167): add a compact tokens/turns line to
  each runtime card (e.g. `1.2M in · 340K out · 18 turns`), showing "—" when a runtime
  exposed nothing.
- Dashboard card summary (optional, low priority): `src/main/plugins/dashboard-summary.ts`
  may add a headline total-tokens number to the Statistics card; can land in a follow-up if
  it grows the diff.

Token counts are formatted compactly (e.g. `1.2M`, `340K`) in a small renderer-side helper.

## Error handling & edge cases

- **Missing / unreadable / not-yet-written transcript** (force-quit before finalize, file
  rotated, glob miss) ⇒ resolver returns `null`; no `tokenUsage`/`turns` written; UI shows
  n/a. Never throws into the lifecycle.
- **Multiple `.jsonl` matches for one uuid** ⇒ should not happen (uuid unique); if it does,
  read the newest by mtime.
- **Pre-feature sessions** ⇒ fields absent ⇒ n/a. No backfill.
- **Codex / unknown runtime** ⇒ n/a by construction.
- **Idempotent re-adoption** (`onSessionCreated` after restart preserves metrics,
  `verdict-recorder.ts:54`) is unaffected — usage is only written at termination.

## Testing

- `transcript-usage-reader` unit tests against fixture `.jsonl`: multi-turn token sums, cache
  tokens, tool-call-heavy single turn counts as 1 turn, malformed line skipped, empty/missing
  file ⇒ null.
- `session-stream-json` chat-mode accumulation from a fixture `result` event with a `usage`
  block (extend existing suite).
- `verdict-recorder` test: `onSessionTerminated` merges resolver output into `metrics`, and
  a `null` resolver leaves metrics untouched (extend `verdict-recorder.test.ts`).
- `aggregates` test: token/turn summing across runtimes including n/a records.
- Gates: `npm run typecheck:web` + `npm run typecheck:node`, full vitest (per the testing
  skill — `better-sqlite3` ABI rebuild as needed).

## Out of scope (follow-ups)

- Cost estimation (price table, dollars) and budget warnings.
- Codex usage capture (no session-id/usage plumbing today).
- Live mid-session token meter (would need a file watcher / live stream parse).
- Per-day time-series chart (current surface is per-runtime aggregate; bucketing exists in
  the data if a chart is wanted later).

## Affected files

| File | Change |
|---|---|
| `src/shared/verdict-types.ts` | add `TokenUsage`, extend `VerdictMetrics` |
| `src/main/session/transcript-usage-reader.ts` | **new** — glob + parse JSONL, sum tokens, count turns |
| `src/main/session/session-usage-accumulator.ts` | **new** — per-session chat-mode usage map |
| `src/main/session/session-stream-json.ts` | capture `usage` + turns on `result` |
| `src/main/session/session-creator.ts` | mint session id pre-spawn; pass `--session-id` to interactive Claude |
| `src/main/session/verdict-recorder.ts` | `resolveSessionUsage` dep; merge at termination |
| `src/main/app/index.ts` | wire resolver (accumulator → transcript reader) |
| `resources/plugins/manifold.statistics/src/webview/aggregates.ts` | sum tokens/turns into `RuntimeStats` |
| `resources/plugins/manifold.statistics/src/webview/StatisticsPanel.tsx` | render tokens/turns per runtime card |
| `docs/architecture/*` | update covering page(s) per the wiki rule |
