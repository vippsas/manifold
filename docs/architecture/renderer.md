---
description: How the Manifold renderer (developer workspace UI) is structured — the React entry, the dockview panel layout, and the preload-only boundary to main.
covers: [src/renderer]
updated: 2026-08-03
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
(`isPanelVisible`). **Modified Files and the editor share one rail item**, since the dock
shows them as icon tabs of a single card: opening it opens both, and clicking it again
closes whichever of the two are open (`ActivityBar.tsx:77`). **The file tree has no rail
item** — it hangs under a repo's row inside Repositories, so the rail entry that used to
toggle it is gone along with the `view.toggle.fileTree` command; `view.focusFiles`
(`Cmd+Shift+E`) now focuses Repositories (`commands/command-handlers.ts:32`). The command
catalog still exposes a per-panel `view.toggle.*` command and accelerator for each
remaining panel (`src/shared/commands/catalog.ts:65`). Session-dependent items (the files
item and `shell`) are disabled while no agent session is active. Two buttons are
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
`WorkspaceHeaderActions` (only the icon-tab group `×`;
`components/editor/editor-shell/WorkspaceHeaderActions.tsx:13`). An editor pane's own controls
— split, move a file to another pane, and the view-mode toggle — are **not** in that header:
they sit at the right of the code viewer's own tab bar (`EditorPaneActions`, rendered through
`CodeViewer`'s `headerActions` slot; `EditorPaneActions.tsx:40`,
`code-viewer/CodeViewerTabs.tsx:105`). The group header belongs to the item's view tabs, and
with a split it sits above only one of the panes it was acting on. Those controls wear the same
header pill as every other control in a strip — a tab's `×`, the icon-tab group's `×` — rather
than the bordered input box they used to be, which read as a form control dropped into a row of
flat tabs; an open menu or a pane showing something other than the plain editor tints accent the
way an active icon tab does, instead of drawing a ring around the control (`.pane-action`,
`styles/theme.css:536`, `:563`, `:587`). **A pane's file tabs follow
VS Code's editor tabs** (`multieditortabscontrol.css`): each carries the Seti file-type icon the
tree uses for the same file, the name in the UI font — not the editor's monospace, which sized
the strip like code — and, only when two open files share a basename, the disambiguating folder
as a muted description beside it (`CodeViewerTabs.tsx:218`, `CodeViewer.styles.ts:62`;
`file-tree/FileTypeIcon.tsx:10`). The active tab is a piece of the editor surface pulled into the
strip: editor background, an accent rule along its top edge, and the only label at full contrast
(`styles/theme.css:596`). A tab's `×` is reserved space but shows only on hover and on the active
tab — one per tab, always on, was a row of noise beside the names (`styles/theme.css:609`).
Geometry follows VS Code too — 10px before the icon, the close action in a slot of its own, and
"shrink" sizing (content width, 80px floor) so short names do not make a ragged strip
(`CodeViewer.styles.ts:62`, `:112`). Two numbers deliberately differ, because this pane is a
~330px sidebar and its strip **wraps** where VS Code scrolls one row: tabs are 30px like the
header above rather than VS Code's 35px, which would stack to 70px as soon as a third file
opened, and a tab is capped at 220px so one long name cannot push every other tab onto a row of
its own. **Modified Files** and the
**Editor** — the two views of the one files item — render icon-only tabs
(glyph shared with the activity bar via `PanelGlyph`, name as tooltip, active view carried by
the accent colour) without per-tab close buttons. **Repositories renders no tab at all**: it is
alone in its group, so a tab there switched nothing and its glyph only repeated the
activity-bar icon that opens the item — the strip is left to its `×`
(`HEADLESS_TAB_PANELS`, `DockTab.tsx:15`; `styles/dockview-theme.css:223`). Each sits in a 24px pill centered in the 30px
strip rather than stretching to fill it, so the active tab's tint clears the card's top edge
(`styles/theme.css:547`). **Every control in a header strip takes that same pill** — a text
tab's `×`, the icon-tab group's `×` (`styles/theme.css:520`) and the shell's `+`, which is
styled inline and so repeats the numbers (`components/terminal/ShellTabs.styles.ts:34`) — at one
glyph size and colour, so a header reads as a row of matching controls rather than a tiny
glyph beside a full-height button with a divider rule. Centering uses `margin-block`, not an
alignment property: dockview's `.dv-tab` is a block, where `align-self` is inert and would drop
the whole gap below the pill. A multi-tab strip is centered across the
header the way VS Code centers a sidebar's view tabs: dockview grows only the void container
trailing the tabs, so the theme grows the always-empty `.dv-pre-actions-container` ahead of
them for the matching leading space; a `.dv-single-tab` card is excluded, since a lone tab is
not a switcher (`styles/dockview-theme.css:228`). A single `×` in the group's right header
actions closes every one of those panels in that group at once — Repositories included, which
is why it stays in the set that marks a tab as having no close button of its own
(`ICON_TAB_PANELS`, `DockTab.tsx:10`;
`components/editor/editor-shell/WorkspaceHeaderActions.tsx:16`). There are no header
sidebar-collapse buttons — hiding a panel is done by closing it (tab `×` or the activity
bar); only the double-click sash width-cycle gesture remains from the collapse machinery
(`hooks/dock-layout/useSidebarHandleCycle.ts`). Apps are per-worktree, so the launcher list lives in the agent's options
(`components/modals/AgentSettingsModal.tsx`) — opened from the gear in the agent group's
tab bar (`AgentHeaderActions.tsx`) — and only for the active session; there is no "+ Apps" header button. Double-clicking a tab
toggles **focus mode**: `DockTab`'s `onDoubleClick` calls `onToggleMaximize` (`DockTab.tsx:31`), which
maximizes that pane's group via dockview's native `maximizeGroup`/`exitMaximizedGroup`
(`hooks/dock-layout/dock-layout-helpers.ts:243`) — hiding every other pane and both sidebars
in place (no remount) and restoring them exactly on the second double-click. **Modified
Files and the editor share ONE files item**, switched by its icon tabs, and
**Repositories is a separate card** — never one of its tabs. The default arrangement is
`projects | agent | (modifiedFiles+editor)` at a 1:4:1 width ratio: a sidebar on each side
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
`api.fromJSON`; the sanitizer strips unsupported panels — `fileTree` among them, so layouts
saved while Files was still a panel come back without it (`RETIRED_PANEL_IDS`,
`hooks/dock-layout/dock-layout-sanitize.ts:7`) — drops `projects` from any group it
still shares with the files item (layouts written when the two were one card — the activity
bar reopens it as its own column), and caps restored `projects` / `modifiedFiles` sidebar
columns, including stale stacked sidebar columns, to the same one-sixth share before the
loader persists repaired snapshots (`hooks/dock-layout/dock-layout-sanitize.ts:96`, `:147`,
`:205`; `hooks/dock-layout/dock-layout-loader.ts:138`).
**The editor is a standing tab of that item**, not one that materializes on the first file
open: the item always offers the same two tabs, and the viewer shows its own empty state
(`No file selected` / `Select a file to view its contents`) until a file is chosen
(`CodeViewer.tsx:214`, `EditorContent.tsx:41`; `CodeViewer.fixture.tsx` captures it). The
default layout tabs it in inactive so the item still opens on the changes list
(`hooks/dock-layout/dock-layout-builders.ts:36`), `ensureEditorTab` backfills it whenever a
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
(`useDockLayout.ts:282`).

