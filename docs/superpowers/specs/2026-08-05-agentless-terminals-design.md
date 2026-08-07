# Agent-independent terminals with a VS Code tab model

**Date:** 2026-08-05
**Status:** Design approved by user; spec review rounds 1–3 applied; pending implementation plan
**Branch:** `workspaces-opt-in` (design written here; implementation branch TBD)
**Revision:** 4

## Problem

The Shell panel cannot be opened unless an agent session is active, and the multi-terminal "+"
affordance is invisible in exactly the situations where a user most wants it. A terminal is a
general-purpose tool; requiring an agent to get one is an artificial coupling.

Three gates enforce that coupling:

1. **Activity bar** — the Shell rail item is `sessionOnly: true`, so its button is `disabled`
   whenever `activeSessionId == null` (`src/renderer/components/ActivityBar.tsx:94`, `:167`).
2. **cwd resolution** — the shell's working directory comes only from the active agent:
   `worktreeShellCwd = activeSession?.worktreePath ?? null`, and the project fallback is itself
   gated on a session (`src/renderer/App.tsx:192-194`). With no agent, `useShellLifecycle` bails
   at `if (!key || !cwd)` and never calls `shell:create`
   (`src/renderer/hooks/terminal/useShellSession.ts:7-10`).
3. **The "+" button** — `canAddShell: Boolean(worktreeSessionId)`
   (`src/renderer/components/terminal/ShellTabs.tsx:105`), so the header action renders nothing
   when there is no agent-derived main shell and no extras
   (`ShellHeaderActions.tsx:57`; `:55` also hides it when the shell panel isn't the active
   dockview panel).

Underneath the gates sits a **two-class terminal model**: one auto-created "main" shell keyed by
the agent's worktree, plus a list of "extra" shells. The main shell is unlabeled ("Shell"), cannot
be closed, and is created by a different code path than the extras. This split is what makes the
VS Code tab model awkward to reach, so ungating alone would not deliver the requested behavior.

Separately, **closing the Shell panel kills every terminal in it.** `useCleanupOnUnmount`
(`shell-tabs-hooks.ts:136-149`) kills all cached PTYs when `ShellTabs` unmounts, and closing the
panel removes it outright — `dock-layout-no-remount.test.tsx:68-71` asserts
`expect(dv.getPanel('shell')).toBeUndefined()` after `hidePanel`. A long-running process started in
a terminal dies when the panel is collapsed. §4 fixes this.

## Goals

1. Open the Shell panel and get a working terminal **with no agent running**.
2. **"+" creates a terminal in one click** (Manifold shell); a chevron beside it offers the
   Manifold/System choice.
3. **All terminals are equal** — same creation path, same labeling, all closable.
4. Terminal sets are **scoped per workspace checkout**, so agents sharing a workspace share
   terminals and switching workspace swaps the set. (One known leak: `worktreePaths` for a non-git
   project is the folder itself (`workspace-types.ts:23-26`), so two workspaces spanning the same
   non-git folder resolve to one cwd and share a terminal set. Accepted.)
5. Closing the Shell panel **no longer kills** the terminals inside it.

## Non-goals (YAGNI)

- No agents hosted in the terminal panel. The "+" creates shells only.
- No shell profiles beyond the existing Manifold/System modes.
- No terminal splitting (side-by-side panes) — tabs only.
- No change to the agent panel's terminal (`TerminalPane`), which is the agent's own PTY and stays
  one-per-agent.
- No change to the `agent:input` / `agent:output` / `agent:resize` / `agent:replay` IPC used by
  `useTerminal`, and **no change to `shell:create`'s signature**.
- **No true scrollback preservation** across a panel close/reopen. See §4 for what is and isn't
  preserved; raising the main-process output buffer is a separate change.
- No home-directory fallback. See §1.

## Background: what already exists

- **`PtyPool`** is the single PTY service (`src/main/agent/pty-pool.ts:22`, `spawn` at `:29-79`).
  Shell sessions are
  ordinary `InternalSession`s with `runtimeId: '__shell__'`, created by `createShellPtySession`
  (`src/main/session/session-resume.ts:93-179`).
