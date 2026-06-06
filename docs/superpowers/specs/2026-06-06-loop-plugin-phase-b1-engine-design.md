# Loop-as-a-Plugin — Phase B1: Headless Engine Plugin — Design

**Status:** Design (approved direction — standing pre-approval). Plan to follow via `writing-plans`.
**Date:** 2026-06-06
**Depends on:** Phase A (PR #443) — `manifold.agents`, `manifold.lm`, `workspace.workspaceFolders`.

---

## Why this exists

Phase A shipped the privileged APIs. Phase B moves the loop **logic** into a real plugin.
It splits in two:

- **B1 (this spec):** the loop engine runs inside the plugin (extension host), driven by
  **contributed commands**. No UI yet. Verifiable by unit tests + invoking the commands
  against a live session. The built-in loop feature is **untouched** and coexists.
- **B2 (next spec):** port the React UI into a webview bundle and wire it to the plugin.

Phase C (later) flips the contribution `internal`→`plugin` and deletes the core loop.

### Why split B1/B2

The UI port is large and independent: the webview is a sandboxed iframe (`sandbox=
"allow-scripts"`) served a single nonce-CSP HTML blob (`script-src 'nonce-…'`,
`connect-src 'none'`). That means inlining a bundled React app, replicating theme CSS
variables (unavailable in the iframe), replacing `window.confirm` (blocked) with
`manifold.window.showWarningMessage`, and a postMessage protocol — none of which the engine
needs. B1 delivers a working, testable engine without any of that.

---

## The plugin

`resources/plugins/manifold.loop/` — a first-party **builtin-origin** plugin (so it may
hold the privileged `agent:control` and `lm` capabilities).

### Manifest (`package.json`)

```jsonc
{
  "name": "loop",
  "publisher": "manifold",
  "version": "0.0.1",
  "displayName": "Autoresearch Loop",
  "engines": { "manifold": "^0.3.0" },
  "main": "./out/plugin.js",
  "activationEvents": ["onCommand:manifold.loop.start", "onCommand:manifold.loop.status"],
  "capabilities": ["agent:control", "lm", "workspace:read", "storage"],
  "contributes": {
    "commands": [
      { "command": "manifold.loop.start", "title": "Loop: Start" },
      { "command": "manifold.loop.stop", "title": "Loop: Stop" },
      { "command": "manifold.loop.status", "title": "Loop: Status" },
      { "command": "manifold.loop.iterations", "title": "Loop: Iterations" },
      { "command": "manifold.loop.clear", "title": "Loop: Clear" },
      { "command": "manifold.loop.restoreBest", "title": "Loop: Restore Best" },
      { "command": "manifold.loop.setConfig", "title": "Loop: Set Config" }
    ]
  }
}
```

No `views` contribution in B1 (that is B2). The commands are the headless control surface;
they mirror the existing `loop:*` IPC handlers so B2's webview (and tests) can drive the
engine.

### Command surface (the contract)

| Command | Args | Returns |
|---|---|---|
| `manifold.loop.start` | `LoopConfig` | `LoopStatus` (initial) |
| `manifold.loop.stop` | `sessionId` | `LoopStatus` |
| `manifold.loop.status` | `sessionId` | `LoopStatus \| null` |
| `manifold.loop.iterations` | `sessionId` | `LoopIteration[]` |
| `manifold.loop.clear` | `sessionId` | `LoopStatus` |
| `manifold.loop.restoreBest` | `sessionId` | `{ sha }` |
| `manifold.loop.setConfig` | `sessionId, LoopConfig` | `LoopConfig` |

`start` is fire-and-forget (the engine runs in the background and persists progress);
the command returns the initial running status immediately, matching `loop-handlers.ts`.

---

## Engine architecture

A self-contained `LoopEngine`, ported from `src/main/loop/loop-runner.ts`, with deps
injected so each is unit-testable. **All logic and types are copied into the plugin** so it
is standalone (Phase C deletes the core copies).

### Files (under `resources/plugins/manifold.loop/src/`)

- `types.ts` — copy of `src/shared/loop-types.ts` (pure types; keeps the plugin standalone).
- `eval.ts` — copy of `loop-eval.ts` (`parseMetric`, `isImprovement`; pure).
- `judge.ts` — copy of the **pure** parts of `loop-judge-adapter.ts` (`buildJudgePrompt`,
  `extractScore`) + a `createJudge(lm)` that calls `manifold.lm`.
- `git.ts` — `createGitAdapter()` via `node:child_process` (copy of `createGitAdapter`).
- `eval-runner.ts` — `createEvalRunner()` via `node:child_process` (copy of `createEvalRunner`).
- `iteration-log.ts` — copy of `loop-iteration-log.ts` (`node:fs`/`os`/`crypto`; writes
  `~/.manifold/loop-logs/<sha256(worktree)[:16]>.jsonl`).
- `store.ts` — config/status persistence over `manifold.storage.global`, keyed per session
  (`loop.config.<sessionId>`, `loop.status.<sessionId>`).
- `engine.ts` — `LoopEngine` (the ported runner; see below).
- `plugin.ts` — `activate()`: build deps from `manifold`, construct the engine, register the
  seven commands.

### `LoopEngine` (ported runner)

Same drive/iteration logic as `LoopRunner.drive`/`runOneIteration`, with two changes:

1. **Agent driving collapses into `runTurn`.** The old `session.sendInput(prompt)` +
   `waitForTurnEnd(...)` (and the `/clear` dance) become a single
   `await deps.runTurn(prompt, { budgetSeconds, clearContext })` returning
   `'ended' | 'timeout' | 'aborted'`. The `runTurn` dep wraps
   `manifold.agents.activeAgent.runTurn`.
2. **Session pinning.** `start` captures `manifold.agents.activeAgent?.sessionId` as the
   target. Before each turn the engine asserts the active agent still matches; if not (user
   switched sessions, or no active agent), it stops with
   `state: 'error', errorMessage: 'active session changed'`. (Phase A exposes only
   `activeAgent`; pinning avoids driving the wrong agent. A future `agents.get(id)` would
   remove this constraint.)

Everything else is preserved verbatim: baseline SHA, per-iteration `getHeadSha`,
changed-files gate, eval/skip-eval, llm-judge vs parsed metric, `isImprovement`,
commit-on-improve / `alwaysAdvance` roll-forward / `hardReset` on regress, timeout/abort
resets, iteration log append, status publish.

`deps` shape:

```ts
interface LoopEngineDeps {
  git: LoopGitAdapter
  evalRunner: LoopEvalRunner
  judge: (req: JudgeRequest, signal: AbortSignal) => Promise<JudgeResult>
  iterationLog: { append; readAll; clear }
  runTurn: (prompt: string, opts: { budgetSeconds: number; clearContext: boolean }, signal: AbortSignal) => Promise<TurnOutcome>
  activeSessionId: () => string | undefined   // manifold.agents.activeAgent?.sessionId
  worktreePath: () => string | undefined      // manifold.workspace.workspaceFolders?.[0]?.uri
  store: { getStatus; setStatus; clearStatus; getConfig; setConfig }
  emit?: (event: 'status' | 'iteration', payload: unknown) => void  // B2 wires this to the webview; B1 default no-op
  now?: () => number
}
```

### Mapping vs Phase A APIs

| Engine need | Source |
|---|---|
| drive agent + await turn end | `manifold.agents.activeAgent.runTurn` |
| LLM judge | `manifold.lm.selectChatModels()[0].sendRequest` |
| worktree path | `manifold.workspace.workspaceFolders[0].uri` (fallback `activeSession.worktreePath`) |
| config/status persistence | `manifold.storage.global` (keyed by sessionId) |
| git / eval / iteration-log | Node `child_process` / `fs` in the host |

---

## Coexistence with core loop (B1)

- The plugin contributes **commands only** (no view), so there is no duplicate panel and no
  launcher entry. The built-in loop panel keeps working via its `loop:*` IPC.
- Command ids are namespaced `manifold.loop.*`; no collision with the core `loop:*` IPC.
- The iteration log path is computed identically, so the plugin reads/writes the same JSONL
  files as core loop for a given worktree — they observe the same history. They are not run
  simultaneously in practice (engine via plugin commands; core via the panel).

---

## Testing strategy

Port `loop-runner.test.ts` to `engine.test.ts`, adapted to the `runTurn` dep (the test
already fakes git/eval/judge/iterationLog; replace the `session.sendInput`+`waitForTurnEnd`
fakes with a `runTurn` fake). Cover: improve→commit, regress→reset, `alwaysAdvance`
roll-forward, eval timeout/crash reset, llm-judge path, skip-eval, max-iterations, abort,
and the new **session-pinning** guard (active agent changes mid-run → `error`).

Adapter/helper tests:
- `eval.test.ts` — copy of `loop-eval.test.ts`.
- `iteration-log.test.ts` — copy of `loop-iteration-log.test.ts` (temp dir).
- `git.test.ts` — `createGitAdapter` against a temp `git init` repo (commit/reset/diff/head/
  changed-count round-trip).
- `judge.test.ts` — `buildJudgePrompt`/`extractScore` (copied cases) + `createJudge` calling
  a fake `lm`.
- `store.test.ts` — config/status round-trip over a fake `storage.global`.

Build: extend nothing — `build-plugins.mjs` already compiles `src/plugin.ts` → `out/plugin.js`
(entry derived from manifest `main`). The plugin's internal modules are bundled by esbuild.

---

## Verification gates

- New plugin tests green; full suite green.
- `typecheck:node`/`typecheck:web` no new errors vs baseline (node=16, web=36);
  `typecheck:plugins` clean for the new plugin sources.
- `npm run build:plugins` builds `manifold.loop` (`out/plugin.js` present).
- Core loop untouched: empty diff under `src/main/loop`, `src/renderer/components/loop`,
  `loop-handlers.ts`.
- Manual dev smoke (owed, recorded): with a live session, `manifold.loop.start` with a
  config drives the agent, runs eval, commits improvements, and appends iterations — parity
  with the built-in panel.

---

## Out of scope (B1)

- The webview UI, theming, message protocol, view contribution → **B2**.
- Removing core loop / flipping the contribution → **Phase C**.
- `agents.get(sessionId)` (multi-session targeting) — B1 pins the active session.
- Streaming `lm`.

---

## Self-review notes

- **Placeholders:** none — every file and its source-of-port is named.
- **Consistency:** command surface mirrors `loop-handlers.ts`; engine logic mirrors
  `loop-runner.ts` with the two stated changes (runTurn collapse, session pinning); types
  copied from `loop-types.ts`.
- **Scope:** one plugin, engine + commands + tests; UI explicitly deferred to B2. Standalone
  (copies, no cross-tree imports) so Phase C deletion of core loop can't break it.
- **Ambiguity resolved:** "the session" is the active agent's session, pinned at `start`;
  persistence keys defined; iteration-log path identical to core.
