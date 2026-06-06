# Loop-as-a-Plugin — Phase C: Remove the Built-in Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the built-in loop (logic, UI, IPC, types) and make the `manifold.loop` plugin the canonical, only loop.

**Architecture:** Remove all references first (renderer contribution, main wiring, preload, session fields), then delete the now-orphaned files, then verify. Every intermediate commit still type-checks because the deleted files remain self-consistent until the final delete. No migration code — iteration history persists via the shared log path; loop config was in-memory only.

**Tech Stack:** TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-06-06-loop-plugin-phase-c-remove-builtin-design.md`.

---

## Conventions (read once)

- Gates: `typecheck:node` (baseline 16), `typecheck:web` (baseline 36) — **no new errors; counts may drop**. `typecheck:plugins` clean.
- If `.gitignore` shows an uncommitted `docs/superpowers/` line, run `git restore --source=HEAD .gitignore` (and `rm -f $(git rev-parse --git-dir)/index.lock` if a commit hits a stale lock) before committing.
- Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File map

**Edited:** `resources/plugins/manifold.loop/package.json`, `src/renderer/plugins/internal-contributions.ts`, `src/renderer/plugins/internal-contributions.test.ts`, `src/renderer/components/editor/dock-panels.contributions.test.tsx`, `src/renderer/components/editor/dock-panels.tsx`, `src/main/app/index.ts`, `src/main/ipc/types.ts`, `src/main/app/ipc-handlers.ts`, `src/preload/index.ts`, `src/main/session/session-types.ts`.

**Deleted:** `src/main/loop/` (dir), `src/main/ipc/loop-handlers.ts`, `src/renderer/components/loop/` (dir), `src/renderer/hooks/useLoop.ts`, `src/shared/loop-types.ts`.

---

## Task 1: Make the plugin view canonical

**Files:** Modify `resources/plugins/manifold.loop/package.json`

- [ ] **Step 1: Retitle the view**

Change the `views` entry:
```jsonc
    "views": [
      { "id": "manifold.loop.panel", "title": "Autoresearch Loop", "description": "Autoresearch loop: edit → eval → keep-or-discard.", "launcher": true }
    ],
```

- [ ] **Step 2: Build + commit**

Run: `npm run build:plugins` → builds `manifold.loop` (manifest change only; still emits `out/{plugin,webview}.js`).

```bash
git add resources/plugins/manifold.loop/package.json
git commit -m "feat(loop-plugin): make the plugin loop view canonical (Autoresearch Loop)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Remove the renderer internal contribution + tests

**Files:** Modify `src/renderer/plugins/internal-contributions.ts`, `internal-contributions.test.ts`, `src/renderer/components/editor/dock-panels.contributions.test.tsx`, `src/renderer/components/editor/dock-panels.tsx`

- [ ] **Step 1: Remove the loop entry + import**

In `src/renderer/plugins/internal-contributions.ts`, remove the `LoopPanel` import line:
```ts
import { LoopPanel } from '../components/loop/LoopPanel'
```
and remove the entire `loop` object from `INTERNAL_PANELS`:
```ts
  {
    id: 'loop',
    title: PANEL_TITLES.loop,
    description: 'Autoresearch loop: edit → eval → keep-or-discard.',
    launcher: true,
    source: 'internal',
    component: LoopPanel,
  },
```

- [ ] **Step 2: Update the internal-contributions test**

In `src/renderer/plugins/internal-contributions.test.ts`, change the expected ids:
```ts
    expect(INTERNAL_PANELS.map((p) => p.id)).toEqual([
      'backgroundAgent', 'verdicts', 'watch',
    ])
```

- [ ] **Step 3: Update the dock contributions test**

In `src/renderer/components/editor/dock-panels.contributions.test.tsx`, remove the import
`import { LoopPanel } from '../loop/LoopPanel'`, change the title "sources the four module
panels…" → "sources the three module panels from the contribution registry", and remove the
assertion line `expect(PANEL_COMPONENTS.loop).toBe(LoopPanel)`.

- [ ] **Step 4: Update the dock-panels comment (cosmetic)**

In `src/renderer/components/editor/dock-panels.tsx`, update the comment:
```ts
  // backgroundAgent, verdicts, watch — sourced from the contribution
  // registry (registered as internal contributions in src/renderer/plugins).
```

