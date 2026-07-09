---
description: How the Manifold renderer (developer workspace UI) is structured — the React entry, the dockview panel layout, and the preload-only boundary to main.
covers: [src/renderer]
updated: 2026-07-09
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
- `src/renderer/AppShell.tsx` — presentational shell: title bar, the `DockviewReact` host, status bar, and all modals/overlays/toasts (`AppShell.tsx:80`).
- `src/renderer/DockTab.tsx` — `DockTab` (the per-panel tab header) and `EmptyWatermark` (the empty-group drop hint).
- `src/renderer/monaco-setup.ts` — wires `MonacoEnvironment.getWorker` to the per-language Vite `?worker` bundles and calls `loader.config({ monaco })`.
- `src/renderer/components/` — all UI by surface: `editor/`, `terminal/`, `sidebar/`, `git/`, `search/`, `modals/`, `memory/`, `new-task/`, `plugin-ui/`.
- `src/renderer/hooks/` — the renderer's data/state hooks, grouped into domain subfolders: `agent-session/`, `project/`, `search/`, `terminal/`, `editor/`, `app/`, `settings/`, `theme/`, `plugin-ui/`, and the `dock-layout/` subsystem that drives dockview (a few cross-cutting utilities like `useAutoFocus`/`useContainerWidth` stay at the root).
- `src/renderer/components/home/` — the global **Dashboard** home-layer surface: `DashboardHomeView` (a full-screen overlay opened from `DashboardSidebarButton` via `onOpenDashboard` / the `view.dashboard` command) renders a host-owned card grid (`dashboard-cards.ts`) of summary tiles; selecting one drills into that module's plugin webview by view id (`PluginViewPanel`) with a back-to-grid control. The cards are Worktrees and Statistics (the latter an all-projects view via `verdicts.listAll()`); each card's headline numbers come from a thin `dashboard:*-summary` IPC (`DashboardHomeView.tsx:39`, `dashboard-cards.ts:65`). When the Statistics webview opens with cached open PR records, its bridge posts one automatic `verify-prs` request so the panel can refresh stale PR state without waiting for the manual button.
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