**The panel set.** Panel ids are fixed in `PANEL_IDS` with display titles in
`PANEL_TITLES` (`hooks/dock-layout/dock-layout-helpers.ts:16`, `:21`):

- `projects` → **Repositories** — `ProjectSidebar` (`ProjectSidebar.tsx:34`): a **Workspaces** toolbar with one **Add Repository** action, then `FavoritesList` and `WorkspaceList`. The body is a flat list of bordered workspace cards and nothing else — there is no standalone-repository list, no `With agents` / `Repositories` category headers, and no Enable-Workspaces setting; a card spanning one folder *is* the simple case. Every card stays expanded when another is selected. **A card shows where work happens, never who is working: it renders no agent rows and no New-agent button.** Agents are the tabs of the Agent panel (below); the card only carries a pulsing `status-dot` by the workspace name while any of its agents is streaming (`WorkspaceCard.tsx:129`). A folder row says nothing about agents either: on a **home** workspace it wears the gold `InPlaceBadge` naming the branch that folder itself has checked out (`WorkspaceCard.tsx:233`, `InPlaceBadge.tsx`), read once per folder over `git:current-branch` by `useFolderBranches` (`ProjectSidebar.tsx:59`) and re-read when the folder set or the workspace's agents change — nothing polls, since a clone's branch only moves when the user or an agent moves it. A worktree workspace has no such badge: every folder there is on the workspace's branch, which the card names once above them (`WorkspaceCard.tsx:200`). A card header carries **Copy to new worktree** (`CopyWorkspaceGlyph`, `WorkspaceCard.tsx:155` — a new workspace over the same folders: `App.tsx:287` derives a ` 2`/` 3`-suffixed name, calls `workspace:create`, activates the copy and clears the session so the empty agent view greets the fresh checkout), **Add folder** (native picker, attaches the chosen local project to that workspace), and remove; double-clicking the name renames the workspace (`WorkspaceCard.tsx:119`). A folder row offers removal only while the workspace spans more than one, since the last one leaving would take the workspace with it (`WorkspaceCard.tsx:250`). **Clicking the card enters the workspace** (`App.tsx:366`): when the active agent isn't one of this workspace's, the main view jumps to one that is — two workspaces can span the same folders, so the active project alone can't tell them apart — or to the empty agent view when it has none. Clicking a folder only opens its files and leaves the agent alone (`App.tsx:350`) — it cannot move an agent, which always runs in the workspace's *first* folder whatever the sidebar has selected; favorite jumps follow the same rule (`App.tsx:65`). The **New workspace** row uses the layered workspace glyph shown on each card. Once at least one repository exists, adding a repository and creating a workspace use body-portaled dialog overlays (`AddRepositoryModal`, `NewWorkspaceModal`), leaving the dock and current agent view mounted underneath; only the true first visit with zero repositories uses the full-pane `OnboardingView`. Rows have neither a manual fetch control nor a favorite-star action: `useBranchStaleness` refreshes the active repository's remote-tracking state on activation and window focus, throttled to once every three minutes, while previously saved favorites remain available in `FavoritesList`. Every folder row is also the disclosure for its **files** — see below.
- `sourceControl` → **Source Control** — `SourceControl` (`components/git/SourceControl.tsx`): a VS Code-style SCM view of the **active workspace**, one collapsible section per member repo checkout — the repo's name, its checked-out branch, and its uncommitted changes as colored M/A/D rows. Clicking a row is VS Code's SCM click: it opens the file in the editor **diffed against its checkout's HEAD** — the open request (`file-open-request.ts`) carries source `'sourceControl'` plus the checkout coordinates, `EditorPanel` (`dock-panels.tsx`) swaps its diff feed from the session's base-branch diff to `useWorkspaceFileDiff` (→ `git:workspace-file-diff`), and `useCodeViewerModes` opens such requests in diff mode. This working-tree diff is deliberately different from the **Modified Files** panel, which shows the active session's cumulative diff vs its base branch. The data comes from one workspace-scoped IPC call, `git:workspace-status` (`git-handlers.ts`), which reads the workspace's own checkout of each repo (worktree, or the clone on a home workspace); the view refreshes on `files:changed`, `workspace:list-changed`, workspace switch, and window focus — the last covers edits made outside the app, which the session-scoped watcher misses. Each section with changes carries VS Code's **message box**: a per-repo commit input (⌘⏎ or the Commit button → `git:workspace-commit`, the same stage-all managed commit the Commit overlay uses). The **branch label is a button** (`components/git/BranchSwitcher.tsx`): clicking it opens a VS Code-style quick-pick — filter input, the repo's branches from the existing `git:list-branches` (which already hides branches held by other worktrees), and a "Create new branch" entry when the typed name matches nothing — checking the workspace checkout out via `git:workspace-checkout`; failures (e.g. dirty-tree conflicts) render inline and leave it open. It is a **centered modal**, not a popover anchored to the label: the panel is a narrow sidebar column that cramped the list and clipped long branch names. It reuses `createDialogStyles` + `useAutoFocus` and the Command Palette's keyboard model (↑/↓ move the active row, Enter selects, Escape closes), names its repo in the header since a workspace has several, and is portaled to `document.body` so an ancestor `transform` can't become the containing block for its fixed overlay. Not part of the default layout: it opens from the activity rail, `view.toggle.sourceControl` (⌘⌥4), or the View menu, as its own column beside Repositories (`PANEL_RESTORE_HINTS`).
- `agent` → **Agent** — `AgentPanel` (`components/editor/editor-shell/dock-agent-panel.tsx:86`): renders a draft chat, an `OnboardingView` (no agent yet), an `AgentChatView` (non-interactive chat-mode), or an xterm `TerminalPane` (interactive runtime) depending on session state. **The group's tab bar is where agents live and are managed.** One tab per agent **of the active workspace**, not of the selected folder (`App.tsx` groups them by `workspaceId` and hands `useAgentSiblingDockTabs` that list) — a workspace's agents share its checkout, so hiding one behind a folder click would hide agents that work in the very same place; a **+** in the tab bar (`AgentHeaderActions.tsx:79`, mounted through `LeftHeaderActions` beside the shell's own +, `AppShell.tsx:54`) opens `NewAgentModal` on the active workspace via `onNewAgentFromHeader(workspace.id)` — falling back to whichever workspace holds the active repo when none is focused. It is deliberately *not* a runtime dropdown: the dialog owns the runtime × Terminal/Chat choice, so the tab bar offers one affordance and one dialog wherever a new agent is started. Both this + and the gear fill their `.dv-react-part` wrapper and centre their 24px pill in it (`AgentHeaderActions.tsx:17`), because dockview's wrapper is block-level and would otherwise leave the control 6px high in the 30px strip. A gear beside it opens `AgentSettingsModal` for the active agent (rename, runtime, chat↔terminal — saving a runtime/view change first asks for confirmation, then retires the old session and starts a new one on the same branch, worktree, files, and workspace roots; name-only changes do not replace the session). **A tab's × closes the agent, not a panel**: both the primary `agent` tab and sibling tabs route through `handleClosePanel` to the delete-confirm dialog (`useEditorPaneHandlers.ts:151`); only the empty agent panel (no session) closes as a plain panel. **The form asks only what the workspace doesn't already answer.** Starting an agent is
  workspace-scoped end to end: `onLaunchWorkspaceAgent(workspaceId, { runtimeId, displayName,
  nonInteractive })` is the *only* launch path the dock has (`dock-panel-types.ts`), and the
  workspace decides the folders, the checkout and the branch. So the form has **no branch or PR
  picker, no worktree choice, no dirty-tree confirmation and no "another agent is working here"
  warning** — several agents sharing one checkout is the point of a workspace, not a collision to
  guard against. What is left is a name, a runtime and Terminal/Chat. The typed name is only a
  **label**: it travels as `displayName` and titles the agent's tab (`useNewAgentForm.tsx:96` →
  `session-creator.ts`); it cuts no branch, and a blank one stays blank rather than becoming a
  random Norwegian city.

  **Two layouts, one hook.** That state and the launch itself live in
  `useNewAgentForm` (`modals/useNewAgentForm.tsx:37`), which two presentations consume. A
  workspace with no agent yet gets the full-panel **hero** (`modals/NewAgentHero.tsx`): the
  wordmark, the workspace name over its branch, the optional name field, then two cards —
  **Start Chat** and **Start Terminal**, which *launch on click* — and the workspace's finished
  agents underneath, to resume. A launching card passes its mode to `submit(mode)` rather than
  calling `setMode` first, because the state wouldn't have updated by the time the launch
  reads it. Submitting the name field with Enter has no card to carry a mode, so it launches
  the remembered `defaultAgentMode` — the card marked `↵`.
  `NewAgentModal` (⌘N, or the agent tab bar's + — no sidebar button opens it) wraps the same hook in
  `NewAgentForm`: one layout, with the Terminal/Chat pill and a Start button.

  The runtime is chosen from tiles rather than a dropdown: one tile per runtime, the agent's brand mark over the name
  (`new-task/AgentRuntimePicker.tsx:20`). The marks are inline paths in
  `new-task/RuntimeGlyph.tsx` — simple-icons (CC0-1.0) for Claude, Copilot and Gemini, the
  OpenAI logomark for Codex, which simple-icons does not carry — drawn in `currentColor` so a
  tile keeps its muted/hover/selected colour; the Ollama variants reuse the mark of the agent
  they launch, and a runtime with no mark falls back to a display-serif initial. A tile needs a
  binary that was found and a runtime that isn't a `needsModel` (Ollama) variant of one already
  shown — having Ollama installed would otherwise double every mark. Either can still be the
  current selection, and then it stays visible: a missing binary has to explain a disabled Start
  (`AgentRuntimePicker.tsx:13`). Tiles stop growing at 150px so a
  machine with one runtime installed gets a tile, not a form-wide button
  (`AgentRuntimePicker.styles.ts:22`). Both the runtime and the Terminal/Chat mode are
  **remembered as the next form's defaults**, written as one `settings:update`
  (`defaultRuntime`, `defaultAgentMode`) on submit rather than on each click, which would
  broadcast `settings:changed` to every renderer while the user tries options out
  (`useNewAgentForm.tsx:107`). The modal form shows the tiles; the hero picks the same runtime
  from the compact `AgentDropdown` under its cards (`NewAgentHero.tsx:73`). `NewAgentAdvanced`
  is gone with the disclosure it held; `BranchPicker`/`PRPicker` stay exported from `new-task`
  unused, for when branch/PR selection is reconsidered.
- `editor` → **Editor** — `EditorPanel` wrapping `CodeViewer` (Monaco); split editors get ids prefixed `editor:` and each registers its own pane. `useCodeView`/`useCodeViewFileOps` gate `files:read` on the active session's allowed roots (worktree + additional dirs, passed from `App.tsx`): during a session switch the previous session's open file (rooted in a different worktree) is skipped instead of read against the new session id — avoiding a main-process path-traversal denial and its log noise, most visible when switching to a no-worktree agent whose root is the main repo.
- `modifiedFiles` → **Modified Files** — `ModifiedFiles` diff list; files with `FileChange.foreignWorktree` (inherited because the base branch advanced) are grouped below a "from another worktree" separator, dimmed, with an origin tooltip.
- `shell` → **Shell** — `ShellTabs` (worktree + project shell PTYs).
- `pluginView` / `pluginTreeView` — webview hosts for plugin contributions (e.g. **Statistics**, the former Verdicts dashboard, now the `manifold.statistics` plugin).

**The sidebar has one kind of root: the workspace.** There is no standalone-repository list —
a workspace spanning a single folder is the ordinary case, so `WorkspaceList` is the whole
sidebar (`WorkspaceList.tsx:37`). A card is the workspace's name (with its branch label on a
worktree workspace, `WorkspaceCard.tsx:81`) over its folder rows — nothing else hangs off it
but a draft-chat row while one exists (`WorkspaceCard.tsx:270`). The card's rows step 8px at a
time — repo row at 16px, its files at 24px (`WorkspaceCard.tsx:209`,
`ProjectSidebar.styles.ts:68`, `:71`).

