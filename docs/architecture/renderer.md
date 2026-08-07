---
description: How the Manifold renderer (developer workspace UI) is structured — the React entry, the dockview panel layout, and the preload-only boundary to main.
covers: [src/renderer]
updated: 2026-08-07
owner: see .github/CODEOWNERS
---

# Renderer — developer workspace UI structure

The *renderer* is the Electron renderer-process React app: the developer workspace
window with its one sidebar (Explorer / Source Control / Search), agent terminal/chat,
editors, file tree, shells, and modules. It is a pure UI layer — it owns no agent, git, or filesystem state. Every
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
(`components/ActivityBar.tsx`), labeled via a CSS hover tooltip
(`.activity-bar-tooltip`), in two groups either side of a divider. The **top group is the
one sidebar's view switcher**: a button per `SIDEBAR_VIEW_IDS` entry — Explorer, Source
Control, Search (`sidebar/sidebar-views.ts:10`) — following VS Code exactly. Picking a
different view swaps what the sidebar shows and focuses it; clicking the view already
showing collapses the sidebar, so one icon both reveals and hides and the sidebar is never
left on a view nobody asked for (`ActivityBar.tsx:130`). The **lower group toggles the
main area's panels** — Agent, Editor, Shell (`PANEL_RAIL_ITEMS`, `ActivityBar.tsx:91`) —
through `dockLayout.togglePanel(id)`; each renders accent-colored with an edge indicator
bar while its panel is visible (`isPanelVisible`), and the session-dependent `editor` is
disabled while no agent session is active. `shell` is not gated: its terminals run in the
workspace checkout, not in an agent's worktree, so the panel opens with nothing running. **The file tree has no rail item**
— it hangs under a repo's row inside the Explorer. The command catalog carries a
`view.toggle.*` command and accelerator per panel plus a `view.sidebar.*` command per
sidebar view (`src/shared/commands/catalog.ts:65`, `:72`); the latter route through
`ctx.showSidebarView`, which opens the sidebar when it is collapsed rather than silently
doing nothing (`commands/command-handlers.ts:68`, `App.tsx:457`). One button is pinned to
the bottom of the rail below a flex spacer: **Settings** (gear), which opens the settings
modal via `onOpenSettings` (`ActivityBar.tsx:185`). The rail is the only home for panel
toggles, the sidebar views, and the settings entry — the status bar
(`components/git/StatusBar.tsx`) renders none of them and keeps only session/git status
and the commit/PR/conflict actions.

**Panel layout (dockview).** The workspace is a single `DockviewReact` instance
(`AppShell.tsx:155`), themed via the `DOCK_THEME` option (`AppShell.tsx:42`): a 6px
group gap plus the rounded-card group styling in `styles/dockview-theme.css` renders
each panel group as a rounded card with a soft white-alpha hairline border (brighter on
the active group), floating on the recessed `--dock-canvas` (a darkened `--bg-primary`,
`styles/theme.css`). Text tabs (agent, shell, module panels) read as gently-rounded
chips (`--radius-xs`) floating in the strip: an elevated-surface fill when idle, tinted
with `--accent-subtle` when active — so the current theme's accent, not text weight alone,
carries the active tab (`.dock-tab:not(.dock-tab--icon)` in `styles/theme.css`, active/hover
scoped to `.dv-active-tab` in `styles/dockview-theme.css`). Icon and headless tabs
(sidebar/editor) keep their own accent-square treatment. Resize
sashes are invisible inside the gap; hovering one fades in a full-length 2px accent line,
the way VS Code's sash lights up.
Dockview's own split-view separator (`--dv-separator-border`, `styles/dockview-theme.css:24`)
is transparent for the same reason: it paints a straight full-height line down the left edge
of every view but the first, cutting across the cards' rounded corners. The chrome is screenshot-able
via the `DockPreview` fixture (`components/DockPreview.fixture.tsx`).

**The arrangement is a fixed preset.** `disableDnd` (`AppShell.tsx:164`) turns off dockview's
drag-and-drop entirely: panels open in their set places and no tab or group can be dragged to
another position. What the user changes is *size*, not arrangement — the sashes stay live, so
dragging a divider is the one layout gesture left. dockview's `locked` option is deliberately
*not* set, since it disables the sashes along with the dnd.