- [ ] **Step 5: Run the affected tests + commit**

Run: `npx vitest run src/renderer/plugins/internal-contributions.test.ts src/renderer/components/editor/dock-panels.contributions.test.tsx`
Expected: PASS.

(`PANEL_TITLES.loop` in `dock-layout-helpers.ts` may now be unused by INTERNAL_PANELS but is
referenced elsewhere or harmless; leave it — removing it is out of scope and risks unrelated
churn. If `typecheck:web` later flags it as unused, it won't — unused object keys aren't errors.)

```bash
git add src/renderer/plugins/internal-contributions.ts src/renderer/plugins/internal-contributions.test.ts src/renderer/components/editor/dock-panels.contributions.test.tsx src/renderer/components/editor/dock-panels.tsx
git commit -m "feat(loop): drop the built-in loop internal contribution

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Remove main-process loop wiring

**Files:** Modify `src/main/app/index.ts`, `src/main/ipc/types.ts`, `src/main/app/ipc-handlers.ts`

- [ ] **Step 1: `app/index.ts` — remove imports**

Remove these two import groups:
```ts
import { LoopRunner } from '../loop/loop-runner'
import {
  createSessionAdapter,
  createGitAdapter,
  createEvalRunner,
  createJudgeAdapter,
  createEmitter,
  createIterationLog,
  createWaitForTurnEnd,
} from '../loop/loop-adapters'
```

- [ ] **Step 2: `app/index.ts` — remove the runner construction**

Remove the block:
```ts
const loopRunner = new LoopRunner({
  session: createSessionAdapter(sessionManager),
  git: createGitAdapter(),
  evalRunner: createEvalRunner(),
  judge: createJudgeAdapter(sessionManager, gitOps),
  emitter: createEmitter(() => mainWindow),
  iterationLog: createIterationLog(),
  waitForTurnEnd: createWaitForTurnEnd(sessionManager),
})
```

- [ ] **Step 3: `app/index.ts` — drop it from ipcDeps**

In the `const ipcDeps = { … }` object, remove the line:
```ts
  loopRunner,
```

- [ ] **Step 4: `ipc/types.ts` — remove import + field**

Remove `import type { LoopRunner } from '../loop/loop-runner'` and the
`loopRunner: LoopRunner` line from `IpcDependencies`.

- [ ] **Step 5: `app/ipc-handlers.ts` — remove import + call**

Remove `import { registerLoopHandlers } from '../ipc/loop-handlers'` and the
`registerLoopHandlers(deps)` line.

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck:node 2>&1 | grep -cE "error TS"`
Expected: ≤ 16, no new errors. (`loop-handlers.ts` still exists and is now unimported — it
still type-checks against the not-yet-deleted loop modules.)

```bash
git add src/main/app/index.ts src/main/ipc/types.ts src/main/app/ipc-handlers.ts
git commit -m "feat(loop): remove main-process loop runner + IPC wiring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Remove preload loop channels

**Files:** Modify `src/preload/index.ts`

- [ ] **Step 1: Remove the invoke channels**

Remove these contiguous lines from the allowed-invoke list:
```ts
  'loop:start',
  'loop:stop',
  'loop:status',
  'loop:iterations',
  'loop:config',
  'loop:set-config',
  'loop:restore-best',
  'loop:clear',
```

- [ ] **Step 2: Remove the listen channels**

Remove these contiguous lines from the allowed-listen list:
```ts
  'loop:status-changed',
  'loop:iteration',
  'loop:eval-output',
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck:node 2>&1 | grep -cE "error TS"` → ≤ 16.

```bash
git add src/preload/index.ts
git commit -m "feat(loop): drop loop:* IPC channels from the preload allowlist

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Remove session loop fields

**Files:** Modify `src/main/session/session-types.ts`

- [ ] **Step 1: Remove the import + fields**

Remove `import type { LoopConfig, LoopStatus } from '../../shared/loop-types'` and the two
fields from `InternalSession`:
```ts
  /** Autoresearch loop configuration for this session, if any */
  loopConfig?: LoopConfig
  /** Latest loop run status; kept even after the runner completes so the UI can show history */
  loopStatus?: LoopStatus
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck:node 2>&1 | grep -cE "error TS"` → ≤ 16.
(`shared/loop-types.ts` now has no non-loop importers; it is deleted in Task 6.)