**Files are not a panel — the rows are folders.** There is no `fileTree` panel and no Files
tab. The sidebar behaves like the folders of a VS Code workspace: a folder row discloses the
workspace's checkout of that repo (the worktree in a worktree workspace, the clone in a home
one, `WorkspaceCard.tsx:197`), **any number open at once**, each remembered across launches as
a `project:<id>` key in `localStorage` under `manifold.sidebar.openFolders.v1`
(`sidebar/folder-disclosure.ts:57`; `WorkspaceCard.tsx:189`). Every mounted copy of the hook
shares that one set through a listener list, because a copy per card would save its own
snapshot and drop the other's folders (`folder-disclosure.ts:17`, `:63`, `:71`). A repo row
selects the workspace's home folder *and* opens its files, while its chevron
(`.sidebar-files-toggle`, named for the job, `styles/theme.css:842`) opens them without moving
home — disclosure alone never switches sessions, which would reload the agent, the editor and
the tree (`WorkspaceCard.tsx:204`, `:225`).

Nothing reorders the list while you work: workspaces are sorted by the recency read at startup
and then **held**, so picking an agent records the visit for the next launch without sliding
its card to the top under the cursor (`sidebar-recency.ts:45`, `WorkspaceList.tsx:60`, `:91`).

Several folders showing at once is possible because **the main process authorizes file paths
against the workspace roots** — every registered repo plus every session's worktree — not
against the selected session, and reads need no session at all (`main/ipc/file-handlers.ts:26`,
`:46`, `:53`). A file in any open folder therefore opens, saves and renames like any other; the
renderer no longer pre-filters reads by the active session's roots. Only the *selected* agent's
worktree is a live, watched tree with change badges (`useFileWatcher`); every other folder is
fetched on demand through `files:tree` / `files:tree-by-project` and cached per root, so
reopening one paints in the same frame instead of flashing empty
(`hooks/editor/useWorkspaceTree.ts:17`, `FolderFilesTree.tsx:26`). Folder trees render without
the filter/refresh strip and without a row for their own root — the sidebar row above already
names the folder, and one strip per open folder would stack up (`FolderFilesTree.tsx:39`;
`flattenRoots`, `file-tree/file-tree-visible.ts:44`). Depth is carried by indentation alone —
no rule down the left of a tree, no rounded row fills, and no focus glow: at sidebar density
those read as clutter (`ProjectSidebar.styles.ts:68`, `styles/theme.css:703`). The whole
sidebar is one ladder in the file tree's own 8px per-depth step, so each disclosure chevron
sits exactly one step right of its parent's: the workspace header, then its folder rows, then
a folder's files (`ProjectSidebar.styles.ts:69`, `:72`). The tree paints no
background of its own so it reads as part of the sidebar rather than a card dropped into it
(`file-tree/FileTree.styles.ts:16`). Rows use a single 16px glyph column like VS Code — a
rotating chevron for directories, the file-type icon for files, no folder glyph — so every
name lands in the same column at a given depth (`tree-node-row.tsx:124`). Change badges
separate direct working-tree changes from branch-only ones: `mergeFileChanges` unions the
base-branch diff (`useDiff`) with the live `git status` watcher feed and tags each path
`worktreeDirty` by source (`useFileDiff.ts:4`). A dirty path renders the vivid A/M/D letter
with a tinted name; a path that only differs vs the base branch (committed on the branch,
clean in the worktree) renders a faint `○` with a plain name (`tree-node-row.tsx:71`, `:178`).
Viewing a file and its diff stays where it was — the editor and Modified Files tabs of the
files item on the other side of the agent.

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
- `useDockLayout` — `hooks/dock-layout/useDockLayout.ts`. Public dock control surface (`togglePanel`, `focusPanel`, `ensureEditorPanel`, `openPluginView`, `resetLayout`, …) returned at `:282`.
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
- **A collapsed sidebar doesn't survive `api.fromJSON` on its own.** Collapse holds a sidebar at width 0 via a runtime `minimumWidth: 0` constraint, but dockview's `toJSON` drops `minimumWidth <= 0`, so a restore (now only at app start) recreates the group at dockview's 100px default and reopens it. `loadOrBuildLayout` re-applies any saved sub-minimum sidebar width right after `fromJSON` to preserve the collapse (`hooks/dock-layout/dock-layout-helpers.ts:397`, `hooks/dock-layout/dock-layout-loader.ts:146`).
- **The layout belongs to the window, not to the selected agent.** There is one saved layout for the whole app; `loadOrBuildLayout` runs once, from `onReady`, and nothing reloads it on a switch (`hooks/dock-layout/useDockLayout.ts:240`, `hooks/dock-layout/dock-layout-loader.ts:127`). Selecting another agent, worktree or workspace only changes what the panes show — the arrangement, sizes and open panels stay put. Layouts used to be saved per session and restored on every switch, which replayed `api.fromJSON`: panels appeared and vanished, panes resized, the sidebars lost a few pixels per switch, and every panel (the repositories sidebar included, which then re-sorted itself) remounted mid-click. `activeSessionId` is passed to the hook only as the empty-state signal, and the sole rebuild left is the one-way trip out of it: with no agent yet the fallback layout is the two-panel `applyMinimalPanels`, and the first agent turns it into the full default (`useDockLayout.ts:254`, guarded by `isMinimalLayout`, `dock-layout-loader.ts:117`; pinned by `dock-layout-session-switch-stability.test.tsx`).
- **"Search" and "Web preview" aren't dock panels.** Search is the `SearchModal` overlay opened from the activity rail; HTML preview is an `<iframe>` inside `CodeViewer`. Looking for them in `PANEL_COMPONENTS` will fail.
- **Monaco workers must be configured before an editor mounts.** `monaco-setup` is imported as the first line of `index.tsx` for exactly this reason; reordering it breaks worker resolution.
