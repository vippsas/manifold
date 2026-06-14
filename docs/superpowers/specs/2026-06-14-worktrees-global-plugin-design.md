# Worktrees — Global Home-Layer Plugin with Cross-Repo Cleanup — Design

**Status:** Design (standing pre-approval through PR creation). Plans to follow via `writing-plans`.
**Date:** 2026-06-14
**Issue:** [#744](https://github.com/vippsas/manifold/issues/744) — "Worktree overview per repo with easy cleanup" (P3, area:git)
**Precedent:** the loop & watch conversions — core owns infrastructure, features are plugins
(`resources/plugins/manifold.loop`, `resources/plugins/manifold.watch`).

---

## Why this exists

Manifold creates a git worktree per agent. They accumulate silently: on one real machine, **128
non-main worktrees across 26 repos** (manifold=36, manifold-os=13, agentset=9), with no in-app way
to review or prune them. Today worktrees are visible only per-agent (the sidebar) or via the
terminal (`git worktree list` / `git worktree remove`, repo by repo). Users can't tell which are
safe to delete.

This delivers a single, cross-repo overview — grouped by repo, with active/idle/stale status,
ahead/behind, dirty state, and last-activity — plus multi-select removal (guarded for
uncommitted/unpushed work), "prune stale", and "focus this worktree's agent".

## Decisions (locked in during brainstorming)

1. **A built-in plugin, not a built-in panel.** New `resources/plugins/manifold.worktrees/`,
   same trust tier as Watch/Loop. Aligns with the stated plugin direction; isolates the feature.
   (Worktree removal is destructive ⇒ its data API is **builtin-only**, so a third-party plugin
   could never do this — "plugin" here means a *built-in* plugin.)
2. **Global, home-layer surface.** A persistent top-level **"Worktrees" tab** that survives agent
   switches. Selecting it **detaches from the active agent** — you are in the agentless/home
   space while reviewing worktrees, not floating over an agent. (Chosen over a modal overlay so
   it sits beside your work and has room for the list.)
3. **Two-spaces model.** The app has an *agentless/home* space and an *inside-an-agent* space.
   The current per-agent **+ Apps** launcher (Watch, Loop — they operate on the active agent) is
   **hidden/disabled in the agentless "New agent" state**. *Global* apps (Worktrees) are reached
   from the home space.
4. **Managed-only data scope (v1).** List only Manifold-created worktrees (those with a
   `.manifold.json` ⇒ an agent session), reusing `WorktreeManager.listWorktrees`. Every row maps
   to an agent, keeping the "focus/detach into the agent" model consistent. A "show unmanaged"
   toggle (raw `git worktree list`) is a clean follow-up, out of scope here.
5. **Global & grouped, with focus affordances — not a hard repo filter.** All repos present
   (honors the issue), but grouped + collapsible. On open, the repo you came from is expanded &
   scrolled-to; the other groups collapse to a one-line count. A filter box + an
   "All repos / This repo" toggle make focusing one-click and reversible. (A hard single-repo
   filter was rejected: it rebuilds the repo-by-repo friction the issue exists to remove and
   clashes with the agentless model.)

## Goals / Non-goals

**Goals**
- One overview of every managed worktree, grouped by repo, with correct active/idle/stale status,
  ahead/behind, dirty flag, and last-commit date.
- Multi-select removal with a guard/confirm when a worktree has uncommitted or unpushed changes.
- "Prune stale" — remove worktrees whose directories no longer exist.
- "Focus agent" — jump into a worktree's agent from its row.
- Lives outside any agent (global), launched from the home space, survives agent switches.

**Non-goals (v1)**
- Showing unmanaged (hand-made) worktrees, or worktrees of repos not registered in Manifold.
- Creating worktrees/agents from this view (that stays in the existing New-agent flow).
- Disk-usage accounting (the "1.2 GB" in mockups is illustrative; defer).
- A modal/overlay rendering of the overview (we chose the persistent pane).

---

## Architecture

Three layers, each independently shippable (see Phased build order). Layer ordering: platform
plumbing first (P1, P2), feature last (P3).

### Verified current-state anchors

- **Capabilities** are a closed set: `CAPABILITIES` and `BUILTIN_ONLY_CAPABILITIES`
  (`src/shared/plugins/manifest.ts:7,14`). `workspace:manage` is **not** present → new.
- **Plugin view contributions** (`PluginViewContribution`, `manifest.ts:19-33`) have no `scope`
  field → new. The **+ Apps** launcher renders these and calls `state.onOpenPluginView(id, title)`
  / `onOpenPluginTreeView` (`ModuleLauncher.tsx:20-34`, fed by `useLauncherContributions`).
- **The dock layout is per-session:** `dockLayoutKey = primarySessionId ?? activeSessionId`
  (`src/renderer/App.tsx:109`); switching agents reloads the whole layout via `api.fromJSON()`,
  destroying & recreating panels. Plugin webviews mounted by `openPluginView`
  (`useDockLayout.ts`, `component: 'pluginView'`) therefore reset on agent switch.
- **Global surfaces already exist outside the dock:** Settings, Command Palette, About, etc. are
  rendered in `AppShell` with state in `useAppOverlays`, surviving agent switches. The Projects
  sidebar likewise persists. These are the model for a home-layer surface.
- **The plugin `ManifoldApi`** (`src/shared/plugins/api-types.ts:111-161`) exposes
  `commands / window / storage / workspace / configuration / agents / lm / transcription`. The
  `workspace` namespace today only exposes the *active* project/session — no cross-agent listing.
- **Managed listing & removal exist main-side:** `WorktreeManager.listWorktrees(projectPath)`
  filters to `.manifold.json`-tagged worktrees (`worktree-manager.ts:200-224`);
  `WorktreeManager.removeWorktree(projectPath, worktreePath)` (`worktree-manager.ts:150`) has
  normal/force/nuclear fallbacks. Ahead/behind via `GitOperationsManager.getAheadBehind`
  (`git-operations.ts`).

### Layer 1 — Home layer / agentless mode (navigation shell)

Introduce a first-class **home (agentless) mode** as a top-level surface that is not part of the
per-session dock tree.

- A persistent **"Worktrees" tab** rendered alongside the agent workspace but owned at the
  `AppShell`/App level (like the overlay surfaces), so it survives agent switches. State (e.g.
  `homeView: 'worktrees' | null`, or a small home-layer router) lives in an app-level hook
  modeled on `useAppOverlays`.
- **Entering** the Worktrees tab sets the app into agentless/home mode: the active-agent selection
  is visually detached (no agent is "current" while the home view is foreground). **Leaving**
  (selecting an agent, or closing the tab) returns to the agent space.
- **+ Apps gating:** in the agentless "New agent" state, the per-agent `+ Apps` launcher is hidden
  or disabled (`ModuleLauncher` returns null / renders disabled when there is no active agent).
  Global apps are reached from the home space instead (see Layer 2 surfacing).

> Risk note: this is the largest piece and the only genuinely new navigation primitive. It must
> not regress the per-agent dock (sidebar widths, layout restore, sibling tabs). If Layer 1 proves
> too heavy, the fallback is the **overlay** rendering (the rejected "feel A"), which reuses the
> existing global layer with near-zero navigation work — kept as an explicit descope lever.

### Layer 2 — Global plugin view primitive + `workspace:manage` capability (plugin platform)

**Global view primitive.** Add an optional `scope?: 'agent' | 'global'` (default `'agent'`) to
`PluginViewContribution` (`manifest.ts:19-33`) and `PanelContribution`. When the launcher opens a
`scope: 'global'` view, the host routes it to the **home layer** (Layer 1) instead of
`openPluginView`'s per-session `addPanel`. The plugin's webview iframe (`PluginViewPanel`) mounts
in the home surface; its host-side state lives in the plugin host (not the webview), so it is
unaffected by agent switches.

**`workspace:manage` capability.** Add to `CAPABILITIES` and `BUILTIN_ONLY_CAPABILITIES`
(`manifest.ts`). Add a new `worktrees` namespace to `ManifoldApi`, gated by `workspace:manage`:

```ts
// ManifoldApi addition (gated by 'workspace:manage', builtin-only)
worktrees: {
  /** All Manifold-managed worktrees across all registered projects, with git status. */
  list(): Promise<WorktreeOverviewEntry[]>
  /** Remove one managed worktree (+ its branch/meta). Rejects if guard unmet unless force. */
  remove(worktreePath: string, opts?: { force?: boolean }): Promise<void>
  /** Remove all stale (directory-gone) managed worktrees. Returns removed paths. */
  pruneStale(): Promise<string[]>
  /** Focus the agent owning a worktree (no-op for agentless/stale rows). */
  focusAgent(sessionId: string): Promise<void>
  onDidChange(listener: () => void): Disposable
}
```

Host wiring follows the PR #443 precedent: capability constant → `ManifoldApi` interface → main
service (`src/main/plugins/worktree-overview-service.ts`) over `SessionManager` +
`WorktreeManager` + `GitOperationsManager` → RPC service registered in the extension host →
plugin-host factory → `gated-api.ts` capability gate + main-side `assertBuiltin` re-check.

### Layer 3 — The `manifold.worktrees` plugin (the feature)

`resources/plugins/manifold.worktrees/`, modeled on `manifold.loop`:

```jsonc
// package.json
{
  "name": "worktrees", "publisher": "manifold", "version": "0.0.1",
  "displayName": "Worktrees",
  "description": "Overview of every repo's worktrees, with safe cleanup.",
  "engines": { "manifold": "^0.3.0" },
  "main": "./out/plugin.js",
  "activationEvents": ["onView:manifold.worktrees.panel"],
  "capabilities": ["workspace:manage", "storage"],
  "contributes": {
    "views": [{
      "id": "manifold.worktrees.panel",
      "title": "Worktrees",
      "description": "Overview of every repo's worktrees, with safe cleanup.",
      "launcher": true,
      "scope": "global"
    }]
  }
}
```

The webview (React, per the plugin webview pattern) renders the grouped list and dispatches
actions over the postMessage bridge to the plugin host, which calls `manifold.worktrees.*`. The
host owns refresh/in-flight state so it survives webview remounts.

---

## Data model

```ts
type WorktreeStatus = 'active' | 'idle' | 'stale'

interface WorktreeOverviewEntry {
  worktreePath: string
  projectId: string
  projectName: string
  branch: string
  status: WorktreeStatus          // active = has running agent; idle = managed, no running agent; stale = dir gone
  sessionId: string | null        // the owning agent session, when present
  ahead: number                   // vs the project's base branch
  behind: number
  dirty: boolean                  // uncommitted changes
  unpushed: boolean               // ahead > 0 with no matching upstream / unpushed commits
  lastCommitISO: string | null    // last commit date on the branch
  locked: boolean                 // from WorktreeMeta.locked — protected from deletion
}
```

`status`: `active` when a session for the worktree is running (`SessionManager`); `idle` when the
worktree is managed but its agent isn't running; `stale` when the directory is gone (prunable).

## Data flow

```
[webview] click Remove/Prune/Focus, or initial load
   → postMessage bridge → [plugin host: manifold.worktrees plugin]
   → manifold.worktrees.list()/remove()/pruneStale()/focusAgent()
   → RPC → [main: worktree-overview-service]
        list:    for each project → WorktreeManager.listWorktrees + git status join (ahead/behind,
                 dirty, last-commit, running-session lookup)
        remove:  guard check → WorktreeManager.removeWorktree (+ deleteBranch, removeWorktreeMeta)
        prune:   list → filter stale → removeWorktree each
        focus:   resolve sessionId → activate that agent (leaves home mode)
   → result → host → webview re-render; onDidChange fires on external session/worktree changes
```

## UX behavior

- **Grouping:** by repo, collapsible. Header shows repo name + worktree count. On open, the repo
  you came from is expanded and scrolled into view; others collapsed to one line.
- **Focus controls:** a filter box (repo/branch substring) and an "All repos / This repo" toggle.
  "This repo" scopes to the came-from repo; default is "All repos".
- **Row:** checkbox · status badge (active/idle/stale) · branch · `+ahead/−behind` · dirty/clean ·
  last-activity · actions (↦ focus agent, 🔒/🔓 lock toggle, 🗑 remove). Stale rows: only remove.
  Locked rows: remove disabled (must unlock first).
- **Selection & bulk:** multi-select checkboxes; "Remove selected · N" in the header. "Prune stale
  · N" removes all stale rows.
- **Focus agent (↦):** active/idle rows resolve to a session → activates that agent and exits home
  mode. Stale rows have no agent → action hidden.

## Error handling & edge cases

- **Removal guard:** if `dirty || unpushed`, removal requires explicit confirm
  (`window.showWarningMessage`) and passes `force: true`; otherwise it proceeds directly. The guard
  is enforced **main-side** in the service (defense-in-depth), not only in the webview.
- **Locked worktrees** (`WorktreeMeta.locked`): excluded from bulk removal and prune; per-row
  remove is disabled until unlocked. Surfaced with the lock badge.
- **Removal fallbacks:** reuse `WorktreeManager.removeWorktree`'s normal → force → nuclear
  (`rm + prune`) chain (`worktree-manager.ts:150`); on poisoned-index errors, surface a clear
  error rather than silently failing.
- **Concurrency:** removing a worktree whose agent is running must first stop/kill the session
  (route through the existing agent-deletion path) — never `rm` a live worktree out from under a
  PTY. The service rejects removal of an `active` row unless the caller confirms agent termination.
- **Stale detection races:** `pruneStale` re-checks directory existence at execution time, not
  from the cached list, to avoid removing a worktree recreated since the last refresh.
- **Cross-repo partial failure:** bulk operations report per-row success/failure; one failure does
  not abort the rest. The webview shows which rows failed and why.
- **Refresh:** the service emits `onDidChange` on session create/kill and after any removal so the
  list stays live without manual reload.

## Testing strategy

- **Main service (unit):** `worktree-overview-service` — list joins status correctly
  (active/idle/stale, ahead/behind, dirty, last-commit); guard rejects dirty/unpushed removal
  without force; `pruneStale` removes only dir-gone rows and re-checks at execution; locked rows
  excluded. Drive against a temp git repo with real worktrees (the project's git tests pattern).
- **Capability gating (unit):** a non-builtin plugin declaring `workspace:manage` is denied at
  `gated-api` and at the main-side `assertBuiltin` re-check.
- **Plugin webview (component):** grouping/collapse, default-focus expansion, filter + "This repo"
  toggle, selection math ("Remove selected · N"), guard-confirm dialog dispatch. (Plugin webview
  tests need `import React` + built-in matchers; tsconfig.plugins lacks jest-dom types.)
- **Home-layer navigation (component/integration):** entering the Worktrees tab detaches the active
  agent and survives an agent switch (panel not remounted); `+ Apps` hidden/disabled in the
  agentless state; focus-agent exits home mode into the right agent.
- **Manual validation (from the issue):** open the overview → every managed worktree listed with
  correct status; remove an idle worktree → gone from `git worktree list` and disk; attempt to
  remove a dirty worktree → guard fires; "prune stale" → only prunable removed.

## Phased build order

Each phase is an independently reviewable PR; ship in order (platform → feature).

- **P1 — Home layer + two-spaces navigation.** App-level home mode, persistent tab surviving agent
  switches, detach-on-enter, `+ Apps` gated in agentless state. No worktree logic yet (can host a
  placeholder home view). *Descope lever: if too heavy, fall back to overlay rendering.*
- **P2 — Plugin platform extensions.** `scope: 'global'` view routing into the home layer;
  `workspace:manage` capability + `manifold.worktrees` API surface + main
  `worktree-overview-service` + RPC + gating. Verified with a trivial global plugin.
- **P3 — The `manifold.worktrees` plugin.** Manifest + webview: grouped list, status, focus/filter,
  selection, removal guard, prune, focus-agent. This is the issue's user-visible value.

## Affected / new files (indicative)

- **New:** `resources/plugins/manifold.worktrees/` (manifest, `src/plugin.ts`, webview host +
  webview UI); `src/main/plugins/worktree-overview-service.ts`; plugin-host
  `worktrees`-api factory; a home-layer app hook + surface component under `src/renderer/`.
- **Edit:** `src/shared/plugins/manifest.ts` (+`workspace:manage`, `scope`),
  `src/shared/plugins/api-types.ts` (+`worktrees` namespace),
  `src/shared/plugins/contributions.ts` (+`scope`), `gated-api.ts`, the extension host registration,
  `ModuleLauncher.tsx` (agentless gating + global-view routing), `AppShell.tsx` / `App.tsx`
  (home-layer surface), and the launcher/dock plumbing that opens views.

## Open questions / future

- **Unmanaged worktrees (data scope B):** a later "show unmanaged" toggle backed by raw
  `git worktree list` per registered repo. Out of scope for v1.
- **Disk usage per worktree/repo:** illustrative in mockups; defer unless cheap.
- **Where exactly the global-app launcher lives in the home space** (a list on the New-agent
  screen vs a home-space `+ Apps`): refine during P1.