- **`shell:create`** takes `(cwd, { mode })` and returns `{ sessionId }`
  (`src/main/ipc/agent-handlers.ts:247-256`). This design does not change it.
- **Multi-tab support already exists** — `+` menu, tab strip, and per-cwd disk persistence in
  `~/.manifold/shell-tabs.json` via `ShellTabStore` (`src/main/store/shell-tab-store.ts:19-73`).
  It is simply unreachable without an agent.
- **Panels are not remounted on a session switch.** There is one window-scoped dock layout and
  `loadOrBuildLayout` runs once from `onReady`
  (`src/renderer/hooks/dock-layout/useDockLayout.ts:67-78`, `:235-240`), pinned by
  `dock-layout-no-remount.test.tsx` and `dock-layout-session-switch-stability.test.tsx`. **The
  comment at `shell-tabs-hooks.ts:70-73` claiming otherwise is stale and must be corrected as part
  of this change.** The real unmount trigger is closing the panel.
- **A `Workspace` owns concrete checkout paths** independent of any agent
  (`src/shared/workspace-types.ts:23-26`) — but `worktreePaths` is **absent on a home workspace**
  (`workspace-types.ts:7-10`), which is what you get when you simply add a repository. The
  primary-project fallback is therefore the common path, not an edge case.
- **The resolution chain already exists** for the no-agent onboarding view: pick the focused
  workspace, else whichever holds the active project (`dock-agent-panel.tsx:131-135`), then
  `workspace.worktreePaths?.[workspace.projectIds[0]] ?? primaryProject?.path`, where
  `primaryProject` is the **workspace's** primary project, not the active one
  (`dock-agent-panel.tsx:139`, `:147`).
- **Keyboard commands are already ungated** — `view.toggle.shell` and `view.focusTerminal` reach
  `togglePanel('shell')` / `openModule('shell')` with no session check
  (`src/renderer/commands/command-handlers.ts:63-76`, `src/shared/commands/catalog.ts:68`, `:77`).
  Today they open a
  panel with a blank xterm and no PTY; after this change they open a working terminal.
- **PTYs are reaped on quit** by `before-quit` → `sessionManager.killAllSessions()` +
  `ptyPool.killAll()` (`src/main/app/app-lifecycle.ts:85-97`).
- **`agent:exit` reaches the renderer** (`src/preload/index.ts:149`) and fires for shell sessions
  (`session-stream-wirer.ts:162`).
- **The app never renders the dock without a project**: `AppShell` returns the onboarding view when
  `projects.length === 0` (`src/renderer/AppShell.tsx:125-134`) and when
  `settings.setupCompleted === false` (`:116-123`). There is no rail to click in that state, which
  is why no home-directory fallback is needed.

## Design

### 1. cwd resolution and the scope key

A new pure helper, `src/renderer/components/terminal/shell-cwd.ts`, reproduces the chain at
`dock-agent-panel.tsx:131-147`. **Deliberately a copy, not a shared extraction**: refactoring the
agent panel to adopt it is outside this change (`CLAUDE.md` §3), at the cost of two copies that
could drift. Its parameter types match `DockAppState` exactly — `workspaces` is
non-optional (`dock-panel-types.ts:94`) while `activeWorkspaceId` is
`string | null | undefined` (`:95`):

```ts
export function resolveShellCwd(
  workspaces: Workspace[],
  activeWorkspaceId: string | null | undefined,
  activeProjectId: string | null | undefined,
  projects: Project[],
): string | null {
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
    ?? workspaces.find((w) => !!activeProjectId && w.projectIds.includes(activeProjectId))
  if (!workspace) return null
  const primaryId = workspace.projectIds[0]
  return workspace.worktreePaths?.[primaryId]
    ?? projects.find((p) => p.id === primaryId)?.path
    ?? null
}
```

**It must not key off `activeProjectId` for the path.** Clicking a folder row inside a multi-repo
workspace changes `activeProjectId` (`onSelectWorkspaceRepo` → `setActiveProject`,
`App.tsx:351-353`); using it would swap the terminal set within a single workspace, contradicting
Goal 4.

