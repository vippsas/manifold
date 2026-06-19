# Dashboard — Global Home Surface with Cards — Design

**Status:** Design (standing pre-approval through PR creation). Plans to follow via `writing-plans`.
**Date:** 2026-06-19
**Precedent:** the Worktrees global home-layer surface ([#744], `WorktreeHomeView`) and the
statistics plugin migration (PR #776, `resources/plugins/manifold.statistics`).

---

## Why this exists

Two repo/dashboard surfaces today live on different "layers":

- **Worktrees** (`manifold.worktrees`) is **global/agentless**: `launcher: false`, reached via a
  persistent **"Worktrees" sidebar button**, which opens a full-screen home-layer overlay
  (`WorktreeHomeView`) hosting the plugin webview. Spans all repos.
- **Statistics** (`manifold.statistics`) is **per-agent**: `launcher: true`, so it appears in the
  **"+ Apps"** menu and opens as a dock panel inside an agent's workspace. Under the hood it is
  *project-scoped* (`verdicts.listByProject(activeProject)`).

That layer mismatch is the problem. We want a single **Dashboard** home surface that hosts both as
**cards** and has room for future cards, so "repo/dashboard management" has one front door.

## Decisions (locked in during brainstorming)

1. **One Dashboard home surface, one button.** The existing **"Worktrees" sidebar button becomes
   "Dashboard"** and opens the same kind of full-screen home-layer overlay. Worktrees stops being
   its own top-level surface — it becomes the first card.
2. **Summary tile → drill in.** The Dashboard is an overview + launcher: a grid of cards showing
   live headline numbers; clicking a card opens that module's full panel *in the same surface* with
   a back-to-grid button. Drilling in reuses today's `WorktreeHomeView` mechanism
   (`PluginViewPanel` by view id).
3. **Host-owned card list.** Cards are a native renderer feature — a hardcoded `CARDS` list, each
   reading a builtin/IPC API for its headline numbers. Adding a future card is a small edit to one
   file. (Chosen over a plugin-contributed card contribution type — YAGNI for two cards.)
4. **Statistics card is all-projects aggregated.** Unlike today's active-project scope, the
   Statistics card sums verdicts across every repo, and its drill-in shows a per-repo breakdown — so
   it reads as truly "global," matching Worktrees. `VerdictStore` already holds every record in one
   flat array keyed by `projectId`, so this is a group-by, not a schema change.
5. **Statistics becomes Dashboard-only.** Its `launcher` flag flips to `false`; it **leaves the
   per-agent "+ Apps" menu** and is reached only via the Dashboard. One entry point.
6. **Phased delivery (2 PRs).** PR1: Dashboard shell + Worktrees card (relocate the existing
   overlay). PR2: Statistics card (all-projects) + remove from "+ Apps".

## Goals / Non-goals

**Goals**
- A single global Dashboard surface, opened by one sidebar button, showing a grid of summary cards.
- Worktrees and Statistics as the first two cards; a future card = one entry appended to `CARDS`.
- Each card shows live headline numbers; clicking drills into the full panel with a back button.
- Statistics aggregated across all repos (card + per-repo drill-in breakdown).

**Non-goals (v1)**
- A plugin-contributed "dashboard card" contribution type (host-owned list is enough for now).
- Embedded/expand-in-place cards (we drill in to the full panel instead).
- Customizable card layout, drag-to-reorder, per-card settings.
- Keeping Statistics in "+ Apps" (it moves to Dashboard-only).

## Architecture

### Surface & entry point (renderer)
Generalize the existing Worktrees overlay plumbing rather than inventing a parallel one:

| Today | After |
|---|---|
| `WorktreesSidebarButton` | `DashboardSidebarButton` (`⊞ Dashboard`) |
| `useAppOverlays`: `showWorktrees` / `setShowWorktrees` | `showDashboard` / `setShowDashboard` |
| command `view.worktrees` (catalog + handler) | `view.dashboard` (title "Dashboard") |
| `onOpenWorktrees()` (dock-panel-types) | `onOpenDashboard(cardId?)` |
| `WorktreeHomeView` | `DashboardHomeView` |

`onOpenDashboard(cardId?)` takes an optional initial card so existing deep-links (e.g.
`ReusableSessionsCard`, which currently calls `onOpenWorktrees`) open straight into the Worktrees
card.

### Card grid + drill-in
`DashboardHomeView` holds one state: `view: 'grid' | cardId`.
- **Grid:** renders cards from a host-owned `CARDS` list.
- **Drill-in:** selecting a card sets `view = cardId` and renders that card's `fullViewId` via
  `PluginViewPanel`, with a **back-to-grid** control in the header.

`CARDS = [worktreesCard, statisticsCard]`, each `{ id, title, fullViewId, useSummary() }`.

To honor the 300-LOC rule, split into focused files:
- `DashboardHomeView.tsx` — overlay shell + grid/drill-in switch
- `DashboardCard.tsx` — card chrome (title, numbers, click)
- `dashboard-cards.ts` — the `CARDS` list + per-card `useSummary` hooks

### Data wiring (new renderer IPC)
Two thin channels over the existing main services — no new stores:
- `dashboard:worktreesSummary` → wraps `worktree-overview-service`:
  `{ worktrees, cleanableBranches, repos }`
- `dashboard:verdictsSummary` → wraps `VerdictStore`: group-by `projectId` →
  `{ sessions, mergedPct, repos, perProject: [{ projectId, sessions, mergedPct }] }`

Cards fetch via `electronAPI.invoke(channel)`; the renderer resolves `projectId → name` using
`useProjects()` (already available renderer-side).

### Statistics → all-projects (PR2's main work)
Extend the **existing statistics plugin** to an all-projects view (one source of stats UI; no
native re-render in the host):
- New `verdicts:read` API `listAll()` (store already holds every record in one array — trivial).
- The drill-in renders **total + per-repo breakdown** instead of single-project. Since it is no
  longer mounted per-agent, all-projects becomes its default/only mode; the `activeProjectId`
  wiring in its `webview-host` drops out.
- `package.json`: `launcher: true` → `false`.

## Error handling
- Summary IPC failures: the card renders with a muted "—" placeholder and a subtle retry, never
  blocking the grid (other cards still render).
- Empty data: Worktrees card "No managed worktrees"; Statistics card "No sessions yet" — same tone
  as the existing panels' empty states.
- Drill-in webview load is unchanged from today's `WorktreeHomeView` path.

## Testing
- `dashboard-cards` summary hooks with mocked `electronAPI.invoke`.
- `DashboardHomeView` grid ↔ drill-in navigation + back button + `onOpenDashboard(cardId)` deep-link.
- All-projects aggregation: group-by + `mergedPct` math (`aggregates.test.ts` in the plugin).
- `view.dashboard` command + `DashboardSidebarButton` render/click.
- Existing worktrees/statistics panel tests stay green.

## Phasing

**PR1 — Dashboard shell + Worktrees card**
Rename overlay/button/command/`WorktreeHomeView` → Dashboard; grid with the Worktrees card only
(relocates the existing overlay); `dashboard:worktreesSummary` IPC. Ships a working dashboard.

**PR2 — Statistics card**
`dashboard:verdictsSummary` IPC; `verdicts.listAll()`; all-projects drill-in (per-repo breakdown);
Statistics card; flip `launcher` to `false` (remove from "+ Apps").

[#744]: https://github.com/vippsas/manifold/issues/744
