# Watch-as-a-Plugin — Phase 3: Remove the Builtin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the builtin watch (main, IPC, renderer, shared types, bundled-skill path) and make `manifold.watch` the canonical, only Watch.

**Architecture:** Pure deletion + reference cleanup, following the loop Phase-C playbook (`docs/superpowers/specs/2026-06-06-loop-plugin-phase-c-remove-builtin-design.md`). No new behavior.

**Spec:** `docs/superpowers/specs/2026-06-11-watch-plugin-design.md` (PR 3 section).
**Branch:** `watch-plugin/phase-3-remove-builtin` (stacked on `watch-plugin/phase-2-plugin`, PR #630).

**Run tests with `npm test -- <path>`** (never raw vitest). Typecheck baselines: web 37 / node 12 — deletions may only lower the counts.

---

### Task 1: Re-point `AiServiceSettings` importers off `watch-types`

These files import `AiServiceSettings`/`TranscriptionSettings`/`AiServiceProvider` from `shared/watch-types` but are NOT watch code; re-point them to `'../../shared/plugins/api-types'` (adjust relative depth per file) BEFORE deleting `watch-types.ts`:

- `src/main/session/verdict-recorder.ts` + `.test.ts`
- `src/main/store/prompt-summarizer.ts` + `.test.ts`
- `src/renderer/components/modals/SettingsModal.tsx`
- `src/renderer/components/modals/settings/SettingsModalBody.tsx`
- `src/renderer/components/modals/settings/TranscriptionSettingsSection.tsx`

If any uses the deprecated `TranscriptionSettings`/`TranscriptionProvider` alias names, switch them to `AiServiceSettings`/`AiServiceProvider` (the aliases die with watch-types). Also check `src/shared/types.ts:127` (`transcription?: import('./watch-types').AiServiceSettings`) → `import('./plugins/api-types').AiServiceSettings`, and `src/shared/defaults.ts:49` for any watch-types import.

- [ ] Re-point, run `npm test -- src/main/session/verdict-recorder.test.ts src/main/store/prompt-summarizer.test.ts`, typecheck, commit.

### Task 2: Delete main-process watch + IPC

- Delete `src/main/watch/` (entire dir), `src/main/ipc/watch-handlers.ts`.
- `src/main/app/index.ts` — remove `WatchRunStore` import (`:42`), instantiation (`:82`), the `watchRunStore` IPC dep (`:136`).
- `src/main/ipc/types.ts` — remove the import (`:18`) and `watchRunStore` field (`:40`).
- `src/main/app/ipc-handlers.ts` — remove `registerWatchHandlers` import (`:18`) and call.
- `src/main/app/app-lifecycle.ts` — remove `installWatchSkills`/`getBundledWatchSkillPath` imports (`:6-7`) and the startup install block (~`:60-66`); keep everything else.
- `src/preload/index.ts` — remove the 9 `watch:*` invoke channels (`:119-127`) and 2 listen channels (`:178-179`).
- [ ] `npm test -- src/main src/preload`, typecheck:node ≤ 12, commit.

### Task 3: Delete renderer watch UI + hooks

- Delete `src/renderer/components/watch/` (entire dir).
- Delete hooks: `useWatchPanel.ts`, `useWatchPanelActions.ts`, `useWatchUrlPreview.ts`, `watchPanelStore.ts(+test)`, `watch-preview-cache.ts(+test)`, `watch-state-equality.ts` (and any `useWatchUrlPreview`/`useWatchPanel` tests).
- `src/renderer/hooks/useAgentSession-actions.ts` — remove the `watchPanelStore` import (`:3`) and both `watchPanelStore.delete(…)` calls (`:65`, `:76`); keep surrounding logic.
- `src/renderer/plugins/internal-contributions.ts` — remove the `WatchPanel` import (`:7`) and the `watch` entry (`:39-45`); update the Phase-C comment style if present. Test expectations → `['backgroundAgent', 'verdicts']` (`internal-contributions.test.ts`).
- `src/renderer/hooks/dock-layout/dock-layout-helpers.ts` — remove `'watch'` from `PANEL_IDS` (`:13`), `PANEL_TITLES` (`:26`), `PANEL_RESTORE_HINTS` (`:41`).
- `src/renderer/components/git/StatusBar.tsx` — remove the `watch: 'Watch'` label (`:13`).
- `dock-panels` tests (`dock-panels.contributions.test.tsx`): drop WatchPanel assertions; panel-count wording (loop Phase-C precedent: "three module panels" → two).
- Check the dock-layout sanitizer (`dock-layout-sanitize.ts`) drops saved `watch` panel ids — it removes ids not in `PANEL_IDS`; add/extend a sanitize test for a saved layout containing `watch` if not already covered.
- Sweep: `git grep -n "watch" src/renderer src/main src/shared src/preload` and clean every remaining builtin-watch reference (ignore file-watcher/tree-watcher false positives). Tests that enumerate panels/titles may exist beyond the named ones (`useAppEffects.test.ts`, `StatusBar.test.tsx`, dock-layout tests) — fix expectations, never delete unrelated assertions.
- [ ] `npm test -- src/renderer`, typecheck:web ≤ 37, commit.

### Task 4: Delete shared watch types + bundled skill path; canonicalize the plugin

- Delete `src/shared/watch-types.ts` (Task 1 freed all non-watch importers; builtin watch code is gone).
- Delete `resources/skills/watch/` (the plugin bundles its own copy at `resources/plugins/manifold.watch/skills/watch/`).
- `package.json` — remove the `{ "from": "resources/skills/watch", "to": "skills/watch" }` extraResources entry (`:63-66`); the plugins dir entry stays.
- `resources/plugins/manifold.watch/package.json` — `displayName`: `"Watch"`, view `title`: `"Watch"`, `description`: `"Watch videos with sibling analysis agents."` (drop the "(plugin)" qualifiers).
- [ ] Full `npm test`, both typechecks ≤ baseline, `npm run build:plugins`, commit.

### Task 5: Docs + PR

- Rewrite `docs/architecture/watch.md`: frontmatter `covers: [resources/plugins/manifold.watch]`, drop the transitional note, describe the plugin architecture (facade/AgentPort/webview protocol/bundled skill; cite plugin `file:line`), bump `updated:`. Keep the page name.
- `docs/architecture/plugins.md`/`plugin-api.md`: only if they reference the builtin watch (grep); else untouched.
- `bash scripts/wiki-lint.sh` — watch.md not stale.
- Final sweep: `git grep -rn "watch:" src/ | grep -v "file-watch\|tree-watch"` → no IPC channels; `git grep -rn "main/watch\|components/watch" src/ docs/architecture/` → nothing.
- [ ] Push `watch-plugin/phase-3-remove-builtin`, `gh pr create` with base `watch-plugin/phase-2-plugin`.

## Self-review notes
- Migration: none — plugin reuses `~/.manifold/watch-runs.json`, `~/.manifold/bin`, fingerprint-matched skill installs. Saved dock layouts containing `watch` are sanitized away.
- `frame-reader`'s sandbox check, `verdict-poll-forwarder`, and `session` code are NOT watch-coupled — don't touch.
- The launcher must show exactly one Watch (the plugin's) after this PR.
