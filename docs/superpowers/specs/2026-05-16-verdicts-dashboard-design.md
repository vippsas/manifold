# Verdicts Dashboard Tab — Design

**Date:** 2026-05-16
**Status:** Draft

## Background

The verdict-capture spec (`docs/superpowers/specs/2026-05-16-verdict-capture-design.md`) introduced a `VerdictStore` and a read-only `verdicts:list` IPC channel, but no UI consumer. Without one, the only way to inspect the data is to read `~/.manifold/verdicts.json` directly. A first-pass dashboard turns the data into something the user can actually use to evaluate agent quality — the Evaluator role from Lovejoy's framework.

## Goal

Add a Verdicts tab to Manifold's dock layout, hidden by default and enabled through the Settings dialog (same gating pattern as the Ideas and Loop tabs). The tab shows per-runtime quality aggregates and recent sessions for the active project. v1 is read-only and refreshes on demand.

## Non-goals

- Charts, time-series visualizations
- Filtering by outcome / runtime / date range
- Per-session drill-down view
- Live push updates as new verdicts arrive
- Cross-project aggregation
- Sibling comparison view

## User-visible surface

### Settings

A new checkbox under General settings: **"Show Verdicts tab"** (default off). Mirrors `showIdeasTab` / `showLoopTab` exactly.

### Tab content

Scoped to the **active project**. Three stacked sections in a single scrollable view:

1. **Header row** — project name + a "Refresh" button.

2. **Per-runtime quality** — one row per runtime that appears in the data:

   | Runtime | Total | Merged % | Discarded % | Avg edits before merge |
   |---|---|---|---|---|
   | claude | 42 | 71% | 12% | 2.3 |
   | codex | 18 | 55% | 22% | 3.1 |

3. **Recent sessions** — last 50 records, newest first:

   | When | Runtime | Outcome | Prompt |
   |---|---|---|---|
   | 2m ago | claude | merged | "refactor the auth module…" |
   | 12m ago | codex | discarded | "add test for the X helper" |

   - Rows with `prUrl` get a link icon that opens the URL in the system browser.
   - Prompt cell shows up to ~80 chars of the prompt text. For `kind: 'truncated'`, prefer the `head` portion (most users will recognize their own framing).

4. **Outcome distribution footer** — single line: `67 merged · 12 PR · 8 committed · 23 discarded · 4 unknown`.

### Empty state

"No sessions captured yet — they'll show up here when you spawn agents."

## Architecture

### Components

```
src/renderer/components/verdicts/
  VerdictsPanel.tsx              # top-level component, composes the three sections
  VerdictsPanel.styles.ts        # plain-object styles, same convention as other panels
  verdict-aggregates.ts          # pure functions: per-runtime stats, outcome counts
  verdict-aggregates.test.ts

src/renderer/hooks/
  useVerdicts.ts                 # { records, loading, error, refresh } via verdicts:list IPC
  useVerdicts.test.ts
```

### Data flow

1. User toggles "Show Verdicts tab" in settings → `settings.showVerdictsTab = true` persists via `SettingsStore`
2. `App.tsx` passes the flag into `useDockLayout`, which registers the panel in `applyDefaultLayout` when the flag is on
3. `VerdictsPanel` mounts, reads active project id from `DockState`, calls `useVerdicts(projectId)`
4. `useVerdicts` calls `window.electronAPI.invoke('verdicts:list', { projectId })` and stores the result
5. `verdict-aggregates.ts` derives per-runtime stats and the outcome distribution from the records array
6. UI renders. Refresh button re-invokes the IPC.

### Aggregation logic (`verdict-aggregates.ts`)

Pure module, no React dependency, fully unit-testable.

```ts
export interface RuntimeStats {
  runtime: string
  total: number
  merged: number
  discarded: number
  mergedPct: number
  discardedPct: number
  avgHumanEditsForMerged: number   // 0 if no merged records
}

export interface OutcomeCounts {
  merged: number
  pr_created: number
  committed_only: number
  discarded: number
  unknown: number
}

export function computeRuntimeStats(records: VerdictRecord[]): RuntimeStats[]
export function computeOutcomeCounts(records: VerdictRecord[]): OutcomeCounts
export function sortRecentFirst(records: VerdictRecord[]): VerdictRecord[]
```