**The sidebar holds its pixel width when the window resizes**, VS Code style, so the center
pane absorbs the whole change instead of every column scaling. dockview alone does the
opposite: `proportionalLayout` is hardcoded `true` and its own source marks the option
"not supported", so a wider window widens the sidebar too. `observeDockResize`
(`hooks/dock-layout/dock-layout-lifecycle.ts:57`) watches the dock element and re-pins the
remembered width after each resize. It has to be a `ResizeObserver` on that element rather
than a timer off `window.resize`: a container resize reaches the grid as a bare
`BranchNode.layout()` that emits nothing (so `onDidLayoutChange` never fires for it), and
dockview defers its own relayout by a frame, which left every timer-based guess measuring
the dock one resize behind. Observers deliver in registration order, so dockview's — registered
first — has already relaid out by the time this one runs. The re-pin then has to hand back the
group's share of the theme gap (`dock-layout-helpers.ts:211`), which the pinned pass shaves off;
uncompensated it walked the sidebar ~3px thinner on every resize, and the loss persisted with
the layout. Both are pinned by `dock-layout-window-resize.test.tsx`, which gives its test dock
the app's `gap: 6` — without the gap the drift cannot reproduce. Panels are
registered by string id in `PANEL_COMPONENTS`
(`components/editor/editor-shell/dock-panels.tsx:20`); the id→component table is the authoritative
panel set. `DockAppState` is published to every panel through `DockStateContext`
(`AppShell.tsx:153`), so panels read props via `useDockState()` rather than prop-drilling.
Tab headers use `DockTab`; empty groups show `EmptyWatermark`; the left header-action slot
hosts `AgentHeaderActions` (the agent group's `+`, self-gated to the agent group) and the
right slot a `RightHeaderActions` trio (`AppShell.tsx:58`) — `ShellHeaderActions` (self-gated
to the shell panel; `components/terminal/ShellHeaderActions.tsx:19`), `AgentCloseHeaderActions`
(the agent group's hide-`×`, self-gated to the agent group), and `WorkspaceHeaderActions`
(only the icon-tab group `×`;
`components/editor/editor-shell/WorkspaceHeaderActions.tsx:14`). The shell's controls sit in
the *right* slot so they land at the far end of the strip, where VS Code puts its terminal
toolbar, rather than crowding the panel's own tab. An editor pane's own controls
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
its own. **The
Editor** renders an icon-only tab (glyph shared with the activity bar via `PanelGlyph`,
name as tooltip) without a close button of its own. **The sidebar renders no tab at
all**: it is alone in its column, so a tab there switched nothing and its glyph only
repeated the activity-bar icon that selects its view — the strip is left to its `×`
(`HEADLESS_TAB_PANELS`, `DockTab.tsx:16`; `styles/dockview-theme.css:226`). Each sits in a 24px pill centered in the 30px
strip rather than stretching to fill it, so the active tab's tint clears the card's top edge
(`styles/theme.css:547`). **Every control in a header strip takes that same pill** — a text
tab's `×`, the icon-tab group's `×` (`styles/theme.css:520`) and the shell's `+`, which is
styled inline and so repeats the numbers (`components/terminal/ShellTabs.styles.ts:37`) — at one
glyph size and colour, so a header reads as a row of matching controls rather than a tiny
glyph beside a full-height button with a divider rule. Centering uses `margin-block`, not an
alignment property: dockview's `.dv-tab` is a block, where `align-self` is inert and would drop
the whole gap below the pill. A multi-tab strip is centered across the
header the way VS Code centers a sidebar's view tabs: dockview grows only the void container
trailing the tabs, so the theme grows the always-empty `.dv-pre-actions-container` ahead of
them for the matching leading space; a `.dv-single-tab` card is excluded, since a lone tab is
not a switcher (`styles/dockview-theme.css:228`). A single `×` in the group's right header
actions closes every one of those panels in that group at once — the sidebar included, which
is why it stays in the set that marks a tab as having no close button of its own
(`ICON_TAB_PANELS`, `DockTab.tsx:11`;
`components/editor/editor-shell/WorkspaceHeaderActions.tsx:16`). There are no header
sidebar-collapse buttons — hiding a panel is done by closing it (tab `×` or the activity
bar); only the double-click sash width-cycle gesture remains from the collapse machinery
(`hooks/dock-layout/useSidebarHandleCycle.ts`). Apps are per-worktree, so the launcher list lives in the agent's options
(`components/modals/AgentSettingsModal.tsx`) — opened from the gear in the agent group's
tab bar (`AgentHeaderActions.tsx`) — and only for the active session; there is no "+ Apps" header button. Double-clicking a tab
toggles **focus mode**: `DockTab`'s `onDoubleClick` calls `onToggleMaximize` (`DockTab.tsx:38`), which
maximizes that pane's group via dockview's native `maximizeGroup`/`exitMaximizedGroup`
(`hooks/dock-layout/dock-layout-helpers.ts:272`) — hiding every other pane and the sidebar
in place (no remount) and restoring them exactly on the second double-click. **There is one
sidebar column and it is never a tab beside a workspace pane.** The default arrangement is
`sidebar | agent` at a 1:5 width ratio, with the editor and the shell opening on demand — so
a window with no agent yet starts from the same layout as one with many
(`hooks/dock-layout/dock-layout-builders.ts:13`). The builder
enforces the ratio by patching the serialized grid, first promoting any single-branch wrapper
root left behind by a sticky VERTICAL grid orientation — `api.clear()` keeps the orientation
the last `fromJSON` set, so after showing a layout with a bottom pane the columns would
otherwise nest one level deeper and the patch would miss them, yielding equal halves (#803)
(`hooks/dock-layout/dock-layout-builders.ts:45`). The sidebar's restore hints put it left of
the agent, so it only ever reopens as the left column, while the editor reopens as a document
pane right of the agent (`PANEL_RESTORE_HINTS`,
`hooks/dock-layout/dock-layout-helpers.ts:31`); `mayShareTabGroup` bars any panel from tabbing
into the sidebar even when a snapshot taken while they shared a group says otherwise
(`hooks/dock-layout/dock-layout-helpers.ts:48`, applied in `computeReopenPlacement`,
`hooks/dock-layout/dock-layout-loader.ts:216`).
Saved layouts are sanitized before
`api.fromJSON`; the sanitizer strips retired panels — `fileTree`, plus the old model's
`projects` / `sourceControl` / `modifiedFiles` columns, now views of the one sidebar
(`RETIRED_PANEL_IDS`, `hooks/dock-layout/dock-layout-sanitize.ts:10`) — and discards outright
a layout that names one of those but no `sidebar`, since stripping would leave a dock with no
sidebar at all and the caller then builds the default
(`hooks/dock-layout/dock-layout-sanitize.ts:20`, `:167`;
`dock-layout-old-layout-migration.test.tsx`). It also caps a restored sidebar column,
including stale stacked sidebar columns, to the same one-sixth share before the loader
persists repaired snapshots (`hooks/dock-layout/dock-layout-sanitize.ts:122`, `:144`;
`hooks/dock-layout/dock-layout-loader.ts:100`).
**The editor is a document pane**, not a tab of the sidebar: it materializes on the first
file open, splitting a column beside the agent, and an editor already present is left exactly
where the user dragged it — opening a file must not relocate a pane
(`ensureEditorPanelInWorkspace`, `hooks/dock-layout/dock-layout-editor.ts:10`, called from
`ensureEditorPanel`, `hooks/dock-layout/dock-layout-panels.ts:31`). The viewer shows its own
empty state (`No file selected` / `Select a file to view its contents`) until a file is
chosen (`code-viewer/CodeViewerTabs.tsx:257`, `editor-shell/EditorContent.tsx:43`;
`CodeViewer.fixture.tsx` captures it).
All add/remove/focus/split/resize logic lives in the `hooks/dock-layout/` subsystem behind
`useDockLayout`, whose return value is the dock control surface consumed by `App`
(`useDockLayout.ts:258`).

**The panel set.** Panel ids are fixed in `PANEL_IDS` with display titles in
`PANEL_TITLES` (`hooks/dock-layout/dock-layout-helpers.ts:14`, `:19`):

- `sidebar` → **Sidebar** — `SidebarPanel` (`dock-panels.tsx:86`): the one left column,
  rendering whichever of its three views the rail has selected — the views are swapped
  rather than each holding a column of its own, so only one is mounted at a time and none
  of them competes for the sidebar's width.
- The **Explorer** view — `ProjectSidebar` (`ProjectSidebar.tsx:34`): a **Workspaces** toolbar with one **Add Repository** action, then `FavoritesList` and `WorkspaceList`. The body is a flat list of bordered workspace cards and nothing else — there is no standalone-repository list, no `With agents` / `Repositories` category headers, and no Enable-Workspaces setting; a card spanning one folder *is* the simple case. **One card is open at a time**: each collapses to its name behind a disclosure chevron, and opening another closes the one before it, so the list reads as a column of workspace names until you pick one — `WorkspaceList` owns the single open id and seeds it with the active workspace (`WorkspaceList.tsx:62`, `:66`). Clicking a card's row opens it as well as selecting it; the disclosure alone closes it again, so selecting a workspace never hides what is under it (`WorkspaceCard.tsx:92`, `:119`). **A card leads with a folder glyph, and that glyph *is* its disclosure** — one icon column, not a chevron beside a folder. It swaps to the state's chevron (right when closed, down when open) while the row is hovered or keyboard-focused, so the affordance appears where the eye already is; the swap is pure CSS on `.sidebar-workspace-toggle__folder` / `__chevron` (`theme.css:929`), keyed to `:hover` and `:focus-visible` rather than `:focus-within` so a click does not leave the chevron showing after the pointer has gone. A card's folders keep their own open/closed files state while their card is closed, since that state is keyed by folder and persisted separately. **A card shows where work happens, never who is working: it renders no agent rows and no New-agent button.** Agents are the tabs of the Agent panel (below); the card only carries a pulsing `status-dot` by the workspace name while any of its agents is streaming (`WorkspaceCard.tsx:158`). A folder row says nothing about agents either, and neither the card nor its folders name a branch — branch lives in Source Control. A card header carries **Copy to new worktree** (`CopyWorkspaceGlyph`, `WorkspaceCard.tsx:169` — a new workspace over the same folders: `App.tsx:287` derives a ` 2`/` 3`-suffixed name, calls `workspace:create`, activates the copy and clears the session so the empty agent view greets the fresh checkout), **Add folder** (native picker, attaches the chosen local project to that workspace), and remove; double-clicking the name renames the workspace (`WorkspaceCard.tsx:152`). A folder row offers removal only while the workspace spans more than one, since the last one leaving would take the workspace with it (`WorkspaceCard.tsx:250`). **Clicking the card enters the workspace** (`App.tsx:364`): when the active agent isn't one of this workspace's, the main view jumps to one that is — two workspaces can span the same folders, so the active project alone can't tell them apart — or to the empty agent view when it has none. Clicking a folder only opens its files and leaves the agent alone (`App.tsx:351`) — it cannot move an agent, which always runs in the workspace's *first* folder whatever the sidebar has selected; favorite jumps follow the same rule (`App.tsx:65`). The **New workspace** row uses the same folder glyph the cards lead with (`WorkspaceGlyph`), as does a workspace entry in `FavoritesList`. Once at least one repository exists, adding a repository and creating a workspace use body-portaled dialog overlays (`AddRepositoryModal`, `NewWorkspaceModal`), leaving the dock and current agent view mounted underneath; only the true first visit with zero repositories uses the full-pane `OnboardingView`. Rows have neither a manual fetch control nor a favorite-star action: `useBranchStaleness` refreshes the active repository's remote-tracking state on activation and window focus, throttled to once every three minutes, while previously saved favorites remain available in `FavoritesList`. Every folder row is also the disclosure for its **files** — see below.
- The **Source Control** view — `SourceControl` (`components/git/SourceControl.tsx`, mounted by `SourceControlView`, `dock-panels.tsx:98`): a VS Code-style SCM view of the **active workspace**, one collapsible section per member repo checkout — the repo's name, its checked-out branch, and its uncommitted changes as colored M/A/D rows. Clicking a row is VS Code's SCM click: it opens the file in the editor **diffed against its checkout's HEAD** — the open request (`file-open-request.ts`) carries source `'sourceControl'` plus the checkout coordinates, `EditorPanel` (`dock-panels.tsx`) swaps its diff feed from the session's base-branch diff to `useWorkspaceFileDiff` (→ `git:workspace-file-diff`), and `useCodeViewerModes` opens such requests in diff mode. The data comes from one workspace-scoped IPC call, `git:workspace-status` (`git-handlers.ts`), which reads the workspace's own checkout of each repo (worktree, or the clone on a home workspace); the view refreshes on `files:changed`, `workspace:list-changed`, workspace switch, and window focus — the last covers edits made outside the app, which the session-scoped watcher misses. Each section with changes carries VS Code's **message box**: a per-repo commit input (⌘⏎ or the Commit button → `git:workspace-commit`, the same stage-all managed commit the Commit overlay uses). The **branch label is a button** (`components/git/BranchSwitcher.tsx`): clicking it opens a VS Code-style quick-pick — filter input, the repo's branches from the existing `git:list-branches` (which already hides branches held by other worktrees), and a "Create new branch" entry when the typed name matches nothing — checking the workspace checkout out via `git:workspace-checkout`; failures (e.g. dirty-tree conflicts) render inline and leave it open. It is a **centered modal**, not a popover anchored to the label: the panel is a narrow sidebar column that cramped the list and clipped long branch names. It reuses `createDialogStyles` + `useAutoFocus` and the Command Palette's keyboard model (↑/↓ move the active row, Enter selects, Escape closes), names its repo in the header since a workspace has several, and is portaled to `document.body` so an ancestor `transform` can't become the containing block for its fixed overlay. It is reached by selecting Source Control in the activity rail, the `view.sidebar.sourceControl` command (⌘⇧G), or the View menu — all of which swap the one sidebar onto this view.
- The **Search** view — `SearchView` inline in the sidebar (`SearchSidebarView`, `dock-panels.tsx:104`), the same body the search modal wraps in overlay chrome.
- `agent` → **Agent** — `AgentPanel` (`components/editor/editor-shell/dock-agent-panel.tsx:86`): renders a draft chat, an `OnboardingView` (no agent yet), an `AgentChatView` (non-interactive chat-mode), or an xterm `TerminalPane` (interactive runtime) depending on session state. **The group's tab bar is where agents live and are managed.** One tab per agent **of the active workspace**, not of the selected folder (`App.tsx` groups them by `workspaceId` and hands `useAgentSiblingDockTabs` that list) — a workspace's agents share its checkout, so hiding one behind a folder click would hide agents that work in the very same place; a **+** in the tab bar (`AgentHeaderActions.tsx:54`, mounted through `LeftHeaderActions` beside the shell's own +, `AppShell.tsx:54`) opens `NewAgentModal` on the active workspace via `onNewAgentFromHeader(workspace.id)` — falling back to whichever workspace holds the active repo when none is focused. It is deliberately *not* a runtime dropdown: the dialog owns the provider and Terminal/Chat choice, so the tab bar offers one affordance and one dialog wherever a new agent is started. At the **far right** of the strip (the right header slot, so it lands top-right of the view like the shell's ×) `AgentCloseHeaderActions` renders a `×` that **hides the active *sibling* agent tab** (`onCloseSiblingPanel`) — the agent stays alive, so selecting it again from the sidebar reopens its tab; it is disabled while the structural primary `agent` tab is active, which cannot be hidden. Both the + and the × fill their `.dv-react-part` wrapper and centre their 24px pill in it (`AgentHeaderActions.tsx:14`), because dockview's wrapper is block-level and would otherwise leave the control 6px high in the 30px strip. **Per-agent settings and delete live on each tab itself, not in the header** (`DockTab.tsx`): a tab reveals a ⚙ and 🗑 on hover/focus. ⚙ opens `AgentSettingsModal` for *that* agent (rename, runtime, chat↔terminal — saving a runtime/view change first asks for confirmation, then retires the old session and starts a new one on the same branch, worktree, files, and workspace roots; name-only changes do not replace the session). 🗑 routes to the delete-confirm dialog via `onRequestDeleteAgent`, **actually deleting the agent** (distinct from the header ×, which only hides the tab). Hiding a sibling is tracked in a module-level dismissed set (`hooks/agent-session/dismissed-agent-tabs.ts`) so the auto-tab reconciler (`useAgentSiblingDockTabs`) — which re-runs on every dock change — doesn't immediately recreate the hidden tab; reopening (select, or `openSiblingPanel`) clears the mark. **The form asks only what the workspace doesn't already answer.** Starting an agent is
  workspace-scoped end to end: `onLaunchWorkspaceAgent(workspaceId, { runtimeId, displayName,
  nonInteractive })` is the *only* launch path the dock has (`dock-panel-types.ts`), and the
  workspace decides the folders, the checkout and the branch. So the form has **no branch or PR
  picker, no worktree choice, no dirty-tree confirmation and no "another agent is working here"
  warning** — several agents sharing one checkout is the point of a workspace, not a collision to
  guard against. It doesn't even ask for a name: an agent is named after its provider, and a
  second agent of the same provider is numbered (`Claude Code`, `Claude Code 2`) from the
  workspace's existing sessions (`useNewAgentForm.tsx:77`). The name is only a **label** — it
  travels as `displayName` and titles the agent's tab (`session-creator.ts`); it cuts no branch.

  **A provider list, one hook.** The state and the launch live in `useNewAgentForm`
  (`modals/useNewAgentForm.tsx:45`); its `launch(runtimeId, mode)` takes the provider and mode
  from the clicked row rather than a single stored selection, and `pending` marks the one row
  that is starting. Two presentations render the shared `AgentLaunchList`
  (`modals/AgentLaunchList.tsx:81`): the full-panel **hero** (`modals/NewAgentHero.tsx`) for a
  workspace with no agent yet — the provider list over the workspace's finished agents, to
  resume — and the compact `NewAgentModal` (⌘N, or the agent tab bar's + — no sidebar button
  opens it), which wraps the same list narrower in `NewAgentForm`. The full-panel view drops the
  wordmark, the workspace eyebrow and the heading; `OnboardingView` keeps only the starfield
  backdrop above the list.

  **The list is the runtime picker.** One row per runtime — the agent's brand mark on the left,
  the name on the right — and clicking it starts that provider in a **terminal** on the spot. A
  final **Chat with interface** row opens an indented provider picker instead, and choosing a
  provider there starts a **chat** (`nonInteractive`) agent. The marks are inline paths in
  `new-task/RuntimeGlyph.tsx` — simple-icons (CC0-1.0) for Claude, Copilot and Gemini, the
  OpenAI logomark for Codex, which simple-icons does not carry — drawn in `currentColor`; the
  Ollama variants reuse the mark of the agent they launch, and a runtime with no mark falls back
  to an initial. A `needsModel` (Ollama) variant of a runtime already shown stays out of the
  list — having Ollama installed would otherwise double every row — and a runtime whose binary
  is missing shows disabled with a "not installed" note. Both the provider and the Terminal/Chat
  mode are **remembered as the next view's defaults**, written as one `settings:update`
  (`defaultRuntime`, `defaultAgentMode`) on launch rather than on each click, which would
  broadcast `settings:changed` to every renderer while the user tries options out
  (`useNewAgentForm.tsx`). `NewAgentAdvanced` is gone with the disclosure it held;
  `BranchPicker`/`PRPicker` stay exported from `new-task` unused, for when branch/PR selection is
  reconsidered.
- `editor` → **Editor** — `EditorPanel` wrapping `CodeViewer` (Monaco); split editors get ids prefixed `editor:` and each registers its own pane. `useCodeView`/`useCodeViewFileOps` gate `files:read` on the active session's allowed roots (worktree + additional dirs, passed from `App.tsx`): during a session switch the previous session's open file (rooted in a different worktree) is skipped instead of read against the new session id — avoiding a main-process path-traversal denial and its log noise, most visible when switching to a no-worktree agent whose root is the main repo.
- `shell` → **Shell** — `ShellTabs`, a flat list of equal, closable terminals scoped to the
  workspace checkout that `resolveShellCwd` derives from workspace/project state
  (`terminal/shell-cwd.ts:12`) — no agent required. The set lives in a module-level store
  keyed by that path (`terminal/shell-terminal-store.ts`), so closing the panel leaves the
  PTYs running and switching workspace swaps whole terminal sets, VS Code-window style.
  The dock header carries, at the far right, a split `+` (a Manifold shell immediately) with a
  narrow chevron flush against it for the Manifold/System menu, then a `×` that **hides the
  whole terminal view** — `onHideTerminals` → `onClosePanel('shell')` (`ShellHeaderActions.tsx:19`,
  `ShellTabs.styles.ts:57`); the menu is anchored by its right edge so it cannot hang off the
  window. Hiding only closes the panel — the PTYs keep running in the store, so reopening the
  shell shows the same terminals. **Killing an individual terminal is a per-row trash, not a
  header control:** the list is a vertical list down the right edge of the panel body, as in VS
  Code, shown for any terminal count so it never appears from nowhere, and each row carries a
  glyph, its label, and a trash that fades in on hover or keyboard focus
  (`ShellTabControls.tsx:27`, `.shell-tab` in `styles/theme.css`).
- `pluginView` / `pluginTreeView` — webview hosts for plugin contributions (e.g. **Statistics**, the former Verdicts dashboard, now the `manifold.statistics` plugin).

**The sidebar has one kind of root: the workspace.** There is no standalone-repository list —
a workspace spanning a single folder is the ordinary case, so `WorkspaceList` is the whole
sidebar (`WorkspaceList.tsx:37`). A card is the workspace's name over its folder rows — nothing
else hangs off it but a draft-chat row while one exists (`WorkspaceCard.tsx:249`). The card's
rows step 8px at a time — repo row at 16px, its files at 24px (`WorkspaceCard.tsx:198`,
`ProjectSidebar.styles.ts:68`, `:71`).

**Files are not a panel — the rows are folders.** There is no `fileTree` panel and no Files
tab. The sidebar behaves like the folders of a VS Code workspace: a folder row discloses the
workspace's checkout of that repo (the worktree in a worktree workspace, the clone in a home
one, `WorkspaceCard.tsx:190`), **any number open at once**, each remembered across launches as
a `project:<id>` key in `localStorage` under `manifold.sidebar.openFolders.v1`
(`sidebar/folder-disclosure.ts:57`; `WorkspaceCard.tsx:196`). Every mounted copy of the hook
shares that one set through a listener list, because a copy per card would save its own
snapshot and drop the other's folders (`folder-disclosure.ts:17`, `:63`, `:71`). A repo row
selects the workspace's home folder *and* opens its files, while its chevron
(`.sidebar-files-toggle`, named for the job, `styles/theme.css:842`) opens them without moving
home — disclosure alone never switches sessions, which would reload the agent, the editor and
the tree (`WorkspaceCard.tsx:211`, `:232`).

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
Viewing a file and its diff stays where it was — the editor pane on the other side of the
agent.

Note: **Search** is not a dock panel of its own — it is a sidebar view
(`components/search/SearchView.tsx`, rendered inline by `SearchSidebarView`) that the modal
`components/search/SearchModal.tsx` also wraps in overlay/backdrop/footer chrome
(`SearchModal.tsx:44`). The modal is mounted by the shell (`AppShell.tsx:217`) and opened by
the `navigation.findInFiles` command (`Cmd+Shift+F`) or the Memory panel's "Open Search",
both routed through `overlays.openSearch(mode?)` (`hooks/app/useAppOverlays.ts:72`), which
also carries the scope it opens on; the rail's Search icon instead swaps the sidebar onto
the view. The modal mounts its `useSearch` instance only while open, so a closed modal costs
no `search:context` IPC and every open starts from an empty query. **Web preview** is
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

**Editor view modes.** `useCodeViewerModes` owns the Editor/Preview/Diff selection for each
pane. A default file-open request may select Diff when diff data exists, while file-tree,
search, and preview-link opens select Editor (`components/editor/code-viewer/useCodeViewerModes.ts:92`).
Once the user selects Editor or changes content, `CodeViewer` suppresses later automatic
Diff selection for that open request, so the autosave/file-watcher diff refresh can expose
the Diff toggle without replacing the active editor (`components/editor/code-viewer/CodeViewer.tsx:137`,
`components/editor/code-viewer/useCodeViewerModes.ts:103`).

**Editor file freshness and undo.** Open editor files live in `useCodeView` state as `OpenFile`
records with a `refreshVersion` counter (`hooks/editor/useCodeView.ts:15`). The file watcher
hook listens to both `files:changed` and `files:tree-changed`; for the active session it
refreshes the tree and calls the app-level file-refresh callback
(`hooks/editor/useFileWatcher.ts:79`, `:93`). That callback reaches
`useCodeViewFileOps.refreshOpenFiles()`, which rereads every file still open in an editor pane
and increments `refreshVersion` when disk content changes
(`hooks/editor/useCodeViewFileOps.ts:279`, `:295`). The read-only Diff editor uses that counter
as a remount key (`components/editor/code-viewer/CodeViewer.tsx:243`),
but the editable `EditorContent` is keyed only by file path and receives refreshed text as a
controlled Monaco value. Refreshes therefore update the current model without discarding
Monaco's standard multi-step Undo/Redo history; switching files still creates a separate
history (`components/editor/editor-shell/EditorContent.tsx:27`). Selecting an already-open
file also revalidates that one file before continuing to reuse the existing tab
(`hooks/editor/useCodeViewFileOps.ts:113`, `:122`, `:142`, `:157`).

**Shared chat.** `src/renderer-shared/chat/` holds the chat surface — `ChatPane` plus the
`useChat` / `useAgentStatus` / `useSlashCommands` hooks (`chat/index.ts`). Inside the
renderer it backs both the developer draft chat (`DraftChatView`) and the live chat-mode
agent (`AgentChatView`), which the agent panel switches between
(`dock-agent-panel.tsx:118`, `:171`). It is a separate top-level dir, not under
`src/renderer/`, so it stays independent of the workspace shell.

## Key types and entry points

- `App` — `App.tsx:47`. The single source of UI state; builds `DockAppState` and renders the shell.
- `DockAppState` — `components/editor/editor-shell/dock-panel-types.ts`. The context object every dock panel reads via `useDockState()`; assembled in `App.tsx:306`.
- `PANEL_COMPONENTS` — `components/editor/editor-shell/dock-panels.tsx:20`. id→component registry = the panel set.
- `PANEL_IDS` / `PANEL_TITLES` — `hooks/dock-layout/dock-layout-helpers.ts:14`, `:19`. Canonical panel id and title lists.
- `SIDEBAR_VIEW_IDS` — `components/sidebar/sidebar-views.ts:10`. The views the one sidebar switches between; the sidebar's own state is `App.tsx:62`.
- `useDockLayout` — `hooks/dock-layout/useDockLayout.ts`. Public dock control surface (`togglePanel`, `focusPanel`, `ensureEditorPanel`, `openPluginView`, `resetLayout`, …) returned at `:258`.
- `DockTab` / `EmptyWatermark` — `DockTab.tsx:18` / `:77`. Tab header and empty-group watermark.
- `registerPanelContribution` / `getLauncherContributions` — `plugins/contribution-registry.ts:37`, `:48`. Module registry API.
- `electronAPI` — `src/preload/index.ts:197`, typed by `src/shared/electron-api.d.ts:1`. The only renderer→main door.

## Interactions

- **Preload / IPC** (`src/preload/index.ts`): the renderer calls `window.electronAPI.invoke/send/on` exclusively. The preload allowlists every channel (`ALLOWED_INVOKE_CHANNELS` etc.) and rejects anything else, then exposes the API via `contextBridge.exposeInMainWorld('electronAPI', …)` (`:229`). There is no direct `ipcRenderer` access from renderer code; `getPathForFile` (drag-drop) is the one non-IPC helper.
- **Main subsystems**: hooks invoke channels owned by main — `agent:*` (`useAgentSession`), `git:*` (`useDiff`, `useGitOperations`, `useBranchStaleness`), `files:*` (`useFileWatcher`, `useCodeView`), `projects:*` (`useProjects`), `simple:*`/`chat:*` (chat), and `plugins:*` (`App.tsx:219` pushes active project/session context to the plugin host).
- **Session subsystem** (`src/main/session`): `App` listens for `agent:output`/`agent:status`/`agent:sessions-changed` via the session hooks; `TerminalPane` streams agent PTY output and `AgentChatView` consumes chat-mode NDJSON.
- **Plugin UI** (`components/plugin-ui/PluginUiHost`, rendered at `AppShell.tsx:231`): hosts plugin-contributed surfaces; `pluginView`/`pluginTreeView` dock panels render plugin webviews.
- **Theme**: `useTheme` resolves the theme id to a body class + xterm theme; `index.tsx` loads `styles/theme.css` and `styles/dockview-theme.css`. The registry-driven theme picker is the only theme UI and lives on its own **Theme** tab in Settings (`components/modals/settings/SettingsModalBody.tsx:19`, `:102` → `ThemeSettingsSection.tsx`), always expanded rather than behind a Browse toggle; hovering a row previews the theme app-wide and the picker reverts it on unmount unless the pick was committed (`ThemePicker.tsx:89`). `App.tsx`'s `toggleTheme` survives solely as the `view.toggleTheme` command (`App.tsx:183`, `commands/command-handlers.ts:50`).

## Invariants & gotchas

- **Main is reachable only through `window.electronAPI`.** The preload allowlists channels by name; a typo or a new channel that isn't added to the allowlist is silently dropped (`send`/`on`) or rejected (`invoke`). Renderer code must never assume `ipcRenderer`/`fs`/`child_process` exist.
- **`App` is the only stateful node.** State and IPC live in `App` + hooks; `AppShell` and the panels are presentational and read everything from props or `DockStateContext`. Adding state to a panel breaks the single-source assumption (and the dock-state memo discipline).
- **Panels are dictionary-driven.** A panel exists iff its id is in `PANEL_COMPONENTS`; built-in *modules* additionally come from the contribution registry spread. Adding a panel means a `PANEL_IDS`/`PANEL_TITLES` entry plus a registry or `PANEL_COMPONENTS` entry — not new JSX in the shell.
- **StrictMode double-mounts in dev.** Every panel (notably the agent terminal) mounts twice on first render; effects and layout code under `dock-layout/` must be idempotent and resize in place rather than rebuild on remount.
- **A collapsed sidebar doesn't survive `api.fromJSON` on its own.** Collapse holds a sidebar at width 0 via a runtime `minimumWidth: 0` constraint, but dockview's `toJSON` drops `minimumWidth <= 0`, so a restore (now only at app start) recreates the group at dockview's 100px default and reopens it. `loadOrBuildLayout` re-applies any saved sub-minimum sidebar width right after `fromJSON` to preserve the collapse (`hooks/dock-layout/dock-layout-helpers.ts:357`, `hooks/dock-layout/dock-layout-loader.ts:95`).
- **The layout belongs to the window, not to the selected agent.** There is one saved layout for the whole app; `loadOrBuildLayout` runs once, from `onReady`, and nothing reloads it on a switch (`hooks/dock-layout/useDockLayout.ts:235`, `hooks/dock-layout/dock-layout-loader.ts:78`). Selecting another agent, worktree or workspace only changes what the panes show — the arrangement, sizes and open panels stay put. Layouts used to be saved per session and restored on every switch, which replayed `api.fromJSON`: panels appeared and vanished, panes resized, the sidebar lost a few pixels per switch, and every panel (the sidebar included, which then re-sorted itself) remounted mid-click. `activeSessionId` no longer selects a layout either: the editor and shell open on demand, so a window with no agent yet starts from the same `sidebar | agent` default as one with many, and nothing rebuilds when the first agent arrives (`useDockLayout.ts:79`; pinned by `dock-layout-session-switch-stability.test.tsx`).
- **"Search" and "Web preview" aren't dock panels.** Search is a view of the one `sidebar` panel, plus the `SearchModal` overlay around the same body; HTML preview is an `<iframe>` inside `CodeViewer`. Looking for either in `PANEL_COMPONENTS` will fail.
- **Monaco workers must be configured before an editor mounts.** `monaco-setup` is imported as the first line of `index.tsx` for exactly this reason; reordering it breaks worker resolution.
