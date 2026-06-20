# Codex token-usage capture - design (issue #728)

**Status:** implemented in this worktree
**Issue:** [#728 - Cost & usage view: tokens and cost per session per runtime](https://github.com/vippsas/manifold/issues/728)

## Summary

Extend the token-usage work from Claude to Codex so Statistics can show Codex
token usage and turn counts with the same `VerdictMetrics.tokenUsage` / `turns`
fields already added for Claude.

Codex exposes usage in its local rollout JSONL files, not through a documented
`--session-id` equivalent. The design therefore uses Codex rollout JSONL as the
source of truth for token breakdown, and uses Codex's SQLite thread index when
needed to locate the rollout files for a Manifold agent.

Cost estimation, budget warnings, and UI changes are out of scope. The existing
Statistics surface already aggregates any populated `tokenUsage` and `turns`.

## Research Findings

- Local Codex CLI checked during research: `codex-cli 0.141.0`.
- `codex --help` exposes interactive `resume`, `fork`, `archive`, and related
  session commands, but no documented flag equivalent to Claude's
  `--session-id <uuid>`.
- Codex persists sessions under `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
- Each rollout begins with a `session_meta` record whose payload includes at
  least `id`, `cwd`, `source`, `timestamp`, and `model_provider`.
- Interactive Codex rollouts use `source: "cli"`; `codex exec --json` rollouts
  use `source: "exec"`.
- Both interactive and exec rollouts emit `event_msg` records with
  `payload.type === "token_count"`.
- A `token_count` payload carries `info.total_token_usage`,
  `info.last_token_usage`, and `info.model_context_window`.
- `~/.codex/state_5.sqlite` has a `threads` table with `id`, `rollout_path`,
  `cwd`, `source`, `tokens_used`, `created_at_ms`, `updated_at_ms`, `model`, and
  related metadata. The `tokens_used` value is useful as a locator/check, but it
  does not preserve the input/output/cache breakdown Manifold stores.

Observed Codex token-count fields:

- record shape: `event_msg` with `payload.type === "token_count"`;
- cumulative totals: `payload.info.total_token_usage`;
- per-turn usage: `payload.info.last_token_usage`;
- fields: `input_tokens`, `cached_input_tokens`, `output_tokens`,
  `reasoning_output_tokens`, and `total_tokens`;
- context metadata: `payload.info.model_context_window`.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Coverage | Codex chat-mode and interactive Codex | Both expose local rollout JSONL usage |
| Source of truth | Latest `total_token_usage` in rollout JSONL | It contains the full breakdown and avoids double-counting repeated `token_count` events |
| SQLite use | Allowed locator/index | `threads.rollout_path` is useful for finding files; `threads.tokens_used` stays only a check because it is coarse and can lag |
| Cost | Tokens only, no dollars | Same scope as the Claude slice |
| Reasoning tokens | Do not store separately in this slice | Existing `TokenUsage` has no field for reasoning output; avoid schema churn unless requested |
| Cache mapping | `cached_input_tokens` -> `cacheReadTokens`; `cacheCreationTokens` = 0 | Closest fit to current schema; Codex does not expose Claude-style cache creation tokens in observed data |
| Turns | Count human `user_message` events | Matches the existing definition: human prompt -> response cycles |
| Multiple matching rollouts | Sum them | Overlapping Codex rollouts for the same worktree/window are treated as shards of the same Manifold agent |
| Failure mode | No matching Codex rollout => `null` | Preserve lifecycle safety and render n/a rather than guessing |

## Data Mapping

Existing shared shape:

```ts
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}
```

Codex mapping from the latest rollout `total_token_usage`:

| Codex field | Manifold field |
|---|---|
| `input_tokens` | `inputTokens` |
| `output_tokens` | `outputTokens` |
| `cached_input_tokens` | `cacheReadTokens` |
| no observed equivalent | `cacheCreationTokens: 0` |
| `reasoning_output_tokens` | ignored for now |
| `total_tokens` | not stored; derived as needed from the stored fields |

`reasoning_output_tokens` is intentionally documented but omitted. If the UI
later needs exact Codex total-token accounting, either `TokenUsage` should grow a
`reasoningOutputTokens` field or the Statistics formatter must label totals as
"input + output" rather than "total".

## Capture Design

### Source A - Codex chat-mode (`codex exec --json`)

Chat-mode Codex already flows through `handleCodexJsonEvent` in
`src/main/session/session-stream-json.ts`.

Add handling for `event.type === "event_msg"` and
`payload.type === "token_count"`:

- Read `payload.info.last_token_usage` for live accumulation, or read
  `payload.info.total_token_usage` and replace the session's live total.
- Prefer replacing the live total with `total_token_usage` rather than summing
  `last_token_usage`; it is idempotent if Codex emits duplicate or refreshed
  `token_count` events.
- Count turns from `payload.type === "user_message"` or from the terminal
  `task_complete` event, but not both.

The current `SessionUsageAccumulator` only supports additive per-turn records.
For Codex it should either:

1. gain a `replace(sessionId, usage, turns)` method, or
2. remain Claude-only while a small `CodexUsageAccumulator` stores the latest
   total per session.

The simpler implementation is to extend `SessionUsageAccumulator` with a
replacement method and keep one in-memory usage resolver.

### Source B - interactive Codex (`codex` TUI)

Interactive Codex writes rollout JSONL to disk, but Manifold's PTY stream is TUI
output, not JSONL. Unlike Claude, Codex does not expose a documented
`--session-id` flag to force Manifold's session id into the rollout path.

Interactive resolution should therefore happen at verdict finalization:

1. Query the Codex thread index (`~/.codex/state_5.sqlite`) for candidate rows:
   - `cwd = worktreePath`
   - `source IN ('cli', 'exec')`
   - `created_at_ms` / `updated_at_ms` overlaps the Manifold session window
   - `rollout_path` exists
2. Parse every matching rollout JSONL.
3. For each rollout, take its latest `total_token_usage` and its own
   `user_message` turn count.
4. Sum parsed rollout usage and turns into one Manifold session usage result.
5. If no matching rollout has a token count, return `null`.

This intentionally includes multiple Codex rollouts for the same worktree and
time window. In Manifold terms those rollouts are all part of the same agent
session, even if Codex internally split them into multiple local sessions.

This requires `VerdictRecorder` to pass enough timing information into the usage
resolver. Today the resolver receives only `(sessionId, worktreePath, runtime)`.
For Codex, extend it to include a small context object:

```ts
interface SessionUsageResolveContext {
  sessionId: string
  worktreePath: string
  runtime: string
  createdAtMs: number
  terminatedAtMs: number
}
```

The async and sync resolver forms should both receive the same context so normal
termination and app-quit finalization use the same matching rules.

### Source C - persisted Codex thread id when available

For Codex JSONL sessions that Manifold does observe directly, `thread.started`
already captures `event.thread_id` into `session.codexThreadId`.

When `session.codexThreadId` is available:

- persist it in worktree meta alongside `sessionId`;
- restore it during session discovery;
- prefer it over time-window matching when resolving the rollout.

This is deterministic for Codex chat-mode and any future interactive path that
surfaces the thread id. It does not solve current interactive TUI sessions by
itself, because Manifold does not receive JSONL events from the TUI.

## Reader Design

Create a Codex-specific reader module, separate from the Claude transcript
parser, for example `src/main/session/codex-usage-reader.ts`.

Proposed exports:

```ts
export function codexHomeDir(): string