A `null` result means no workspace could be resolved. The panel then shows an empty state reading
"Select a workspace to open a terminal", mirroring the agent panel's
"Select a workspace to get started" (`dock-agent-panel.tsx:160`). No shell is spawned. Given
`AppShell`'s project gate, this state is rare.

**The resolved cwd is the scope key.** Per-workspace sets fall out of this without a separate
notion of scope: switching workspace changes the checkout path, which selects a different set.
Agents within one workspace share a checkout and therefore share terminals — a simplification over
today's keying by `worktreeSessionId` (`ShellTabs.tsx:48`). Because the path is resolved entirely
in the renderer, the key is known before any IPC.

### 2. One flat terminal list

`ShellTabs` drops the `main` / `extraShells` split for a single `terminals: ShellTerminal[]`:

```ts
// declared in shell-terminal-store.ts (§4), alongside ShellMode
interface ShellTerminal {
  sessionId: string
  label: string          // "Manifold 1", "System 2", … counter starts at 1
  mode: ShellMode
}
```

**Open sequence.** Auto-create and restore-from-disk are both driven by opening a cwd, so they are
sequenced through the entry's single `state` field (§4):

1. `if (entry.state !== 'idle') return`. **Emptiness is never the predicate** — an entry whose
   terminals the user deliberately closed is `'ready'` with an empty list, and must not respawn.