**Panel layout (dockview).** The workspace is a single `DockviewReact` instance
(`AppShell.tsx:125`). Panels are registered by string id in `PANEL_COMPONENTS`
(`components/editor/editor-shell/dock-panels.tsx:17`); the id→component table is the authoritative
panel set. `DockAppState` is published to every panel through `DockStateContext`
(`AppShell.tsx:123`), so panels read props via `useDockState()` rather than prop-drilling.
Tab headers use `DockTab`; empty groups show `EmptyWatermark`; the left header-action slot
hosts `LeftHeaderActions` (shell controls plus the agent group's "add agent on this
worktree" button) and the right slot `RightHeaderActions` (workspace actions + sidebar
collapse) (`components/editor/editor-shell/SidebarCollapseAction.tsx:66`, `:89`). Double-clicking a tab
toggles **focus mode**: `DockTab`'s `onDoubleClick` calls `onToggleMaximize` (`DockTab.tsx:31`), which
maximizes that pane's group via dockview's native `maximizeGroup`/`exitMaximizedGroup`
(`hooks/dock-layout/dock-layout-helpers.ts:243`) — hiding every other pane and both sidebars
in place (no remount) and restoring them exactly on the second double-click. The default arrangement is
`projects | agent | (fileTree+modifiedFiles)` at a 1:4:1 width ratio
(`hooks/dock-layout/dock-layout-builders.ts:8`); the builder enforces the ratio by patching
the serialized grid, first promoting any single-branch wrapper root left behind by a sticky
VERTICAL grid orientation — `api.clear()` keeps the orientation the last `fromJSON` set, so
after showing a layout with a bottom pane the three columns would otherwise nest one level
deeper and the patch would miss them, yielding equal thirds (#803)
(`hooks/dock-layout/dock-layout-builders.ts:41`). Saved layouts are sanitized before
`api.fromJSON`; the sanitizer strips unsupported panels and caps restored `projects` /
`fileTree` sidebar columns, including stale stacked sidebar columns, to the same
one-sixth share before the loader persists repaired snapshots
(`hooks/dock-layout/dock-layout-sanitize.ts:91`, `:116`, `:174`; `hooks/dock-layout/dock-layout-loader.ts:51`).
All add/remove/focus/split/resize logic lives in the `hooks/dock-layout/` subsystem behind
`useDockLayout`, whose return value is the dock control surface consumed by `App`
(`useDockLayout.ts:301`).

**The panel set.** Panel ids are fixed in `PANEL_IDS` with display titles in
`PANEL_TITLES` (`hooks/dock-layout/dock-layout-helpers.ts:13`, `:18`):

- `projects` → **Repositories** — `ProjectSidebar` (repos, sessions, workspaces, drafts). Each agent row (`AgentItem`) marks no-worktree agents with a gold **"in-place"** badge after the branch name, alongside the `◐` chat glyph and lock glyph.
- `agent` → **Agent** — `AgentPanel` (`components/editor/editor-shell/dock-agent-panel.tsx:86`): renders a draft chat, an `OnboardingView` (no agent yet), an `AgentChatView` (non-interactive chat-mode), or an xterm `TerminalPane` (interactive runtime) depending on session state. The `OnboardingView` → `NewAgentForm` create flow reads the `useWorktrees` setting (threaded as `defaultUseWorktrees` via the panel state, like `defaultAgentMode`); its Advanced section shows a per-agent **"Run without a worktree"** toggle (hidden when "Continue on an existing branch or PR" is selected, which is inherently in-place), defaulting to the inverse of `useWorktrees`. Checking it sets `SpawnAgentOptions.noWorktree`; the agent then works directly on its **base branch** with no typed name (named after the branch), or cuts a **new branch off the base** with a typed name. The Advanced branch picker sets that base branch (`baseBranch`, default = project base), which also becomes the session's diff/PR base. When the pending agent will run in place and another in-place agent is already running in the repo, the form shows a non-blocking warning. Because cutting a new in-place branch switches the project's real working copy, the form pre-checks `git:has-uncommitted-changes` for the typed-name case and — if dirty — shows a `ConfirmDialog` (portaled to `document.body` to escape dockview's transform); confirming re-launches with `allowDirtyWorktree`. A blank name sets `autoName` (no random-city placeholder) (`NewAgentForm.tsx`).
- `editor` → **Editor** — `EditorPanel` wrapping `CodeViewer` (Monaco); split editors get ids prefixed `editor:` and each registers its own pane. `useCodeView`/`useCodeViewFileOps` gate `files:read` on the active session's allowed roots (worktree + additional dirs, passed from `App.tsx`): during a session switch the previous session's open file (rooted in a different worktree) is skipped instead of read against the new session id — avoiding a main-process path-traversal denial and its log noise, most visible when switching to a no-worktree agent whose root is the main repo.
- `fileTree` → **Files** — `FileTree` over the worktree + any additional dirs. Change badges separate direct working-tree changes from branch-only ones: `mergeFileChanges` unions the base-branch diff (`useDiff`) with the live `git status` watcher feed and tags each path `worktreeDirty` by source (`useFileDiff.ts:4`). A dirty path renders the vivid A/M/D letter with a tinted name; a path that only differs vs the base branch (committed on the branch, clean in the worktree) renders a faint `○` with a plain name (`tree-node-row.tsx:71`, `:178`).
- `modifiedFiles` → **Modified Files** — `ModifiedFiles` diff list; files with `FileChange.foreignWorktree` (inherited because the base branch advanced) are grouped below a "from another worktree" separator, dimmed, with an origin tooltip.
- `shell` → **Shell** — `ShellTabs` (worktree + project shell PTYs).
- `pluginView` / `pluginTreeView` — webview hosts for plugin contributions (e.g. **Statistics**, the former Verdicts dashboard, now the `manifold.statistics` plugin).

Note: **Search** is not a dock panel — it lives in the title bar (`TitleBarSearch`,
wired through `AppShell.tsx:113`). **Web preview** is likewise not a standalone panel:
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
- `DockTab` / `EmptyWatermark` — `DockTab.tsx:7` / `:58`. Tab header and empty-group watermark.
- `registerPanelContribution` / `getLauncherContributions` — `plugins/contribution-registry.ts:37`, `:48`. Module registry API.
- `electronAPI` — `src/preload/index.ts:197`, typed by `src/shared/electron-api.d.ts:1`. The only renderer→main door.

## Interactions

- **Preload / IPC** (`src/preload/index.ts`): the renderer calls `window.electronAPI.invoke/send/on` exclusively. The preload allowlists every channel (`ALLOWED_INVOKE_CHANNELS` etc.) and rejects anything else, then exposes the API via `contextBridge.exposeInMainWorld('electronAPI', …)` (`:229`). There is no direct `ipcRenderer` access from renderer code; `getPathForFile` (drag-drop) is the one non-IPC helper.
- **Main subsystems**: hooks invoke channels owned by main — `agent:*` (`useAgentSession`), `git:*` (`useDiff`, `useGitOperations`, `useFetchProject`), `files:*` (`useFileWatcher`, `useCodeView`), `projects:*` (`useProjects`), `simple:*`/`chat:*` (chat), and `plugins:*` (`App.tsx:219` pushes active project/session context to the plugin host).
- **Session subsystem** (`src/main/session`): `App` listens for `agent:output`/`agent:status`/`agent:sessions-changed` via the session hooks; `TerminalPane` streams agent PTY output and `AgentChatView` consumes chat-mode NDJSON.
- **Plugin UI** (`components/plugin-ui/PluginUiHost`, rendered at `AppShell.tsx:231`): hosts plugin-contributed surfaces; `pluginView`/`pluginTreeView` dock panels render plugin webviews.
- **Theme**: `useTheme` resolves the theme id to a body class + xterm theme; `index.tsx` loads `styles/theme.css` and `styles/dockview-theme.css`; the dockview host toggles `dockview-minimal` when no session is active (`AppShell.tsx:126`). The title bar's family dropdown is a hardcoded six-family list (`TitleBar.tsx:16`) fed by `App.tsx`'s `themeFamily` prefix match (`App.tsx:167`); the Settings theme picker is registry-driven instead.

## Invariants & gotchas

- **Main is reachable only through `window.electronAPI`.** The preload allowlists channels by name; a typo or a new channel that isn't added to the allowlist is silently dropped (`send`/`on`) or rejected (`invoke`). Renderer code must never assume `ipcRenderer`/`fs`/`child_process` exist.
- **`App` is the only stateful node.** State and IPC live in `App` + hooks; `AppShell` and the panels are presentational and read everything from props or `DockStateContext`. Adding state to a panel breaks the single-source assumption (and the dock-state memo discipline).
- **Panels are dictionary-driven.** A panel exists iff its id is in `PANEL_COMPONENTS`; built-in *modules* additionally come from the contribution registry spread. Adding a panel means a `PANEL_IDS`/`PANEL_TITLES` entry plus a registry or `PANEL_COMPONENTS` entry — not new JSX in the shell.
- **StrictMode double-mounts in dev.** Every panel (notably the agent terminal) mounts twice on first render; effects and layout code under `dock-layout/` must be idempotent and resize in place rather than rebuild on remount.
- **A collapsed sidebar doesn't survive `api.fromJSON` on its own.** Collapse holds a sidebar at width 0 via a runtime `minimumWidth: 0` constraint, but dockview's `toJSON` drops `minimumWidth <= 0`, so a reload (agent switch, app restart) recreates the group at dockview's 100px default and reopens it. `loadOrBuildLayout` re-applies any saved sub-minimum sidebar width right after `fromJSON` to preserve the collapse (`hooks/dock-layout/dock-layout-helpers.ts:334`, `hooks/dock-layout/dock-layout-loader.ts:61`).
- **"Search" and "Web preview" aren't dock panels.** Search is the title-bar `TitleBarSearch`; HTML preview is an `<iframe>` inside `CodeViewer`. Looking for them in `PANEL_COMPONENTS` will fail.
- **Monaco workers must be configured before an editor mounts.** `monaco-setup` is imported as the first line of `index.tsx` for exactly this reason; reordering it breaks worker resolution.
