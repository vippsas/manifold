---
description: How the Manifold renderer (developer workspace UI) is structured — the React entry, the dockview panel layout, and the preload-only boundary to main.
covers: [src/renderer]
updated: 2026-07-28
owner: see .github/CODEOWNERS
---

# Renderer — developer workspace UI structure

The *renderer* is the Electron renderer-process React app: the developer workspace
window with its repositories sidebar, agent terminal/chat, editors, file tree, shells,
and modules. It is a pure UI layer — it owns no agent, git, or filesystem state. Every
cross-process call goes through `window.electronAPI`, the narrow channel-allowlisting
bridge exposed by the preload. This page is an orientation map of the renderer's
structure: the entry chain, the dockview-based panel system, and the major directory
boundaries. Individual panels and hooks are catalogued only enough to locate them.

## Covered code

- `src/renderer/index.tsx` — process entry: imports `monaco-setup`, mounts `<App/>` in `React.StrictMode` via `createRoot`, and pulls in dockview + theme CSS (`index.tsx:14`).
- `src/renderer/App.tsx` — the single stateful container. Composes ~30 hooks into one `DockAppState` object and renders `<AppShell/>` + `<QuickOpen/>` (`App.tsx:42`, `:256`).
- `src/renderer/AppShell.tsx` — presentational shell: title bar, the activity-bar icon rail + `DockviewReact` host (side by side in `.layout-workbench`), status bar, and all modals/overlays/toasts (`AppShell.tsx:80`).
- `src/renderer/DockTab.tsx` — `DockTab` (the per-panel tab header) and `EmptyWatermark` (the empty-group drop hint).
- `src/renderer/monaco-setup.ts` — wires `MonacoEnvironment.getWorker` to the per-language Vite `?worker` bundles and calls `loader.config({ monaco })`.
- `src/renderer/components/` — all UI by surface: `editor/`, `terminal/`, `sidebar/`, `git/`, `search/`, `modals/`, `memory/`, `new-task/`, `plugin-ui/`.
- `src/renderer/hooks/` — the renderer's data/state hooks, grouped into domain subfolders: `agent-session/`, `project/`, `search/`, `terminal/`, `editor/`, `app/`, `settings/`, `theme/`, `plugin-ui/`, and the `dock-layout/` subsystem that drives dockview (a few cross-cutting utilities like `useAutoFocus`/`useContainerWidth` stay at the root).
- `src/renderer/components/home/` — the global **Dashboard** home-layer surface: `DashboardHomeView` (a full-screen overlay opened by the `view.dashboard` command — command palette or the native View menu — and by the New Agent modal's "View all worktrees" link through `dockState.onOpenDashboard`; no window chrome button opens it) renders a host-owned card grid (`dashboard-cards.ts`) of summary tiles; selecting one drills into that module's plugin webview by view id (`PluginViewPanel`) with a back-to-grid control. The cards are Worktrees and Statistics (the latter an all-projects view via `verdicts.listAll()`); each card's headline numbers come from a thin `dashboard:*-summary` IPC (`DashboardHomeView.tsx:39`, `dashboard-cards.ts:65`). When the Statistics webview opens with cached open PR records, its bridge posts one automatic `verify-prs` request so the panel can refresh stale PR state without waiting for the manual button.
- `src/renderer/modules/launcher-modules.ts` — derives the "+ Apps" launcher list from the contribution registry.
- `src/renderer/plugins/` — the renderer-side panel contribution registry (`contribution-registry.ts`, `internal-contributions.ts`, `use-contributions.ts`).
- `src/renderer-shared/chat/` — chat UI/logic (`ChatPane`, `useChat`, `useAgentStatus`, `useSlashCommands`) factored into its own top-level dir so chat surfaces can share it.

Not detailed here: the per-component internals (each `components/*` subtree), `styles/` CSS, `assets/`, and the leaf helpers `session-selection.ts` / `terminal-input-filter.ts`.

## How it works

**Entry chain.** `index.tsx` is the only entry. It runs `monaco-setup` first (so the
Monaco workers are registered before any editor mounts), then renders `<App/>` under
`React.StrictMode` — which means every component mounts, unmounts, and remounts once in
dev. `App` is the lone stateful node: it calls all the data hooks, assembles them into a
single `DockAppState` (`App.tsx:256`), and hands that plus top-level handlers to the
otherwise-presentational `AppShell`. `AppShell` short-circuits to `WelcomeDialog` (setup
incomplete) or `OnboardingView` (no projects) before rendering the full workspace
(`AppShell.tsx:87`, `:96`).

**UI scale.** `App` applies the `uiScale` setting in a layout effect that clamps the value with
`clampUiScale`, sets the `--ui-scale` CSS variable on the document root, and dispatches a
`manifold:ui-scale-changed` event (`App.tsx:50`–`:53`). The agent terminal follows it:
`buildTerminalOptions` seeds `fontSize` as `Math.round(13 * uiScale)` (`terminal-font.ts:47`) and
`useTerminal` live-updates the running xterm's `fontSize` on each `manifold:ui-scale-changed`
(`useTerminal.ts:105`, `:108`).

**Activity bar.** A fixed (non-collapsible) icon rail sits left of the dock
(`components/ActivityBar.tsx`): one button per `RAIL_ITEMS` entry, labeled via a CSS
hover tooltip (`.activity-bar-tooltip`). An item stands for one or more panels — a
click toggles them through `dockLayout.togglePanel(id)`, and the item renders
accent-colored with an edge indicator bar while any of them is visible
(`isPanelVisible`). **Files, Modified Files and the editor share one rail item**, since
the dock shows them as icon tabs of a single card: opening it opens `fileTree` +
`modifiedFiles` (the editor tab joins on demand when a file is opened) and clicking it
again closes whichever of the three are open (`ActivityBar.tsx:82`). The command
catalog still exposes a per-panel `view.toggle.*` command and accelerator for each of
them (`src/shared/commands/catalog.ts:65`). Session-dependent items (the Files item and
`shell`) are disabled while no agent session is active. Two buttons are
pinned to the bottom of the rail below a flex spacer: **Search** (magnifier), which opens
the search modal via `onOpenSearch` (`ActivityBar.tsx:100`), and **Settings** (gear),
which opens the settings modal via `onOpenSettings`. The rail is the only home for panel
toggles, search, and the settings entry — the status bar
(`components/git/StatusBar.tsx`) renders none of them and keeps only session/git status
and the commit/PR/conflict actions.

**Panel layout (dockview).** The workspace is a single `DockviewReact` instance
(`AppShell.tsx:143`), themed via the `DOCK_THEME` option (`AppShell.tsx:38`): a 6px
group gap plus the rounded-card group styling in `styles/dockview-theme.css` renders
each panel group as a rounded card with a soft white-alpha hairline border (brighter on
the active group), floating on the recessed `--dock-canvas` (a darkened `--bg-primary`,
`styles/theme.css`). The tab strip shares the card surface — no tonal header band,
divider, or active-tab underline; the active tab is carried by text color. Resize
sashes are invisible inside the gap; hovering one fades in a rounded accent handle bar.
Dockview's own split-view separator (`--dv-separator-border`, `styles/dockview-theme.css:24`)
is transparent for the same reason: it paints a straight full-height line down the left edge
of every view but the first, cutting across the cards' rounded corners. The chrome is screenshot-able
via the `DockPreview` fixture (`components/DockPreview.fixture.tsx`). Panels are
registered by string id in `PANEL_COMPONENTS`
(`components/editor/editor-shell/dock-panels.tsx:17`); the id→component table is the authoritative
panel set. `DockAppState` is published to every panel through `DockStateContext`
(`AppShell.tsx:141`), so panels read props via `useDockState()` rather than prop-drilling.
Tab headers use `DockTab`; empty groups show `EmptyWatermark`; the left header-action slot
hosts `ShellHeaderActions` (self-gated to the shell panel;
`components/terminal/ShellHeaderActions.tsx:12`) and the right slot
`WorkspaceHeaderActions` (editor actions plus the icon-tab group `×`;
`components/editor/editor-shell/WorkspaceHeaderActions.tsx:14`). The tool panels —
**Repositories**, **Files**, **Modified Files**, and the **Editor** — render icon-only tabs
(glyph shared with the activity bar via `PanelGlyph`, name as tooltip, active view carried by
the accent colour) without per-tab close buttons. Each sits in a 24px pill centered in the 30px
strip rather than stretching to fill it, so the active tab's tint clears the card's top edge
(`styles/theme.css:537`). A multi-tab strip is centered across the
header the way VS Code centers a sidebar's view tabs: dockview grows only the void container
trailing the tabs, so the theme grows the always-empty `.dv-pre-actions-container` ahead of
them for the matching leading space; a `.dv-single-tab` card is excluded, since a lone tab is
not a switcher (`styles/dockview-theme.css:228`). A single `×` in the group's right header
actions closes every icon-tab panel in that group at once (`ICON_TAB_PANELS`,
`DockTab.tsx:12`; `components/editor/editor-shell/WorkspaceHeaderActions.tsx:16`). There are no header
sidebar-collapse buttons — hiding a panel is done by closing it (tab `×` or the activity
bar); only the double-click sash width-cycle gesture remains from the collapse machinery
(`hooks/dock-layout/useSidebarHandleCycle.ts`). Apps are per-worktree, so the launcher list lives in the agent's options
(`components/modals/AgentSettingsModal.tsx`) — opened from the gear on the agent's
sidebar row — and only for the active session; there is no "+ Apps" header button. Double-clicking a tab
toggles **focus mode**: `DockTab`'s `onDoubleClick` calls `onToggleMaximize` (`DockTab.tsx:31`), which
maximizes that pane's group via dockview's native `maximizeGroup`/`exitMaximizedGroup`
(`hooks/dock-layout/dock-layout-helpers.ts:243`) — hiding every other pane and both sidebars
in place (no remount) and restoring them exactly on the second double-click. **Files,
Modified Files and the editor share ONE files item**, switched by its icon tabs, and
**Repositories is a separate card** — never one of its tabs. The default arrangement is
`projects | agent | (fileTree+modifiedFiles)` at a 1:4:1 width ratio: a sidebar on each side
of the agent, with one column for the whole files item rather than a column per tool
(`hooks/dock-layout/dock-layout-builders.ts:8`). The builder
enforces the ratio by patching the serialized grid, first promoting any single-branch wrapper
root left behind by a sticky VERTICAL grid orientation — `api.clear()` keeps the orientation
the last `fromJSON` set, so after showing a layout with a bottom pane the columns would
otherwise nest one level deeper and the patch would miss them, yielding equal halves (#803)
(`hooks/dock-layout/dock-layout-builders.ts:56`). Each files panel's restore hints point
`within` its siblings before any direction, so a reopened tool rejoins the one item instead of
landing in a foreign group or spawning a second sidebar, while `projects` only ever reopens as
its own column (`PANEL_RESTORE_HINTS`, `hooks/dock-layout/dock-layout-helpers.ts:39`). The two
items can never absorb each other: `mayShareTabGroup` bars a reopening panel from tabbing into
the other item even when a snapshot taken while they shared a group says otherwise
(`hooks/dock-layout/dock-layout-helpers.ts:63`, applied in `computeReopenPlacement`,
`hooks/dock-layout/dock-layout-loader.ts:253`). Reopening a files panel deliberately ignores
its closed-panel snapshot and always takes the hint path: a snapshot records wherever the panel
sat when it was closed — possibly a card of its own — and replaying that is exactly how the one
item ends up as several (`hooks/dock-layout/dock-layout-actions.ts:108`).
A saved layout is the one placement no reopen rule can police, so `coalesceFilesItem` runs right
after `fromJSON` and pulls every open files panel into the first one's group, healing a snapshot
written while the views sat apart instead of letting the split persist; the repaired layout is
saved back, and an editor that just rejoined the sidebar-width item gets the same widening as
one tabbing in from an open file (`hooks/dock-layout/dock-layout-files-item.ts:18`,
`hooks/dock-layout/dock-layout-loader.ts:138`). Split editor panes (`editor:N`) are exempt — a
split is a second pane the user asked for, not a stray tab. Saved layouts are sanitized before
`api.fromJSON`; the sanitizer strips unsupported panels, drops `projects` from any group it
still shares with the files item (layouts written when the two were one card — the activity
bar reopens it as its own column), and caps restored `projects` / `fileTree` sidebar columns,
including stale stacked sidebar columns, to the same one-sixth share before the loader
persists repaired snapshots (`hooks/dock-layout/dock-layout-sanitize.ts:77`, `:120`, `:145`,
`:203`; `hooks/dock-layout/dock-layout-loader.ts:138`).
**The editor is a standing tab of that item**, not one that materializes on the first file
open: the item always offers the same three tabs, and the viewer shows its own empty state
(`No file selected` / `Select a file to view its contents`) until a file is chosen
(`CodeViewer.tsx:214`, `EditorContent.tsx:41`; `CodeViewer.fixture.tsx` captures it). The
default layout tabs it in inactive so the item still opens on Files
(`hooks/dock-layout/dock-layout-builders.ts:44`), `ensureEditorTab` backfills it whenever a
file view opens the item or a layout saved before this restores without it
(`hooks/dock-layout/dock-layout-files-item.ts:17`, called from
`hooks/dock-layout/dock-layout-actions.ts:124` and `dock-layout-loader.ts:145`), and
`ensureEditorPanelInWorkspace` still covers the case where the whole item is closed, splitting
a column beside the agent (`hooks/dock-layout/dock-layout-editor.ts:22`). Because the tab is
always there, the widening that makes it editable can no longer key off the pane being created:
opening a file widens the shared group to a one-third share whenever it is narrower than a
quarter of the dock, and no-ops otherwise (`widenSharedEditorGroup`,
`hooks/dock-layout/dock-layout-loader.ts:46`, called unconditionally from `ensureEditorPanel`,
`hooks/dock-layout/dock-layout-panels.ts:39`). Merely adding the empty tab never widens — the
item stays a sidebar until a file is actually opened. When the last
editor pane leaves, it shrinks back to one-sixth (`shrinkEditorHostSidebarGroups`,
`hooks/dock-layout/dock-layout-loader.ts:55`, called from the editor-close paths in
`dock-layout-actions.ts`). While mixed, the group is a center pane, not a sidebar: the
sanitizer's sidebar cap and the hint-reopen shrink loop both skip groups hosting non-sidebar
panels (`dock-layout-files-editor-group.test.tsx` pins all three behaviours).
All add/remove/focus/split/resize logic lives in the `hooks/dock-layout/` subsystem behind
`useDockLayout`, whose return value is the dock control surface consumed by `App`
(`useDockLayout.ts:301`).

**The panel set.** Panel ids are fixed in `PANEL_IDS` with display titles in
`PANEL_TITLES` (`hooks/dock-layout/dock-layout-helpers.ts:13`, `:18`):

- `projects` → **Repositories** — `ProjectSidebar` (repos, sessions, optional workspaces, drafts). The panel is a flat list of bordered working-set cards with no `With agents` / `Repositories` category headers: a one-repository card is the simple case, while a named workspace card contains every repository and agent in that working set. Every card remains expanded when another card is selected. Its header contains **Add folder** where the former agent `+` lived, while the persistent bottom action is **Add agent**, which opens `NewAgentModal`. Add folder opens the native folder picker: on a named workspace the selected local project is attached immediately; on a one-repository card it promotes the card into a workspace containing both folders. This action stays visible when workspace display is disabled and enables it after the user actually selects a second folder; cancelling the picker leaves the setting unchanged. The **New workspace** row uses the layered workspace glyph shown on each workspace card. Once at least one repository exists, adding a standalone repository and creating a workspace use body-portaled dialog overlays (`AddRepositoryModal`, `NewWorkspaceModal`), leaving the dock and current agent view mounted underneath; only the true first visit with zero repositories uses the full-pane `OnboardingView`. Repository rows have neither a manual fetch control nor a favorite-star action: `useBranchStaleness` refreshes the active repository's remote-tracking state on activation and window focus, throttled to once every three minutes, while previously saved favorites remain available in `FavoritesList`. Repository ids already represented by workspace cards are suppressed from the standalone card list. Workspace display remains controllable through **Settings → General → Enable Workspaces**; while disabled, `App` omits existing workspace cards, filters workspace favorites, and clears workspace selection so the repository-only launch path remains active. Each agent row (`AgentItem`) marks no-worktree agents with a gold **"in-place"** badge and chat agents with `◐`; its gear opens `AgentSettingsModal` to rename the agent, choose its runtime, and switch between the chat UI and interactive terminal. Saving a runtime/view change first asks for confirmation, then retires the old session, clears its chat, and starts a new session on the same branch, worktree, files, and workspace roots. Name-only changes do not replace the session. The former lock/delete-protection affordance is retired, including for sessions that still carry an old persisted `locked` flag.
- `agent` → **Agent** — `AgentPanel` (`components/editor/editor-shell/dock-agent-panel.tsx:86`): renders a draft chat, an `OnboardingView` (no agent yet), an `AgentChatView` (non-interactive chat-mode), or an xterm `TerminalPane` (interactive runtime) depending on session state. The `OnboardingView` → `NewAgentForm` create flow reads the `useWorktrees` setting (threaded as `defaultUseWorktrees` via the panel state, like `defaultAgentMode`); its Advanced section shows a per-agent **"Run without a worktree"** toggle (hidden when "Continue on an existing branch or PR" is selected, which is inherently in-place), defaulting to the inverse of `useWorktrees`. Checking it sets `SpawnAgentOptions.noWorktree`; the agent then works directly on its **base branch** with no typed name (named after the branch), or cuts a **new branch off the base** with a typed name. The Advanced branch picker sets that base branch (`baseBranch`, default = project base), which also becomes the session's diff/PR base. When the pending agent will run in place and another in-place agent is already running in the repo, the form shows a non-blocking warning. Because cutting a new in-place branch switches the project's real working copy, the form pre-checks `git:has-uncommitted-changes` for the typed-name case and — if dirty — shows a `ConfirmDialog` (portaled to `document.body` to escape dockview's transform); confirming re-launches with `allowDirtyWorktree`. A blank name sets `autoName` (no random-city placeholder) (`NewAgentForm.tsx`).
- `editor` → **Editor** — `EditorPanel` wrapping `CodeViewer` (Monaco); split editors get ids prefixed `editor:` and each registers its own pane. `useCodeView`/`useCodeViewFileOps` gate `files:read` on the active session's allowed roots (worktree + additional dirs, passed from `App.tsx`): during a session switch the previous session's open file (rooted in a different worktree) is skipped instead of read against the new session id — avoiding a main-process path-traversal denial and its log noise, most visible when switching to a no-worktree agent whose root is the main repo.
- `fileTree` → **Files** — `FileTree` over the worktree + any additional dirs. Rows use a single 16px glyph column like VS Code — a rotating chevron for directories, the file-type icon for files, no folder glyph — so every name lands in the same column at a given depth (`tree-node-row.tsx:124`). Change badges separate direct working-tree changes from branch-only ones: `mergeFileChanges` unions the base-branch diff (`useDiff`) with the live `git status` watcher feed and tags each path `worktreeDirty` by source (`useFileDiff.ts:4`). A dirty path renders the vivid A/M/D letter with a tinted name; a path that only differs vs the base branch (committed on the branch, clean in the worktree) renders a faint `○` with a plain name (`tree-node-row.tsx:71`, `:178`).
- `modifiedFiles` → **Modified Files** — `ModifiedFiles` diff list; files with `FileChange.foreignWorktree` (inherited because the base branch advanced) are grouped below a "from another worktree" separator, dimmed, with an origin tooltip.
- `shell` → **Shell** — `ShellTabs` (worktree + project shell PTYs).
- `pluginView` / `pluginTreeView` — webview hosts for plugin contributions (e.g. **Statistics**, the former Verdicts dashboard, now the `manifold.statistics` plugin).

Note: **Search** is not a dock panel — it is a modal (`components/search/SearchModal.tsx`)
mounted by the shell (`AppShell.tsx:216`) and opened from the activity rail's Search
button, the `navigation.findInFiles` command (`Cmd+Shift+F`), or the Memory panel's "Open
Search" — all three route through `overlays.openSearch(mode?)`
(`hooks/app/useAppOverlays.ts:76`), which also carries the scope the modal opens on. The
modal mounts its `useSearch` instance only while open, so a closed modal costs no
`search:context` IPC and every open starts from an empty query. **Web preview** is
likewise not a standalone panel:
HTML files render in an `<iframe>` inside the editor's `CodeViewer`
(`components/editor/code-viewer/CodeViewer.tsx:218`, resolved by `viewer/useResolvedHtmlPreview.ts`),
alongside the markdown/image/PDF previews in `components/editor/viewer/`.

**Modules & the contribution registry.** Internal (built-in-component) modules are
registered as internal contributions (`plugins/internal-contributions.ts`) into the
in-memory registry (`plugins/contribution-registry.ts:15`); `INTERNAL_PANELS` is now
**empty** — every built-in launcher module has moved to a plugin (Loop → `manifold.loop`,
Watch → `manifold.watch`, Verdicts → `manifold.statistics`), so the registry holds only
plugin-contributed views. The mechanism remains: `dock-panels.tsx` spreads
`getPanelComponents()` into `PANEL_COMPONENTS` so any future internal module becomes a real
dockview panel, and `launcher-modules.ts` filters `launcher: true` entries to populate
the "+ Apps" menu. `use-contributions.ts` (`useLoadPluginContributions`, called at the top
of `AppShell`) subscribes the React tree to registry changes so plugin-contributed panels
appear without a reload.

**Monaco.** `monaco-setup.ts` is imported for its side effects only: it assigns
`self.MonacoEnvironment.getWorker` to route each language label to its dedicated worker
bundle (`json`/`css`/`html`/`typescript`/`editor`) and registers the `monaco` instance
with `@monaco-editor/react`'s `loader`. The actual editor component is `CodeViewer`.

**Editor file freshness.** Open editor files live in `useCodeView` state as `OpenFile`
records with a `refreshVersion` remount key (`useCodeView.ts:18`). The file watcher hook
listens to both `files:changed` and `files:tree-changed`; for the active session it refreshes
the tree and calls the app-level file-refresh callback (`useFileWatcher.ts:79`, `:93`). That
callback reaches `useCodeViewFileOps.refreshOpenFiles()`, which rereads every file still open
in an editor pane and increments `refreshVersion` when disk content changes
(`useCodeViewFileOps.ts:259`). Selecting an already-open file also revalidates that one file
before continuing to reuse the existing tab (`useCodeViewFileOps.ts:62`, `:93`, `:102`).

**Shared chat.** `src/renderer-shared/chat/` holds the chat surface — `ChatPane` plus the
`useChat` / `useAgentStatus` / `useSlashCommands` hooks (`chat/index.ts`). Inside the
renderer it backs both the developer draft chat (`DraftChatView`) and the live chat-mode
agent (`AgentChatView`), which the agent panel switches between
(`dock-agent-panel.tsx:118`, `:171`). It is a separate top-level dir, not under
`src/renderer/`, so it stays independent of the workspace shell.

## Key types and entry points

- `App` — `App.tsx:41`. The single source of UI state; builds `DockAppState` and renders the shell.
- `DockAppState` — `components/editor/editor-shell/dock-panel-types.ts`. The context object every dock panel reads via `useDockState()`; assembled in `App.tsx:256`.
- `PANEL_COMPONENTS` — `components/editor/editor-shell/dock-panels.tsx:17`. id→component registry = the panel set.
- `PANEL_IDS` / `PANEL_TITLES` — `hooks/dock-layout/dock-layout-helpers.ts:13`, `:18`. Canonical panel id and title lists.
- `useDockLayout` — `hooks/dock-layout/useDockLayout.ts`. Public dock control surface (`togglePanel`, `focusPanel`, `ensureEditorPanel`, `openPluginView`, `resetLayout`, …) returned at `:298`.
- `DockTab` / `EmptyWatermark` — `DockTab.tsx:13` / `:69`. Tab header and empty-group watermark.
- `registerPanelContribution` / `getLauncherContributions` — `plugins/contribution-registry.ts:37`, `:48`. Module registry API.
- `electronAPI` — `src/preload/index.ts:197`, typed by `src/shared/electron-api.d.ts:1`. The only renderer→main door.

## Interactions

- **Preload / IPC** (`src/preload/index.ts`): the renderer calls `window.electronAPI.invoke/send/on` exclusively. The preload allowlists every channel (`ALLOWED_INVOKE_CHANNELS` etc.) and rejects anything else, then exposes the API via `contextBridge.exposeInMainWorld('electronAPI', …)` (`:229`). There is no direct `ipcRenderer` access from renderer code; `getPathForFile` (drag-drop) is the one non-IPC helper.
- **Main subsystems**: hooks invoke channels owned by main — `agent:*` (`useAgentSession`), `git:*` (`useDiff`, `useGitOperations`, `useBranchStaleness`), `files:*` (`useFileWatcher`, `useCodeView`), `projects:*` (`useProjects`), `simple:*`/`chat:*` (chat), and `plugins:*` (`App.tsx:219` pushes active project/session context to the plugin host).
- **Session subsystem** (`src/main/session`): `App` listens for `agent:output`/`agent:status`/`agent:sessions-changed` via the session hooks; `TerminalPane` streams agent PTY output and `AgentChatView` consumes chat-mode NDJSON.
- **Plugin UI** (`components/plugin-ui/PluginUiHost`, rendered at `AppShell.tsx:231`): hosts plugin-contributed surfaces; `pluginView`/`pluginTreeView` dock panels render plugin webviews.
- **Theme**: `useTheme` resolves the theme id to a body class + xterm theme; `index.tsx` loads `styles/theme.css` and `styles/dockview-theme.css`; the dockview host toggles `dockview-minimal` when no session is active (`AppShell.tsx:126`). The registry-driven theme picker is the only theme UI and lives on its own **Theme** tab in Settings (`components/modals/settings/SettingsModalBody.tsx:19`, `:102` → `ThemeSettingsSection.tsx`), always expanded rather than behind a Browse toggle; hovering a row previews the theme app-wide and the picker reverts it on unmount unless the pick was committed (`ThemePicker.tsx:89`). `App.tsx`'s `toggleTheme` survives solely as the `view.toggleTheme` command (`App.tsx:183`, `commands/command-handlers.ts:50`).

## Invariants & gotchas

- **Main is reachable only through `window.electronAPI`.** The preload allowlists channels by name; a typo or a new channel that isn't added to the allowlist is silently dropped (`send`/`on`) or rejected (`invoke`). Renderer code must never assume `ipcRenderer`/`fs`/`child_process` exist.
- **`App` is the only stateful node.** State and IPC live in `App` + hooks; `AppShell` and the panels are presentational and read everything from props or `DockStateContext`. Adding state to a panel breaks the single-source assumption (and the dock-state memo discipline).
- **Panels are dictionary-driven.** A panel exists iff its id is in `PANEL_COMPONENTS`; built-in *modules* additionally come from the contribution registry spread. Adding a panel means a `PANEL_IDS`/`PANEL_TITLES` entry plus a registry or `PANEL_COMPONENTS` entry — not new JSX in the shell.
- **StrictMode double-mounts in dev.** Every panel (notably the agent terminal) mounts twice on first render; effects and layout code under `dock-layout/` must be idempotent and resize in place rather than rebuild on remount.
- **A collapsed sidebar doesn't survive `api.fromJSON` on its own.** Collapse holds a sidebar at width 0 via a runtime `minimumWidth: 0` constraint, but dockview's `toJSON` drops `minimumWidth <= 0`, so a reload (agent switch, app restart) recreates the group at dockview's 100px default and reopens it. `loadOrBuildLayout` re-applies any saved sub-minimum sidebar width right after `fromJSON` to preserve the collapse (`hooks/dock-layout/dock-layout-helpers.ts:417`, `hooks/dock-layout/dock-layout-loader.ts:133`).
- **Sidebar widths carry across session switches.** Dock layouts persist per session, so restoring the incoming session's layout would also restore *its* sidebar widths — making the sidebars visibly jump whenever the user clicks another repo/agent in the sidebar. `useDockLayout`'s session-change effect captures the current widths (`captureSidebarWidthsForReload`) before the reload and re-applies them after (`applyCarriedSidebarWidths`), including a carried collapse; a side whose panel didn't exist before the switch keeps the incoming layout's width (`hooks/dock-layout/useDockLayout.ts:274-291`, `hooks/dock-layout/dock-layout-helpers.ts:148-182`; pinned by `dock-layout-session-switch-widths.test.tsx`).
- **"Search" and "Web preview" aren't dock panels.** Search is the `SearchModal` overlay opened from the activity rail; HTML preview is an `<iframe>` inside `CodeViewer`. Looking for them in `PANEL_COMPONENTS` will fail.
- **Monaco workers must be configured before an editor mounts.** `monaco-setup` is imported as the first line of `index.tsx` for exactly this reason; reordering it breaks worker resolution.