export interface CodexUsageLocator {
  codexHomeDir: string
  worktreePath: string
  sessionId: string
  codexThreadId?: string
  createdAtMs: number
  terminatedAtMs: number
}

export function readCodexUsage(opts: CodexUsageLocator): Promise<SessionUsage | null>
export function readCodexUsageSync(opts: CodexUsageLocator): SessionUsage | null
export function parseCodexRolloutUsage(raw: string): SessionUsage | null
```

Parsing rules:

- Iterate JSONL line-by-line.
- Ignore malformed lines.
- Track the latest valid `payload.info.total_token_usage` from
  `event_msg/token_count`.
- Count `turns` from `event_msg/user_message`.
- Return `null` if no token count was found.
- Return `{ tokenUsage, turns }` when a token count exists, even when turns is
  zero.

Locator rules:

- Use `better-sqlite3` for the Codex thread index when available; Manifold
  already ships this dependency for its own SQLite-backed stores.
- If `codexThreadId` is known, prefer the `threads.id = codexThreadId` row.
- Otherwise query candidate `threads` rows by `cwd`, `source IN ('cli', 'exec')`,
  and the Manifold session time window; parse and sum every matching rollout.
- If SQLite is unreadable or unavailable, optionally scan today's rollout
  directory and parse `session_meta` records for `cwd` / `source` / timestamp.
  This fallback should be conservative about the time window, but should still
  sum all matching rollouts rather than treating multiple matches as ambiguous.

## App Wiring

Update the `VerdictRecorder` usage resolver shape to pass timing context.

Resolver order in `src/main/app/index.ts`:

1. Drain live accumulated usage. This covers Claude chat-mode and Codex
   chat-mode.
2. If `runtime === 'claude'`, read Claude transcript usage.
3. If `runtime === 'codex'`, read Codex rollout usage.
4. Otherwise return `null`.

The sync resolver mirrors the same order for `before-quit`.

## Persistence

Extend worktree meta with `codexThreadId?: string` and persist it when present.
This preserves deterministic lookup across restart for Codex sessions where the
thread id was visible to Manifold.

For current interactive Codex TUI sessions, the fallback remains SQLite
time-window matching because the thread id is not visible in the PTY stream.

## Error Handling & Edge Cases

- **No rollout found** => return `null`; Statistics shows n/a.
- **Multiple matching rollouts** => sum them; this is expected when Codex splits
  one Manifold agent's work into several local rollouts.
- **SQLite locked/unreadable** => fall back to conservative rollout scan or
  return `null`; never throw into session termination.
- **Active app quit** => use sync reader. The rollout JSONL may have a more
  recent token count than SQLite `tokens_used`; parse JSONL when possible.
- **Pre-feature Codex sessions** => no backfill required.
- **Reasoning tokens** => not stored; documented as an accepted limitation.
- **Ollama Codex** => out of scope unless its rollout format is verified to match
  Codex CLI.

## Testing

- `codex-usage-reader` parser tests:
  - latest `total_token_usage` wins across multiple `token_count` events;
  - `last_token_usage` is not summed;
  - malformed lines are skipped;
  - missing token count returns `null`;
  - `user_message` events count turns.
- `codex-usage-reader` locator tests:
  - known thread id resolves the matching rollout;
  - unique cwd/time-window match resolves;
  - multiple cwd/time-window matches are summed;
  - unreadable SQLite returns `null` or uses the conservative fallback.
- `session-stream-json` tests:
  - Codex `token_count` updates live usage;
  - Codex user-message/turn handling does not double-count turns.
- `verdict-recorder` tests:
  - resolver receives created/terminated timestamps;
  - Codex resolver output is merged into metrics;
  - `null` resolver leaves metrics untouched.

## Affected Files

| File | Change |
|---|---|
| `src/main/session/codex-usage-reader.ts` | new Codex rollout locator/parser |
| `src/main/session/codex-usage-reader.test.ts` | new parser and locator tests |
| `src/main/session/session-stream-json.ts` | capture Codex `token_count` live |
| `src/main/session/session-usage-accumulator.ts` | add replace/update-total support |
| `src/main/session/session-types.ts` | optionally carry `codexThreadId` persistently |
| `src/main/git/worktree-meta.ts` | persist `codexThreadId` |
| `src/main/session/session-meta-persister.ts` | write `codexThreadId` |
| `src/main/session/session-discovery.ts` | restore `codexThreadId` |
| `src/main/session/verdict-recorder.ts` | pass timing context to usage resolver |
| `src/main/app/index.ts` | wire Codex usage resolver after live/Claude checks |
| `docs/architecture/session.md` | update code-grounded session usage docs when code lands |

## Open Questions

1. Should `TokenUsage` grow `reasoningOutputTokens`, or should Codex reasoning
   tokens stay documented-but-omitted for this slice?
2. Should `ollama-codex` share this path before its usage format is verified?
