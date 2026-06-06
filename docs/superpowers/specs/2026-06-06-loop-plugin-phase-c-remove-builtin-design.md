# Loop-as-a-Plugin — Phase C: Remove the Built-in Loop — Design

**Status:** Design (standing pre-approval). Plan to follow via `writing-plans`.
**Date:** 2026-06-06
**Depends on:** A (#443), B1 (#444), B2a (#445), B2b (#446) — the `manifold.loop` plugin is feature-complete.

---

## Why this exists

The loop now exists as a complete plugin (`resources/plugins/manifold.loop/`). Phase C is the
finale: **delete the built-in loop** and make the plugin the canonical, only loop. After this,
core no longer contains loop logic, UI, IPC, or types — fulfilling the original goal of
decoupling loop into a real plugin.

This is the one phase that *touches and removes* the built-in feature. It is a deletion +
reference-cleanup pass; no new behavior.

---

## What gets deleted

- `src/main/loop/` — entire directory (`loop-runner.ts`, `loop-runner-types.ts`,
  `loop-adapters.ts`, `loop-eval.ts`, `loop-judge-adapter.ts`, `loop-iteration-log.ts`, all
  `*.test.ts`, `loop-runner.test-helpers.ts`).
- `src/main/ipc/loop-handlers.ts`.
- `src/renderer/components/loop/` — entire directory (`LoopPanel.tsx`, `LoopConfigForm.tsx`,
  `LoopIterationList.tsx`, `LoopPanel.styles.ts`, `LoopPanel.helpers.ts`).
- `src/renderer/hooks/useLoop.ts`.
- `src/shared/loop-types.ts` (its only non-loop consumer is `session-types`, edited below).

## What gets edited (remove references)

- **`src/main/app/index.ts`** — remove the `LoopRunner` import and the loop-adapters import
  block (`createSessionAdapter`/`createGitAdapter`/`createEvalRunner`/`createJudgeAdapter`/
  `createEmitter`/`createIterationLog`/`createWaitForTurnEnd`); remove the `new LoopRunner({…})`
  construction; remove `loopRunner` from the object passed to the IPC deps. `gitOps` and
  `sessionManager` stay (still used by `PluginManager`).
- **`src/main/ipc/types.ts`** — remove `import type { LoopRunner }` and the `loopRunner: LoopRunner`
  field from `IpcDependencies`.
- **`src/main/app/ipc-handlers.ts`** — remove the `registerLoopHandlers` import and its call.
- **`src/preload/index.ts`** — remove all `loop:*` channels: invoke channels (`loop:start`,
  `loop:stop`, `loop:status`, `loop:iterations`, `loop:config`, `loop:set-config`,
  `loop:restore-best`, `loop:clear`) and receive channels (`loop:status-changed`,
  `loop:iteration`, `loop:eval-output` — the last is vestigial).
- **`src/main/session/session-types.ts`** — remove the `loopConfig?`/`loopStatus?` fields from
  `InternalSession` and the `import type { LoopConfig, LoopStatus }`.
- **`src/renderer/plugins/internal-contributions.ts`** — remove the `loop` entry and the
  `LoopPanel` import. `INTERNAL_PANELS` becomes `backgroundAgent`, `verdicts`, `watch`.
- **`src/renderer/components/editor/dock-panels.tsx`** — update the comment that lists `loop`
  among contribution-sourced panels (cosmetic; no code change — `loop`'s component left
  `getPanelComponents()` automatically when its `INTERNAL_PANELS` entry was removed).

## Tests to update

- **`src/renderer/plugins/internal-contributions.test.ts`** — expected ids
  `['backgroundAgent', 'verdicts', 'watch']`.
- **`src/renderer/components/editor/dock-panels.contributions.test.tsx`** — remove the
  `LoopPanel` import and the `PANEL_COMPONENTS.loop` assertion; retitle "four module panels"
  → "three module panels".

(The deleted `src/main/loop/*.test.ts` and any loop component tests are removed with their
sources — that coverage now lives in the plugin's own test suite.)

## Make the plugin canonical

`resources/plugins/manifold.loop/package.json` view contribution:
- `title`: `"Loop (plugin)"` → `"Autoresearch Loop"`
- `description`: → `"Autoresearch loop: edit → eval → keep-or-discard."`

The loop now appears exactly once in the "+ Apps" launcher, served by the plugin's webview.

## Migration

**None required.**
- **Iteration history** persists: the plugin writes/reads the same
  `~/.manifold/loop-logs/<sha256(worktree)[:16]>.jsonl` path the built-in used, so existing
  history is visible in the plugin panel unchanged.
- **Config/status** were stored only in-memory on `InternalSession` (never serialized to disk),
  so there is nothing to migrate; a user re-enters config once (the plugin persists it in
  `storage.global` going forward).
- **Dock layout**: a saved layout referencing the old panel id `loop` will simply not resolve
  that panel (the dock ignores unknown panel ids); users reopen "Autoresearch Loop" from the
  launcher. Acceptable for this transition; noted, not mitigated.

---

## Verification gates

- Full suite green (the loop plugin suite + everything else; deleted core-loop tests simply no
  longer run).
- `typecheck:node` and `typecheck:web`: **no new errors**, counts **≤ baseline** (16 / 36).
  Counts may *drop* — e.g. `loop-judge-adapter.ts` imported a non-exported `GitOperations`
  type, likely part of the baseline; its deletion should reduce the node count. Record the new
  numbers.
- `typecheck:plugins` clean; `build:plugins` emits `manifold.loop/out/{plugin,webview}.js`.
- **Built-in loop fully gone:** `git grep -n "loop:" -- src/main src/preload` returns nothing;
  `git grep -rn "from '.*loop" -- src` returns no references to the deleted modules; no
  `src/main/loop`, `src/renderer/components/loop`, `src/renderer/hooks/useLoop.ts`,
  `src/shared/loop-types.ts` remain.
- Loop appears once in the launcher as "Autoresearch Loop" (the plugin).

---

## Out of scope

- Any behavior change to the loop itself (parity was achieved in B1/B2).
- Reworking the plugin's internals.
- Removing the duplicated turn-end heuristic from `agent-control-service.ts` — it is the
  permanent home (the core copy in `loop-adapters.ts` is what gets deleted here). No further
  dedup needed.

---

## Self-review notes

- **Placeholders:** none — every deleted path and every edited reference is enumerated from an
  exhaustive `git grep` of the codebase.
- **Consistency:** `shared/loop-types` deletion is safe because its only non-loop consumer
  (`session-types` fields) is removed in the same phase; `gitOps`/`sessionManager` are retained
  because `PluginManager` (not loop) uses them.
- **Scope:** removal + reference cleanup + manifest retitle; one cohesive change. No migration
  code (justified above).
- **Ambiguity resolved:** "no new errors, counts may drop" is the typecheck gate (deletion can
  only remove errors); dock-layout orphan is explicitly accepted, not mitigated.