2. Set `state = 'opening'` **synchronously**, before any `await`, and capture `cwd` in a local.
3. `shell-tabs:get(cwd)`. If it returns a non-empty set, create those terminals and write
   `saved.counter` into the entry (today's `shell-tabs-hooks.ts:109`); losing the counter would
   renumber a restored set from 1 and collide with existing labels.
4. Otherwise create exactly one Manifold shell.
5. In a `finally`, set `state = 'ready'` — including on rejection, so a failed open leaves the
   empty state and a usable "+" rather than wedging the cwd. Results are written to
   `store.get(capturedCwd)` unconditionally; **nothing is killed on unmount**, which is the whole
   point of §4.

Step 2 is what makes this safe under `<React.StrictMode>` (`src/renderer/index.tsx:16`), whose
setup → cleanup → setup double-mount is trap #1 in `docs/architecture/gotchas.md`. Note that the
deleted `useShellLifecycle` is *not* prior art here: its `cancelled` flag does not prevent the
duplicate `shell:create` (the cache is written only on success, `useShellSession.ts:25`), it kills
the loser afterwards via `agent:kill` (`:28`). A module-scoped `state` set before the await
prevents the second call outright.

Other rules:

- **Every terminal is closable**, including the last. Closing the last leaves the empty state with
  a "New Terminal" button; the entry stays `'ready'`, so reopening the panel does not respawn.
- **A terminal whose shell exits removes its own tab**, via an `agent:exit` subscription owned by
  **the store module** (armed lazily — see §4), not by `ShellTabs`. A component-level listener would be
  unregistered exactly when the panel is closed — now a normal state with live PTYs behind it —
  leaving a dead `sessionId` that renders a tab replaying a session main no longer has.
- **Labels are never renumbered.** The counter is monotonic per cwd, so closing tabs 1–6 leaves
  "Manifold 7". Renumbering would relabel terminals the user is looking at.
- **Deleted:** `src/renderer/hooks/terminal/useShellSession.ts` and its test; and
  `shell-tabs-hooks.ts` in full — every hook in it (`useSyncCacheOnAgentChange`,
  `useKeepCacheInSync`, `usePersistTabs`, `useRestoreTabsFromDisk`, `usePersistOnChange`,
  `useCleanupOnUnmount`) is subsumed by the store. Its `ShellMode` and `ExtraShell` types move to
  `shell-terminal-store.ts`, `ExtraShell` becoming `ShellTerminal`.
- **`ShellHeaderControls` changes shape** (`shell-header-controls.ts:3-10`): `extraShells` →
  `terminals`, `activeTab` → `activeSessionId`, plus `onKillActive`. This ripples to
  `ShellTabControls.tsx`, `ShellHeaderActions.tsx`, `ShellHeaderActions.test.tsx:25-32`, and
  `DockPreview.fixture.tsx:45-52`.
- **Three dock-state fields are removed, not replaced**: `worktreeShellSessionId`,
  `projectShellSessionId` (`dock-panel-types.ts:73-74`) and `worktreeCwd` (`:75`), declared there,
  read at `dock-panels.tsx:120-122`, and written at `App.tsx:334-335`. `ShellPanel`
  (`dock-panels.tsx:116-128`) instead calls `resolveShellCwd` on dock state it already has:
  `projects` (`:84`), `activeProjectId` (`:85`), `workspaces` (`:94`), `activeWorkspaceId` (`:95`),
  all read today by `dock-agent-panel.tsx`. `App.tsx` loses the shell wiring at `:192-195`, the
  assignments at `:334-335`, and the `useShellSessions` import at `:10`.

### 3. Header actions: one-click "+", chevron, and kill

`ShellHeaderActions.tsx` gains a third control and keeps its portal-rendered menu:

- **`+`** — `onClick` calls `onAddShell('manifold')` directly; no menu.
- **`⌄` chevron** — opens the existing "New Manifold Shell" / "New System Shell" menu, retaining
  the outside-click and Escape handling at `ShellHeaderActions.tsx:34-53`.
- **Kill button (trash)** — always rendered, **disabled when there are no terminals**, otherwise
  closes the active one. Without it the last terminal would be unclosable: the only close
  affordance today lives on a tab (`ShellTabControls.tsx:33-39`) and the strip is hidden when the
  list is empty (`ShellHeaderActions.tsx:56`).

`canAddShell` becomes `Boolean(shellCwd)`. The early return at `ShellHeaderActions.tsx:57`
(`!canAddShell && !showShellTabs` ⇒ render nothing) is **removed**, so the controls are visible and
disabled rather than absent when no workspace resolves. The `:55` return stays: the header still
renders nothing when the shell panel isn't the active dockview panel.

The tab strip renders when there is **more than one** terminal, matching VS Code. Its hardcoded
"Shell" main-tab button (`ShellTabControls.tsx:18-23`) is removed; it maps over the flat list.

### 4. Terminal state survives closing the panel

Terminal state moves out of `ShellTabs` into a **module-level store**, next to the existing pub/sub
in `src/renderer/components/terminal/shell-header-controls.ts`:

```ts
// src/renderer/components/terminal/shell-terminal-store.ts
Map<cwd, {
  terminals: ShellTerminal[]
  counter: number
  activeSessionId: string | null
  state: 'idle' | 'opening' | 'ready'
  error: string | null      // a failed open, surfaced by the panel's error strip
}>
```

One `state` field, not a `restored`/`creating` pair: the pair encodes the same three states with
one illegal combination, and the single field makes §2 step 1's guard self-evidently correct. It
also replaces the component-level `restoredRef` (`ShellTabs.tsx:63`), which after a panel reopen
would be empty while the store held terminals — leaving `usePersistOnChange`
(`shell-tabs-hooks.ts:127-133`) permanently gated off and persistence silently dead for the
session.

The module also owns the `agent:exit` subscription (§2) and is where terminals are written by the
open sequence. `ShellTabs` subscribes via `useSyncExternalStore`, the pattern `ShellHeaderActions`
already uses (`ShellHeaderActions.tsx:17-21`).

**The `agent:exit` subscription is armed lazily, on the first store mutation — never at import
time.** `vitest.setup.ts` contains only the jest-dom import, and tests assign `window.electronAPI`
in `beforeEach` with an `invoke`-only stub (`ShellTabs.test.tsx:14-25`), which runs after ESM
imports are evaluated. A top-level `window.electronAPI.on(...)` would throw on import in every test
that transitively pulls in the store, and guarding it with `?.` would silently never register,
defeating Testing item 6.

**Persistence has an explicit trigger:** the store calls `shell-tabs:set(cwd, { tabs, counter })`
after any mutation of an entry in state `'ready'`, and never while `'opening'` — the role the old
`restoredRef` gate played (`shell-tabs-hooks.ts:129`).

**Removing the active terminal activates its neighbour** — the previous entry, else the next, else
`null`. This replaces `resolveActiveTab` (`ShellTabs.tsx:138-149`), which the flat model drops
along with the `'main'` / `extra-<id>` tab-id scheme; the store keys the active terminal by
`sessionId`.

**No PTY is killed on unmount.** `useCleanupOnUnmount` is deleted, and the old cancellation guard
in `useRestoreTabsFromDisk` (`shell-tabs-hooks.ts:74`, `:88-104`) is **not** carried over: it is
armed by effect cleanup (`:115`), which fires on panel close, so retaining it would kill exactly
the terminals this section exists to preserve — and under StrictMode it would cancel the first
pass's work while the second pass short-circuits on `state`, leaving a permanently blank panel.
Writing results to `store.get(capturedCwd)` makes a mid-flight workspace switch correct rather than
hazardous: the terminals land under the cwd they were created for.

**What this does and does not preserve.** It preserves the PTY and anything running in it — the
point of the change. It does **not** preserve scrollback as displayed: `useTerminal` disposes the
xterm instance on unmount (`useTerminal.ts:303-312`) and on remount resets and replays from
`agent:replay`, which returns a buffer hard-capped at 100 KB and trimmed to 50 KB
(`session-stream-wirer.ts:95-98`). Reopening the panel shows the last ~50–100 KB of output with
scroll position lost, regardless of `settings.scrollbackLines`.

**Deliberate tradeoff:** terminals for a workspace stay alive after switching away, so visiting N
workspaces leaves N sets of PTYs running. This matches VS Code, where a background window keeps its
terminals, and is what makes switching back instant. They are reaped on quit, and any tab can be
closed explicitly.

### 5. Persistence and migration

`~/.manifold/shell-tabs.json` is already keyed by cwd and needs **no format change**
(`shell-tab-store.ts:19-73`). Two behavioral shifts:

- The saved list now includes what used to be the main shell, so restore recreates the full set.
- `counter` starts at 1 instead of 2, since no terminal is special.

**Migration:** none. Old entries hold only the former "extra" shells; they restore as an ordinary
list, one fewer than the user last saw. `SavedShellTab.mode` is already read defensively and
defaults to `'manifold'` (`shell-tabs-hooks.ts:86`).

One type correction: the renderer writes a `mode` field (`shell-tabs-hooks.ts:45`) that survives
persistence via the `{ ...t }` spread (`shell-tab-store.ts:59`, `:65`) but is absent from the
`SavedShellTab` interface (`:6-9`). This change adds it so the persisted shape and the type agree.

### 6. Ungating

- `ActivityBar.tsx:94` — drop `sessionOnly: true` from the shell rail item. The editor item keeps
  it. The justifying comment at `ActivityBar.tsx:82-84` is stale: it cites a status-bar behavior
  that no longer exists, as `src/renderer/components/git/StatusBar.test.tsx:118` currently asserts
  (there is no "Open Shell" button). Update the comment to describe the editor case only. The
  existing `ActivityBar.test.tsx:118-127` asserts the old gate and is amended, not duplicated.
- `ShellTabs.tsx:105` — `canAddShell` keys off the resolved cwd, per §3.

## Error handling

- **`shell:create` rejects** (bad cwd, spawn failure): the terminal is not added to the store, the
  entry still reaches `'ready'` via the `finally`, and the message appears in a dismissible inline
  strip at the top of the panel body — which is also where the empty state lives, so it works
  whether or not other terminals exist. Today the failure is swallowed silently
  (`ShellTabs.tsx:82-84`); with no agent to fall back on, a silent no-op would look like a dead
  button.
- **The message and its dismissal both live on the scope**, in the `error` field, never in
  component state. The panel unmounts whenever it is closed, so a component-held message would
  vanish on close, and a component-held "dismissed" flag would reset on reopen — resurrecting an
  error the user already dismissed, for the rest of the session. Keeping both on the scope also
  keys them to the cwd that produced them, so dismissing an error in one workspace cannot suppress
  a later one in another. A successful `addTerminal` clears the field.
- **A failed open must not erase saved tabs.** When the open sequence fails, the entry reaches
  `'ready'` with an empty list — persisting that would overwrite the very tabs it failed to
  restore, so the write is skipped on the failure path. This includes the case where saved tabs
  existed and **every one** failed to spawn (a checkout that no longer exists), which is treated as
  an open failure rather than an empty scope.
- **Workspace checkout path missing from disk** (worktree removed underneath us): `shell:create`
  fails as above. No pre-flight `fs.existsSync` — the spawn is the check.
- **No workspace resolvable** (`resolveShellCwd` returns null): empty state, "+" and kill disabled,
  no IPC.
- **Restore of a saved tab fails**: skipped individually, as today (`shell-tabs-hooks.ts:94-96`).

## Testing

Unit (vitest):

1. `resolveShellCwd` — workspace checkout wins; falls back to the **workspace's primary** project
   path; returns null with no resolvable workspace; **does not change when `activeProjectId`
   changes within one workspace** (the regression this design exists to avoid).
2. Terminal store — add/close/switch keyed by cwd; two cwds keep independent lists; closing the
   last leaves a `'ready'` entry with an empty list, and reopening does **not** respawn; closing
   the active terminal activates its neighbour. Persistence: a mutation of a `'ready'` entry writes
   `shell-tabs:set` with the current tabs and counter, while a mutation during `'opening'` writes
   nothing.
3. Open sequence — a non-empty saved set restores, carries `saved.counter`, and does not also
   auto-create; an empty saved set auto-creates exactly one; a rejected `shell:create` still ends
   `'ready'` so the next "+" works.
4. StrictMode — `renderWithStrictMode` (helper exported from
   `src/renderer/test-utils/strict-mode.test-helpers.tsx:25`) proves one terminal and one
   `shell:create` call on double-mount, and that no `shell:kill` is issued.
5. `ShellTabs` renders a terminal with no active agent session.
6. `agent:exit` removes the matching tab, including while `ShellTabs` is unmounted (store-level
   listener).
7. `ActivityBar` — the Shell button is enabled with `hasActiveSession={false}`; Editor stays
   disabled.
8. `ShellHeaderActions` — `+` creates a Manifold shell without opening a menu; the chevron opens
   the two-item menu; the kill button closes the active terminal, including the last, and is
   disabled with none.
9. Updated for the removed dock-state fields: `dock-panels.test.tsx`, `EditorPaneActions.test.tsx`,
   `DockTab.test.tsx:53-55`. Updated for the flat model and new controls shape:
   `ShellTabs.test.tsx`, `ShellHeaderActions.test.tsx`, `DockPreview.fixture.tsx`. Deleted:
   `useShellSession.test.ts`.

Renderer verification (required by `CLAUDE.md` §4 — "done includes seeing it"):

- `npm run screenshot:component` (`package.json:33`) via `DockPreview.fixture.tsx` covers the
  header chrome only — `+`, chevron, kill, tab strip layout. The fixture mounts the shell panel as
  a placeholder (`id: 'shell', component: 'pane'`, `DockPreview.fixture.tsx:34`), so it cannot show
  a live terminal.
- `npm run drive:app` (`package.json:34`) covers the live behavior, with **no agent running**: the
  Shell rail icon is enabled; opening the panel yields a live prompt in the workspace checkout; `+`
  adds tabs; kill closes down to the empty state and reopening the panel does not respawn;
  switching workspace swaps the set and returning finds the first intact; closing and reopening the
  panel leaves a running process alive.

## Documentation

Updated in the same change, per `CLAUDE.md` §5, bumping `updated:` on each page and running
`bash scripts/wiki-lint.sh`:

- `docs/architecture/renderer.md` — rail gating (`:60-63`), Shell panel and the `+`/chevron/kill
  affordances (`:128-129`, `:242`), and the terminal-survives-panel-close behavior.
- `docs/architecture/store.md` — `:29` and `:130` both describe `ShellTabStore` as keyed "per
  agent"; it is keyed per workspace checkout path.
- `docs/architecture/ipc.md` — no channel changes; touch only if the `shell:*` description implies
  an agent-scoped shell.
- `docs/architecture/gotchas.md` — note the removal of the panel-close-kills-PTYs behavior if it is
  indexed there.

Also correct the **stale comment** at `shell-tabs-hooks.ts:70-73` — or delete it with the file, per
§2.