```bash
git add src/main/session/session-types.ts
git commit -m "feat(loop): drop in-memory loop fields from InternalSession

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Delete the built-in loop files

**Files:** Delete `src/main/loop/`, `src/main/ipc/loop-handlers.ts`, `src/renderer/components/loop/`, `src/renderer/hooks/useLoop.ts`, `src/shared/loop-types.ts`

- [ ] **Step 1: Delete with git**

```bash
git rm -r src/main/loop src/renderer/components/loop
git rm src/main/ipc/loop-handlers.ts src/renderer/hooks/useLoop.ts src/shared/loop-types.ts
```

- [ ] **Step 2: Confirm no dangling references**

Run: `git grep -n "shared/loop-types\|/loop/loop-\|hooks/useLoop\|loop-handlers\|components/loop/Loop" -- src`
Expected: **empty**.

Run: `git grep -n "loop:" -- src/main src/preload`
Expected: **empty**.

- [ ] **Step 3: Typechecks**

Run: `npm run typecheck:node 2>&1 | grep -cE "error TS"` → ≤ 16, no new errors (likely lower — the deleted `loop-judge-adapter.ts` imported a non-exported `GitOperations`).
Run: `npm run typecheck:web 2>&1 | grep -cE "error TS"` → ≤ 36, no new errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(loop): delete the built-in loop (now the manifold.loop plugin)

Removes src/main/loop, loop-handlers, src/renderer/components/loop, useLoop,
and shared/loop-types. The loop now lives entirely in resources/plugins/manifold.loop.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Whole-feature verification

**Files:** none

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: green. (Deleted core-loop test files no longer run; the plugin suite + everything
else passes. Test-file count drops by the removed loop tests.)

- [ ] **Step 2: Typecheck + plugin build**

Run: `npm run typecheck:node` / `typecheck:web` / `typecheck:plugins` → no new errors (record the node/web counts; they should be ≤ 16 / ≤ 36).
Run: `npm run build:plugins` → `manifold.loop` emits `out/{plugin,webview}.js`.

- [ ] **Step 3: Assert the built-in loop is gone**

Run:
```bash
ls src/main/loop src/renderer/components/loop 2>&1   # expect: No such file or directory
test ! -e src/shared/loop-types.ts && test ! -e src/renderer/hooks/useLoop.ts && test ! -e src/main/ipc/loop-handlers.ts && echo "all deleted"
git grep -n "loopRunner\|registerLoopHandlers\|useLoop\b" -- src || echo "no references"
```
Expected: directories gone, "all deleted", "no references".

- [ ] **Step 4: Record the owed dev smoke**

Append a note: owed manual verification — `npm run dev`, confirm the "+ Apps" launcher shows a
single **"Autoresearch Loop"** entry (the plugin), it opens and works (configure + Start a
loop, see iterations), and prior iteration history (if any) appears (same `~/.manifold/loop-logs`).

- [ ] **Step 5: Commit the note**

```bash
git add docs/superpowers/plans/2026-06-06-loop-plugin-phase-c-remove-builtin.md
git commit -m "docs(loop): record owed Phase C dev smoke

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** manifest canonical → Task 1. renderer contribution + tests + dock comment →
Task 2. main wiring (app/index, ipc/types, ipc-handlers) → Task 3. preload channels → Task 4.
session fields → Task 5. file deletions (loop dir, loop-handlers, components/loop, useLoop,
loop-types) → Task 6. verification + greps + owed smoke → Task 7. ✓

**Placeholder scan:** none — every edit shows the exact text to remove; deletions are explicit
`git rm` paths. The `PANEL_TITLES.loop` note (Task 2) states the decision (leave it) and why,
not a vague deferral.

**Ordering safety:** references are removed (Tasks 1–5) before files are deleted (Task 6), so
each commit type-checks (deleted-later modules stay self-consistent until Task 6). The grep
gates in Task 6/7 prove no dangling references remain.

**Scope:** deletion + reference cleanup + manifest retitle; no migration (history persists via
the shared log path; config was in-memory). The plugin (unchanged) is the loop after this.