Sorting is by `createdAt` descending. Percentages are integers (rounded). Averages return `0` when the divisor is `0` rather than `NaN`.

### Dock layout integration

Follow the existing `showLoopTab` pattern:

- `src/renderer/hooks/dock-layout-helpers.ts`:
  - Extend `PANEL_IDS` with `'verdicts'`
  - Add `verdicts: 'Verdicts'` to `PANEL_TITLES`
  - Add `verdicts: [{ ref: 'editor', dir: 'within' }, { ref: 'agent', dir: 'within' }, { ref: 'search', dir: 'within' }, { ref: 'backgroundAgent', dir: 'within' }]` to `PANEL_RESTORE_HINTS`
- `src/renderer/hooks/dock-layout-builders.ts`:
  - Extend `DefaultLayoutOptions` with `showVerdictsTab: boolean`
  - In `applyDefaultLayout`, add a gated `api.addPanel` call mirroring the `showLoopTab` block
- `src/renderer/hooks/useDockLayout.ts`:
  - Add `showVerdictsTab: boolean` parameter
  - Track it in a ref (mirroring `showLoopTabRef`)
  - Forward to `applyDefaultLayout`
- `src/renderer/App.tsx`:
  - Pass `settings.showVerdictsTab` to `useDockLayout`
- `src/renderer/components/editor/dock-panels.tsx`:
  - Import `VerdictsPanel` and register under `verdicts:` in `PANEL_COMPONENTS`

### Settings plumbing

- `src/shared/types.ts`: add `showVerdictsTab: boolean` to `ManifoldSettings`
- `src/shared/defaults.ts`: set `showVerdictsTab: false` in `DEFAULT_SETTINGS`
- `src/renderer/components/modals/settings/GeneralSettingsSection.tsx`: add a checkbox row mirroring `showLoopTab`
- `src/renderer/components/modals/SettingsModal.tsx`: add local state `[showVerdictsTab, setShowVerdictsTab]`, include in the save payload and dependency array
- `src/renderer/components/modals/settings/SettingsModalBody.tsx`: thread the prop through

### Opening PR URLs

Use `window.open(prUrl)` directly. This matches the existing pattern in `WebPreview.tsx` and `useTerminal.ts` — Manifold does not route external links through an IPC channel.

## Behavior

- Tab content reads `DockState` for `activeProjectId`. If null, render the empty state.
- Refresh re-fetches via IPC. No automatic refresh in v1 — sessions don't terminate that fast.
- Switching the active project triggers a new fetch (the `useVerdicts` hook depends on `projectId`).
- The IPC failure path renders an inline error message; the tab does not crash.

## Error handling

- IPC errors: caught in `useVerdicts`, surfaced as `{ error: string }`. The panel renders the error inline with a retry button. Lifecycle of the tab is unaffected.
- Malformed records (defensive): aggregator skips records missing required fields rather than throwing. Should never happen given the store's invariants, but cheap insurance.
- Project id missing: render empty state, do not call IPC.

## Testing

| File | Coverage |
|---|---|
| `verdict-aggregates.test.ts` | `computeRuntimeStats` grouping, percentage math, divide-by-zero, empty input. `computeOutcomeCounts` totals. `sortRecentFirst` ordering. |
| `useVerdicts.test.ts` | Loading state, success, error, refresh re-invokes IPC, projectId change triggers refetch. Mocks `window.electronAPI.invoke`. |
| `VerdictsPanel.test.tsx` | Renders runtime table from seeded records, recent-sessions table, outcome footer, empty state, error state, PR link rendering. |
| `SettingsModal.test.tsx` (extend) | `showVerdictsTab` checkbox toggles and persists in save payload. |
| `dock-layout-builders` existing tests (extend) | `showVerdictsTab: true` registers the panel; `false` skips it. |

## Open items deferred

- Filters (outcome / runtime / date range)
- Time-series and charts
- Per-session detail view
- Live updates when a verdict is upserted (would require a new `verdicts:changed` push channel)
- Cross-project view (e.g., "all projects" mode)
- Export to CSV / JSON
- Sibling comparison view
