---
description: How the Manifold renderer (developer workspace UI) is structured — the React entry, the dockview panel layout, and the preload-only boundary to main.
covers: [src/renderer]
updated: 2026-08-09
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
- `src/renderer/components/TitleBar.tsx` — the window title bar. Carries the theme controls at its trailing edge: a family `<select>` and a light/dark toggle, rendered on every shell branch including the pre-setup and no-project screens (`AppShell.tsx:123`). The family list is derived from the theme registry via `getThemeFamilies()` rather than hardcoded, so it cannot outlive the themes it names — an earlier hardcoded copy kept offering Royal after that family was retired. Switching family preserves the current variant; the toggle flips the variant within the family (`App.tsx:186`).
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

**A workspace row's glyph says which kind it is.** The list is flat — a repo's own
clone and the worktrees cut off it sit side by side — so `WorkspaceGlyph` draws a folder
for a **home** workspace and a git branch for a **worktree** one
(`sidebar/WorkspaceGlyph.tsx`), keyed off `isWorktreeWorkspace`
(`shared/workspace-types.ts`), whose marker is `worktreePaths` and not `branchName`: a home
workspace also sits on a branch, it just does not own the checkout. Favorites carry the
same glyph — `ResolvedFavorite.worktree` is resolved alongside the name in `useFavorites`
(`hooks/project/useFavorites.ts`) so the starred rows above the list read the same way.

**Only home workspaces take in an agent that names no workspace.**
`groupSessionsByWorkspace` (`hooks/app/session-workspace-map.ts:18`) buckets every session
by workspace: one carrying a `workspaceId` goes there and nowhere else, while one without
(the shape the New-Repo, draft-promote and deep-link spawns produce) is placed by repo —
but only into **home** workspaces (`session-workspace-map.ts:30`). A worktree workspace owns
a checkout of its own and every agent cut for it names it (`session-creator.ts:224`), so an
unnamed agent is by definition working in the clone, never in that checkout. Placing it by
repo alone put it in *both*: a second workspace over the same folders ("New Workspace, Same
Folders") adopted the clone's agent and became its `primarySession` (`App.tsx:107`), which
the agent panel renders in preference to the active session (`dock-agent-panel.tsx:98`) —
so the new workspace opened on another workspace's agent, on the wrong checkout, with both
rows' activity dots lit for the one running agent (`WorkspaceCard.tsx:108`).
The glyph doubles as the row's disclosure control, swapping to a chevron on hover
(`theme.css:1019`), so one column carries kind and state at once.

**Workspace rows name their repo.** A sidebar workspace row reads `kong / moss`: the
owning repo dimmed, then the workspace's own name (`WorkspaceCard.tsx:153`,
`ProjectSidebar.styles.ts` `rowRepo`). The repo comes from `projectIds[0]` via
`workspaceRowLabel` (`sidebar/agent-labels.ts`), never from parsing the name — only some
stored names carry a branch prefix, since `workspaceNameFor` strips just the literal
`manifold/` while branches are prefixed with the repo folder name
(`workspace-promotion.ts:14`, `git/branch-namer.ts:53`). The helper strips a redundant
prefix off the name, appends `+N` for the extra repos of a multi-repo workspace, and
drops the segment entirely when the name already *is* the repo, so a home workspace stays
`vops` rather than `vops / vops`. **The repo segment is sized to its own text and the
name absorbs the row's width pressure** (`ProjectSidebar.styles.ts` `rowRepo`): an
ellipsis cuts at a character boundary, so any width cap that bites leaves dead space
between the repo and the `/`. The `max-width: 28ch` cap is only a backstop against a
repo long enough to erase the name, and `white-space: nowrap` is load-bearing — without
it `text-overflow` never fires and a long repo wraps to a second line instead.

That cap **must be a length, not a percentage**. A percentage resolves against
`rowLabelPath`, which is shrink-to-fit rather than full-width, so it scaled with the row's
*own* text instead of the space available — biting hardest on the short rows that had room
to spare and never on the long ones it was written for. The previous
`calc(100% - 5ch)` rendered `apex / zed` as `a… / zed` while leaving the 26-character
`commerce-platform-services` untouched. Verify a change here by screenshot
(`SidebarSortAlpha` for the short rows, `ProjectSidebar` for a long repo); jsdom has no
layout engine, so no unit test can catch it.

**The active workspace is marked as a region, not a row.** The card carrying
`sidebar-project-group--active` (`WorkspaceCard.tsx:118`, fed by `activeWorkspaceId` at
`WorkspaceList.tsx:116`) gets a 2px accent rail down its full height
(`theme.css:933`) plus a wash of `--sidebar-active-bg` on its rows
(`theme.css:951`). The split is deliberate: the rail runs past an expanded file tree so
the region still reads as one, while the wash lands only on *direct* `.sidebar-item-row`
children — an expanded tree renders into `.sidebar-project-files`
(`WorkspaceRepoRow.tsx:117`), which is not a row, so the highlight costs the same whether
a folder is collapsed or a large tree is open. Label color and the accent glyph
(`WorkspaceGlyph.tsx:22`) stay, but they are no longer carrying the signal alone: that
glyph is the same hue as the `status-dot--active` dots on every *working* workspace, and
those pulse (`core-pulse`, `theme.css:477`), so a static 14px icon lost to them.

Three cascade traps live in these selectors, all of them invisible to the sidebar's unit
tests since jsdom never loads `theme.css`. **The sticky header** (`theme.css:973`) needs
the wash *composited onto* `--bg-sidebar` through a `linear-gradient` layer rather than a
flat fill: it ties with the card's wash rule at `(0,3,0)` and comes later, so a flat
opaque fill wins and leaves the header reading unhighlighted while its children stay
washed. **Its hover** (`theme.css:986`) needs the same treatment, because the card's own
hover rule scores `(0,3,1)` and would otherwise replace that opaque base with a
translucent fill, letting rows scroll visibly through the header. And **the rail needs
`z-index: 3`** to clear the header's `2` — the header's background is opaque by necessity
and otherwise paints over the rail's top, so the rail appears to start at the first folder
row instead of the top of the card. Rows in the active card also need their own `:hover`
(`theme.css:960`): `--list-hover-bg` is accent at 5% against the 7% wash and loses on
specificity anyway (`theme.css:880` is `(0,2,0)`), so without it the active card stops
responding to the pointer entirely. Verify a change here by screenshot plus a driven page
— `--emit-html` on the screenshot script, then read `getComputedStyle` after the row's
`background` transition (`theme.css:877`) settles, or the value read back is a mid-flight
interpolation rather than the resting one.

**A folder row fetches its repo's clone, not the workspace's checkout.** Each git folder
row of an open workspace card carries a `RepoFetchButton` (`WorkspaceRepoRow.tsx:86`) that
invokes `git:fetch` with the *project* id, so main fetches `project.path` and updates
`project.baseBranch` (`git-handlers.ts:117`) — the branch new work is cut from, and the
branch `git:staleness` measures "behind origin" against. A worktree workspace's own
checkout is deliberately untouched. Idle the button is a quiet `↻`; once the base branch
trails origin it becomes an accent pill carrying the count, capped at `9+`
(`ProjectSidebar.styles.ts` `fetchPill`). Fetch state is per row — `useFetchProject`
(`hooks/project/useFetchProject.ts`) holds the in-flight flag and the outcome, which
renders under the row and clears itself after 5s. The count itself is *not* per row:
`useBranchStaleness` probes the **active project only**, throttled to 3 minutes and
re-armed on window focus (`App.tsx:164`), and its `behindCounts` reach the row through
`DockAppState` → `ProjectSidebar` → `WorkspaceList` → `WorkspaceCard`; a successful fetch
calls back to `markFresh` so the pill clears without another network probe. Both the
button and the `×` live in `.sidebar-item-actions`, which is `opacity: 0` until the row is
hovered or focused (`theme.css:974`) — so the pill is a hover-time warning, not a
persistent badge.

**A workspace row's actions are words, not glyphs.** The row carries exactly one control —
a `⋯` (`WorkspaceActionsGlyph`, `WorkspaceCard.tsx:214`) that opens
`buildWorkspaceContextMenu` anchored under itself via `useContextMenu.openAt`
(`useContextMenu.ts:38`), the same list right-clicking the row gives. It replaced a fork
glyph and a folder-plus glyph sitting side by side: an icon can only say "worktree" to
someone who already knows a workspace *is* one, so the teaching happens in the menu's
language instead, and the `⋯` doubles as the advertisement that the right-click menu
exists. Three consequences worth keeping:

- **The menu offers no way to start an agent, on purpose** (`workspace-context-menu.ts:33`).
  A `New Agent Here…` item was tried here and removed: starting an agent already belongs to
  the `+` on the agent group's tab bar (`AgentHeaderActions.tsx:42`), and a second route from
  the workspace row read as a competing way to do the same thing rather than as a shortcut. A
  regression test pins the absence.
- The menu is **not** gated on `DockStateContext` (`WorkspaceCard.tsx:265`) — a trigger that
  did nothing wherever the dock state is absent would be worse than the glyphs it replaced,
  so favoriting drops out of the list instead (`workspace-context-menu.ts:29`). In the app
  proper the provider wraps the whole dock (`AppShell.tsx:164`), so only tests see the
  reduced menu.
- **The row's `×` is gone**; removal is `Remove Workspace` in the menu. A destructive action
  reads better as a word among its siblings than as a glyph one stray click from the
  disclosure. This is why the glyph is `⋯` and not the `+` it briefly was: a plus promises
  *adding*, and the most consequential item behind this one removes the workspace. A `▾`
  was rejected too — it collides with the disclosure chevron the row's own glyph swaps to
  on hover.
- Dropping the `×` orphaned `WorkspaceList`'s in-flight `removing` flag, which existed only
  to disable it (`WorkspaceList.tsx:84`). Nothing replaced it: `ContextMenu` closes on the
  click, so re-invoking removal means reopening the menu, and a second `workspace:remove`
  is a no-op returning `false` (`workspace-store.ts:46`).

**"New Workspace, Same Folders" is deliberately not called "Copy to New Worktree."** The old
label misread twice, and both readings were wrong about what the code does: from a worktree
row it sounded like nesting a worktree inside a worktree, and "copy" promised the current
work came along. Neither happens. `copyWorkspaceToWorktree` passes only the source's
`projectIds` (`App.tsx:302`), and `buildWorkspaceWorkingSet` cuts each checkout from
`project.path` at `project.baseBranch` (`workspace-worktrees.ts:61`) — the repo's own clone,
on a fresh `manifold/<slug>` branch. The result is a *sibling* of the source workspace that
inherits its folders and runtime and nothing else. **The auto-name is a Norwegian city, not
`<source> 2`** (`pickUnusedNorwegianCityName`, `norwegian-cities.ts:59`): a numeric suffix
promised the same thing the old label did — `jessheim 2` reads as a second draft of
`jessheim`, when the two share no branch and no commits. A city says "somewhere else", and it
is already the app's word for an unnamed unit of work (`agent-handlers.ts:91`). The row's
repo prefix carries the association the suffix used to fake, so `manifold / Oslo` still says
which folders it spans. The suffix survives only as the fallback once all ~50 city names are
live, where it is honest.

**Tooltips are the app's own, not the OS's.** `common/Tooltip.tsx` wraps a control and
shows a themed bubble after a 250ms rest (`Tooltip.tsx:13`) on hover *or* keyboard focus,
with an optional second line for what the action gets you. It exists because the native
`title` attribute waits about a second and then draws in OS chrome — long enough that the
words never reach the user who needed them, which is exactly how the workspace row's icons
came to be unreadable. Like `ContextMenu` it portals to `document.body`
(`Tooltip.tsx:105`): inside the tree, dockview's transformed `.dv-render-overlay` would
offset its `position: fixed` from the measured viewport point. Triggers keep their own
`aria-label` — the bubble is decorative for assistive tech.

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
group gap plus the group styling in `styles/dockview-theme.css` renders each panel group
as a rounded-cornered surface floating on the recessed `--dock-canvas` (a darkened
`--bg-primary`, `styles/theme.css`). Groups carry **no outline of their own** — a hairline
around every panel boxes the workspace in; the sash between two groups is the divider
instead, so each boundary is drawn once rather than twice. Text tabs (agent, shell, module
panels) are modelled on VS Code's editor tabs: the strip is chrome
(`--bg-chrome-hi` → `--bg-chrome`) and each tab fills it edge to edge, idle ones sitting in
`--bg-chrome` while the active one carries the content background (`--bg-chrome-active`)
and an accent rule that fades at both ends along its top edge — so the active tab reads as
the surface below pulled up into the strip (`.dock-tab:not(.dock-tab--icon)` in
`styles/theme.css`, strip/active/accent scoped to `.dv-active-tab` in
`styles/dockview-theme.css:267`). That fill needs `padding-block: 0` and a flex stretch on
dockview's `.dv-react-part` wrapper: the library pads `.dv-tab` by `0.25rem 0.5rem`, and
`height: 100%` on the wrapper resolves to `auto` against a flex item. Icon and headless tabs
(sidebar/editor) keep their own accent-square treatment. Each resize
sash is a 1px line centered in the gap, carrying five 3px grip dots — stacked for a
vertical divider, in a row for a horizontal one. Hovering brightens the dots from
`--text-muted` to `--accent`; the line itself holds `--divider` throughout
(`styles/dockview-theme.css:48`). That steady color is set through dockview's own
`--dv-sash-color`/`--dv-active-sash-color` (`:30`) rather than a `background` of ours,
because the library's `.dv-sash:not(.disabled):hover` rule ties us on specificity and wins
on source order — it would blank a hardcoded background the moment the pointer arrives.
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
(the icon-tab group `×`, which in practice means the sidebar's — an editor group hides its
header strip entirely, see below;
`components/editor/editor-shell/WorkspaceHeaderActions.tsx:14`). The shell's controls sit in
the *right* slot so they land at the far end of the strip, where VS Code puts its terminal
toolbar, rather than crowding the panel's own tab. An editor pane's own controls
— split, move a file to another pane, the view-mode toggle, and the pane's `×` — are **not** in
that header: they sit at the right of the code viewer's own tab bar (`EditorPaneActions`,
rendered through `CodeViewer`'s `headerActions` slot; `EditorPaneActions.tsx:40`, `:141`;
`code-viewer/CodeViewerTabs.tsx:103`). The group header belongs to the item's view tabs, and
with a split it sits above only one of the panes it was acting on. Those controls wear the same
header pill as every other control in a strip — a tab's `×`, the icon-tab group's `×` — rather
than the bordered input box they used to be, which read as a form control dropped into a row of
flat tabs; an open menu tints accent the way an active icon tab does, instead of drawing a ring
around the control (`.pane-action`, `styles/theme.css:536`, `:563`, `:587`, `:654`). The
view-mode toggle takes only the accent *colour* on its glyph and word, no wash
(`.pane-action--state`, `styles/theme.css:666`; `EditorPaneActions.tsx:123`): the wash is the
strip's mark for what is chosen, and out at the strip's right edge it outshouted the active file
tab the strip is built to be about — same reasoning as the locked-agent padlock, which reports
state in accent without a fill (`styles/theme.css:601`). **A pane's file tabs follow
VS Code's editor tabs** (`multieditortabscontrol.css`): each carries the Seti file-type icon the
tree uses for the same file, the name in the UI font — not the editor's monospace, which sized
the strip like code — and, only when two open files share a basename, the disambiguating folder
as a muted description beside it (`CodeViewerTabs.tsx:218`, `CodeViewer.styles.ts:62`;
`file-tree/FileTypeIcon.tsx:10`). The strip and its tabs carry the dock text tabs' treatment, so
the file tabs and the agent tabs one panel over read as one row of tabs: the strip is the same
`--bg-chrome-hi` → `--bg-chrome` gradient (`CodeViewer.styles.ts:24`), idle tabs sit in
`--bg-chrome`, and the active tab is a piece of the editor surface pulled into the strip —
`--bg-chrome-active`, the only label at full contrast, and the same accent rule fading at both
ends along its top edge rather than a hard border edge to edge (`.code-tab`,
`styles/theme.css:685`). A tab's `×` is reserved space but shows only on hover and on the active
tab — one per tab, always on, was a row of noise beside the names (`styles/theme.css:609`).
Geometry follows VS Code too — 10px before the icon, the close action in a slot of its own, and
"shrink" sizing (content width, 80px floor) so short names do not make a ragged strip
(`CodeViewer.styles.ts:62`, `:112`). Two numbers deliberately differ, because this pane is a
~330px sidebar and its strip **wraps** where VS Code scrolls one row: tabs are 30px like the
dock's own header strips rather than VS Code's 35px, which would stack to 70px as soon as a
third file opened, and a tab is capped at 220px so one long name cannot push every other tab
onto a row of its own. **That strip is the editor's only header: a group holding nothing but one
editor pane hides its dockview header entirely** (`.dv-tabs-and-actions-container.dv-single-tab`
carrying a `.dock-tab--editor`, `styles/dockview-theme.css:258`; the marker is set for `editor`
and every `editor:N` split in `DockTab.tsx:72`). It was a second 30px strip holding only a glyph
and a `×`, and it pushed the file tabs a row below the agent tabs one column over — the very
alignment the strip's chrome is cut for. What it carried moved into the strip that survives: the
`×` ends `EditorPaneActions`, and double-clicking the strip's own background (not a tab, not a
control) toggles focus mode (`CodeViewerTabs.tsx:29`, `:104`). The guard is `dv-single-tab`, so
an editor tabbed beside another panel keeps the header that is the only way to switch between
them — and there **the
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
`dock-layout-old-layout-migration.test.tsx`). It also **normalizes a restored sidebar
column back to the one-sixth share the default layout builds** — in either direction, so a
column that drifted narrow reopens as wide as a fresh window's, and stale stacked sidebar
columns are pulled in too — before the loader persists repaired snapshots
(`hooks/dock-layout/dock-layout-sanitize.ts:126`, `:155`;
`hooks/dock-layout/dock-layout-loader.ts:100`). One sixth is therefore the sidebar's width
at every app start; a drag holds only for the session. A **collapsed** sidebar is exempt
(size 0 is a state, not a width) and survives the restart.
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
- The **Explorer** view — `ProjectSidebar` (`ProjectSidebar.tsx:38`): a **Workspaces** toolbar carrying the **sort toggle** and nothing else, right-aligned (`sidebarStyles.toolbarActions`), then `FavoritesList` and `WorkspaceList`. The body is a flat list of bordered workspace cards and nothing else — there is no standalone-repository list, no `With agents` / `Repositories` category headers, and no Enable-Workspaces setting; a card spanning one folder *is* the simple case. **One card is open at a time**: each collapses to its name behind a disclosure chevron, and opening another closes the one before it, so the list reads as a column of workspace names until you pick one — `WorkspaceList` owns the single open id and seeds it with the active workspace (`WorkspaceList.tsx:62`, `:66`). Clicking a card's row opens it as well as selecting it; the disclosure alone closes it again, so selecting a workspace never hides what is under it (`WorkspaceCard.tsx:92`, `:119`). **A card leads with a folder glyph, and that glyph *is* its disclosure** — one icon column, not a chevron beside a folder. It swaps to the state's chevron (right when closed, down when open) while the row is hovered or keyboard-focused, so the affordance appears where the eye already is; the swap is pure CSS on `.sidebar-workspace-toggle__folder` / `__chevron` (`theme.css:929`), keyed to `:hover` and `:focus-visible` rather than `:focus-within` so a click does not leave the chevron showing after the pointer has gone. A card's folders keep their own open/closed files state while their card is closed, since that state is keyed by folder and persisted separately. **A card shows where work happens, never who is working: it renders no agent rows and no New-agent button.** Agents are the tabs of the Agent panel (below); the card signals a streaming agent on its own row twice — a pulsing `status-dot` beside the name, and `.sidebar-label-working` on the `repo / name` label, an accent highlight sweeping the text via the `sidebar-sweep` keyframe (`WorkspaceCard.tsx:108`, `:196`, `:206`; `theme.css:1068`, `:1991`). The sweep is text-only (`background-clip: text` over a `currentColor` base, so the label reads normally between passes) and the row never moves or resizes; under `prefers-reduced-motion` it falls back to plain text rather than freezing the highlight mid-label (`theme.css:2157`). **The class goes on each segment of the path, never on the span wrapping them**: everything beneath one `background-clip: text` element is painted from that element's single gradient, so a wrapper flattened the dimmed repo to the row's own contrast and swallowed the `/` (which `opacity` isolates from an ancestor's background). A gradient per segment keeps each one's colour as the sweep's base — the band crosses a dimmed repo dimly and the name at full contrast. `background-attachment: fixed` is what still makes the three read as *one* band: without it each segment sizes its gradient to itself, so the band crosses a short repo faster than a long name and the `/` blinks on its own. Fixed also means the geometry is shared by every working row, so they sweep in step down the column, and the tile is a length (`360px` over `1.8s`) rather than a percentage — `shimmer` stays percentage-based for the chat thinking indicator, which sizes its gradient to itself (`ChatThinkingIndicator.tsx:57`). A folder row says nothing about agents either, and neither the card nor its folders name a branch — branch lives in Source Control. A card header carries exactly one control — a **`⋯`** that opens the worded action menu (`WorkspaceActionsGlyph`, `WorkspaceCard.tsx:214`); double-clicking the name renames the workspace (`WorkspaceCard.tsx:152`). The actions themselves live only in that menu (see above), among them **New Workspace, Same Folders** (`App.tsx:305` names it after an unused Norwegian city, calls `workspace:create`, activates the result and clears the session so the empty agent view greets the fresh checkout) and **Add Folder…** (native picker, attaches the chosen local project to that workspace). A folder row offers removal only while the workspace spans more than one, since the last one leaving would take the workspace with it (`WorkspaceCard.tsx:250`). **Clicking the card enters the workspace** (`App.tsx:364`): when the active agent isn't one of this workspace's, the main view jumps to one that is — two workspaces can span the same folders, so the active project alone can't tell them apart — or to the empty agent view when it has none. Clicking a folder only opens its files and leaves the agent alone (`App.tsx:351`) — it cannot move an agent, which always runs in the workspace's *first* folder whatever the sidebar has selected; favorite jumps follow the same rule (`App.tsx:66`). **Both create actions are words in a bar below that list, not rows in it** — `+ New Repo` then `+ New Workspace` (`sidebarStyles.actions`, `ProjectSidebar.tsx:112`): the list scrolls, the bar does not, so the only way to create a workspace cannot scroll out of reach — the pre-#880 arrangement, restored. They are drawn as controls rather than rows — `--control-height`, text behind a hairline that lights on hover (`.sidebar-new-workspace-button` / `.sidebar-new-repo-button`, `theme.css:1202`) — because a glyph-and-label row was indistinguishable from the workspace rows above it. Only the workspace hairline is accent-tinted; registering a repo is the prerequisite rather than the act, so `+ New Repo` wears the neutral `--control-border` and cedes the accent to the button beside it. **Adding a repository used to be a folder-plus glyph in the top toolbar and is not** — icon-only above a column of folder-looking rows, it read as "new workspace" and doubled the button below, so it moved down here and said what it does in words. Both refuse to shrink below a `120px` basis and wrap to a stack instead (`footerButton`), so a narrowed sidebar never clips `+ New Workspac…`. The accent hairline deliberately stops short of the metal plate (`.btn-metal`) the primary agent CTA owns. A workspace entry in `FavoritesList` still leads with the cards' folder glyph (`WorkspaceGlyph`). Once at least one repository exists, adding a repository and creating a workspace use body-portaled dialog overlays (`AddRepositoryModal`, `NewWorkspaceModal`), leaving the dock and current agent view mounted underneath; only the true first visit with zero repositories uses the full-pane `OnboardingView`. A folder row carries a manual fetch control (`RepoFetchButton`, `WorkspaceRepoRow.tsx:86`) on top of `useBranchStaleness`, which refreshes the active repository's remote-tracking state on activation and window focus, throttled to once every three minutes. **A workspace row carries no favorite star; favoriting lives on its right-click menu** (`WorkspaceCard.tsx:121`, built by `buildWorkspaceContextMenu`, `workspace-context-menu.ts`). A star was not an option rather than merely unwanted: the row's action cluster is `opacity: 0` at rest (`.sidebar-item-actions`, `theme.css:1036`), and opacity on a parent makes a compositing group a child cannot escape, so a star there could never stay lit to *mark* a favorite. Because the menu is the row's only such affordance it carries the whole set — the favorites toggle, then `Rename…`, `New Workspace, Same Folders`, `Add Folder…`, then `Remove Workspace` — omitting any whose handler is absent and collapsing the separators that leaves behind (`tidy`). Each card owns its own menu state (`useContextMenu`), so `Rename…` reuses the inline name draft the row already holds instead of lifting it into `WorkspaceList`. `ContextMenu` itself is shared with the file tree from `components/common/ContextMenu.tsx` and portals to `document.body`, since a `position: fixed` menu inside a dockview panel is otherwise offset by `.dv-render-overlay`'s transform. **Favorites are workspace ids and nothing else** (`settings.favorites: string[]`): every sidebar root is a workspace, and a repo has no root row of its own to star. A favorited workspace still appears in the list below as well as in `FavoritesList` — the section is a stable address with a fixed ⌘1–9 key, while the list below keeps reshuffling by recency in the default sort mode (less of a difference once that list is switched to A–Z, where every row's position is already stable). Every folder row is also the disclosure for its **files** — see below.
- The **Source Control** view — `SourceControl` (`components/git/SourceControl.tsx`, mounted by `SourceControlView`, `dock-panels.tsx:98`): a VS Code-style SCM view of the **active workspace**, one collapsible section per member repo checkout — the repo's name, its checked-out branch, a **⟳ / ✓ action row**, and its uncommitted changes under VS Code's two group headers, **Staged Changes** and **Changes** (`components/git/ScmChangeGroup.tsx`), each with a count and colored M/A/D rows. A file staged and then edited again appears in *both* groups: that is git's own model, which `git:workspace-status` preserves by returning `staged` and `unstaged` separately rather than one merged list. Group headers carry stage-all / unstage-all / discard-all; a row reveals its own +/−/↺ on hover, so a long list stays quiet until you reach for it. Clicking a row is VS Code's SCM click: it opens the file in the editor **diffed against the right base for the half that was clicked** — a staged row against HEAD, an unstaged row against the index. The open request (`file-open-request.ts`) carries source `'sourceControl'` plus the checkout coordinates *and a `staged` flag*, `EditorPanel` (`dock-panels.tsx`) swaps its diff feed from the session's base-branch diff to `useWorkspaceFileDiff` (→ `git:workspace-file-diff`), and `useCodeViewerModes` opens such requests in diff mode. The data comes from one workspace-scoped IPC call, `git:workspace-status` (`git-handlers.ts`), which reads the workspace's own checkout of each repo (worktree, or the clone on a home workspace); the view refreshes on `files:changed`, `workspace:list-changed`, workspace switch, and window focus — the last covers edits made outside the app, which the session-scoped watcher misses. Each section with changes carries VS Code's **message box**: a per-repo commit input (⌘⏎, the Commit button, or the header's ✓ → `git:workspace-commit`). With something staged it commits exactly the index; with nothing staged it raises a `ConfirmDialog` first, since committing everything is a different act from the one a staging UI implies — confirming sends `stageAll`, which runs the same stage-all managed commit the Commit overlay uses. Discard is likewise confirmed: throwing away uncommitted work is unrecoverable, and one dialog hoisted to the panel serves every row and group. The **branch label is a pill button** — a bordered control rather than a caption, because a label nobody reads as clickable is a feature nobody finds (`components/git/BranchSwitcher.tsx`): clicking it opens a VS Code-style quick-pick — filter input, the repo's branches from the existing `git:list-branches` (which already hides branches held by other worktrees), and a "Create new branch" entry when the typed name matches nothing — checking the workspace checkout out via `git:workspace-checkout`; failures (e.g. dirty-tree conflicts) render inline and leave it open. It is a **centered modal**, not a popover anchored to the label: the panel is a narrow sidebar column that cramped the list and clipped long branch names. It reuses `createDialogStyles` + `useAutoFocus` and the Command Palette's keyboard model (↑/↓ move the active row, Enter selects, Escape closes), names its repo in the header since a workspace has several, and is portaled to `document.body` so an ancestor `transform` can't become the containing block for its fixed overlay. It is reached by selecting Source Control in the activity rail, the `view.sidebar.sourceControl` command (⌘⇧G), or the View menu — all of which swap the one sidebar onto this view.
- The **Search** view — `SearchView` inline in the sidebar (`SearchSidebarView`, `dock-panels.tsx:104`), the same body the search modal wraps in overlay chrome.
- `agent` → **Agent** — `AgentPanel` (`components/editor/editor-shell/dock-agent-panel.tsx:86`): renders a draft chat, an `OnboardingView` (no agent yet), an `AgentChatView` (non-interactive chat-mode), or an xterm `TerminalPane` (interactive runtime) depending on session state. **The group's tab bar is where agents live and are managed.** One tab per agent **of the active workspace**, not of the selected folder (`App.tsx` groups them by `workspaceId` and hands `useAgentSiblingDockTabs` that list) — a workspace's agents share its checkout, so hiding one behind a folder click would hide agents that work in the very same place; a **+** in the tab bar (`AgentHeaderActions.tsx:54`, mounted through `LeftHeaderActions` beside the shell's own +, `AppShell.tsx:54`) opens `NewAgentModal` on the active workspace via `onNewAgentFromHeader(workspace.id)` — falling back to whichever workspace holds the active repo when none is focused. It is deliberately *not* a runtime dropdown: the dialog owns the provider and Terminal/Chat choice, so the tab bar offers one affordance and one dialog wherever a new agent is started. At the **far right** of the strip (the right header slot, so it lands top-right of the view like the shell's ×) `AgentCloseHeaderActions` renders a `×` that **hides the active *sibling* agent tab** (`onCloseSiblingPanel`) — the agent stays alive, so selecting it again from the sidebar reopens its tab; it is disabled while the structural primary `agent` tab is active, which cannot be hidden. Both the + and the × fill their `.dv-react-part` wrapper and centre their 24px pill in it (`AgentHeaderActions.tsx:14`), because dockview's wrapper is block-level and would otherwise leave the control 6px high in the 30px strip. **Per-agent settings, lock and delete live on each tab itself, not in the header** (`DockTab.tsx`): a tab reveals a ⚙, a 🔒 and a 🗑 on hover/focus. ⚙ opens `AgentSettingsModal` for *that* agent (rename, runtime, chat↔terminal — saving a runtime/view change first asks for confirmation, then retires the old session and starts a new one on the same branch, worktree, files, and workspace roots; name-only changes do not replace the session). 🔒 toggles the agent's **deletion lock** through `onToggleLocked` → `agent:set-locked`, guarding a long-lived agent from an accidental click on 🗑. It sits immediately left of the 🗑 it guards and, unlike its neighbours, **stays visible while locked** (`.dock-tab__action.is-locked`, accent-colored) — a lock reports state rather than offering an action, so which agents are protected reads without hovering every tab; the 🗑 is `disabled` alongside it, dimmed only on hover so an unhovered tab keeps its quiet resting state. 🗑 routes to the delete-confirm dialog via `onRequestDeleteAgent`, **actually deleting the agent** (distinct from the header ×, which only hides the tab). `requestDeleteAgent` (`hooks/app/useAppOverlays.ts:79`) is the single chokepoint every delete entry point funnels through and returns early for a locked session, so the lock also holds for the Delete Agent command and the New Agent view's reusable-sessions card; the main process refuses too. Hiding a sibling is tracked in a module-level dismissed set (`hooks/agent-session/dismissed-agent-tabs.ts`) so the auto-tab reconciler (`useAgentSiblingDockTabs`) — which re-runs on every dock change — doesn't immediately recreate the hidden tab; reopening (select, or `openSiblingPanel`) clears the mark. **The form asks only what the workspace doesn't already answer.** Starting an agent is
  workspace-scoped end to end: `onLaunchWorkspaceAgent(workspaceId, { runtimeId, displayName,
  nonInteractive })` is the *only* launch path the dock has (`dock-panel-types.ts`), and the
  workspace decides the folders, the checkout and the branch. So the form has **no branch or PR
  picker, no worktree choice, no dirty-tree confirmation and no "another agent is working here"
  warning** — several agents sharing one checkout is the point of a workspace, not a collision to
  guard against. It doesn't even ask for a name: an agent takes the first free slot among the
  names its workspace is already using — `Claude`, then `Claude 2` (`nextAgentName`,
  `agent-labels.ts:33`, called from `useNewAgentForm.tsx:88`). The name is only a **label** — it
  travels as `displayName` and titles the agent's tab (`session-creator.ts`); it cuts no branch.

  **Two rules there exist to stop agents sharing a tab label.** *Check the names, don't count
  the agents*: numbering from a count of same-runtime sessions handed out a name still in use
  as soon as one was deleted from the middle of the run (delete `Claude 2` of three and the
  count falls back to 2, naming the next agent `Claude 3` beside the original), and a rename
  broke it the same way — the agent still counted but had let go of the name. `nextAgentName`
  scans every sibling's `displayName`, whatever its runtime, since names are what collide.
  *And name the first agent too*: a blank name is left undefined downstream
  (`session-creator.ts:190`) and an unnamed session falls back to its **branch** label
  (`DockTab.tsx:93`) — which every agent in a workspace shares, so the first Claude agent and
  the first Codex agent used to show identical tabs. Note the label comes from `runtimeLabel`
  (`Claude`), not the runtime's own `name` (`Claude Code`), matching the rest of the UI and
  keeping tabs narrow.

  **A provider list, one hook.** The state and the launch live in `useNewAgentForm`
  (`modals/useNewAgentForm.tsx:45`); its `launch(runtimeId, mode)` takes the provider and mode
  from the clicked row rather than a single stored selection, and `pending` marks the one row
  that is starting. Two presentations render the shared `AgentLaunchList`
  (`modals/AgentLaunchList.tsx:81`): the full-panel **hero** (`modals/NewAgentHero.tsx`) for a
  workspace with no agent yet — the provider list over the workspace's finished agents, to
  resume — and the compact `NewAgentModal` (⌘N, or the agent tab bar's + — no sidebar button
  opens it), which wraps the same list narrower in `NewAgentForm`. Only the hero carries a
  masthead — the `ManifoldWordmark` ghost over its gold rule, then a display-serif *New agent for
  &lt;workspace&gt;* naming the workspace the agent joins (`NewAgentHero.tsx:22`,
  `NewAgentHero.styles.ts`) — because the dialog already has a titled header; `OnboardingView`
  supplies the starfield backdrop behind both.

  **The list is the runtime picker.** One row per runtime — the agent's brand mark on the left,
  the name on the right — and clicking it starts that provider in a **terminal** on the spot. A
  final **Chat with interface** row opens an indented provider picker instead, and choosing a
  provider there starts a **chat** (`nonInteractive`) agent. The marks are inline paths in
  `new-task/RuntimeGlyph.tsx` — simple-icons (CC0-1.0) for Claude, Copilot and Gemini, the
  OpenAI logomark for Codex, which simple-icons does not carry — drawn in `currentColor`; the
  Ollama variants reuse the mark of the agent they launch, and a runtime with no mark falls back
  to an initial. A `needsModel` (Ollama) variant of a runtime already shown stays out of the
  list — having Ollama installed would otherwise double every row — and a runtime whose binary
  is missing shows disabled with a "not installed" note. **One row leads.** The remembered
  `defaultRuntime` — or the first *installed* provider when it names one that isn't, so the plate
  never advertises a dead default — is passed down as `leadRuntimeId` and wears the gold
  `.btn-metal` plate; every other row is a dark console plate
  (`AgentLaunchList.styles.ts:rowPlate`). Both wear the same `--chamfer` silhouette, so the list
  reads as one cut of material with an obvious default rather than a wall of equals. The lead
  row's surface comes entirely from the class: an inline `background`/`color` would outrank it,
  which is why `row` holds geometry only. Both the provider and the Terminal/Chat
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

The list has **two orders, chosen by a toolbar toggle** (`sidebar-sort.ts`): `recency`, the
default described below, and `alpha`. `ProjectSidebar` owns the mode and renders the button —
its glyph shows the mode you are *in*, while the accessible name says what a click does, so the
state is readable without opening anything (`ProjectSidebar.tsx:62`, `SortModeGlyph` in
`SidebarCardActionGlyphs.tsx:107`). `WorkspaceList` takes it as a required prop and dispatches
through `sortWorkspaces` (`WorkspaceList.tsx:107`). The choice persists at
`manifold.sidebar.sort.v1`, and a storage failure costs only the restore, not the toggle
(`sidebar-sort.ts:31`).

**A–Z sorts on repo, then the workspace's own name**, keyed off the same `workspaceRowLabel` the
row renders with, so the order can never disagree with what is on screen — `apex / zed`,
`kong / dune`, `kong`, `kong / moss`. A repo's worktrees therefore stay together, and a home
workspace, having no dimmed prefix, sorts among them under its own name. **Nothing is pinned in
A–Z:** the mode exists to make a name's position predictable, which a row floating to the top on
entry would undo (`sidebar-sort.ts:53`). The sticky active-card header below is unaffected — it
is scoped to the card, so it still holds the active row in view while that card's own content
scrolls, wherever the card sits.

In `recency` the **selected workspace is pinned first**, so where you are working is always the top row —
the one place you can find it without reading the list (`sortByRecency`,
`sidebar-recency.ts:68`; `WorkspaceList.tsx:107`). It then **sticks** there while its own
folders and files scroll under it, so going deep into a tree never costs you the label saying
where you are; it needs an explicit background, since a row is transparent until hovered and
the rows passing beneath would read straight through it
(`.sidebar-workspace-card.sidebar-project-group--active > .sidebar-project-row`,
`styles/theme.css:870`). Sticky is scoped to the card, so the header releases once you scroll
past the active workspace's own content into the ones below.

Below the pinned row that mode's list is a most-recently-used stack, so **the workspace you just left
is the second row** and going back is always one predictable click. The visit is recorded from
whichever workspace ended up *active* rather than from the click that asked for it — opening a
folder inside another workspace, or a session restored at launch, moves you just as a click on
the row does, and all of them have to leave the same trail (`WorkspaceList.tsx:74`,
`sidebar-recency.ts:48`). Only the row you moved to and the one you left change places: every
other row keeps the order it was already in, because their timestamps don't move and the sort
is stable.

Several folders showing at once is possible because **the main process authorizes file paths
against the workspace roots** — every registered repo plus every session's worktree — not
against the selected session, and reads and creates need no session at all (`main/ipc/file-handlers.ts:26`,
`:46`, `:53`). A file in any open folder therefore opens, saves and renames like any other; the
renderer no longer pre-filters reads by the active session's roots. Only the folder the
*selected* agent works in is a live, watched tree with change badges (`useFileWatcher`); every
other folder is fetched on demand through `files:tree` / `files:tree-by-project` and cached per
root, so reopening one paints in the same frame instead of flashing empty
(`hooks/editor/useWorkspaceTree.ts:18`, `FolderFilesTree.tsx:36`). Unwatched is not unchanging,
though — an agent in another workspace, or the user in a terminal, moves those files too — so a
fetched folder reloads itself when an event **names its own root** (`rootPath` on
`files:tree-changed`, `source` on the add-dir `files:changed`) and on window focus, the only
signal left for a folder no agent is working in (`useWorkspaceTree.ts:107`, `:111`, `:116`;
[fs](fs.md)). Reloading keeps the folder's expanded paths, so a refresh never collapses what the
user opened (`useWorkspaceTree.ts:74`). Which folder is watched, is a
question about **paths, not session ids**: a workspace owns the checkout its agents share, so the
watched folder appears in the sidebar as an ordinary repo row with no session id of its own —
the row is live when its checkout path (`worktreePaths[projectId]`, or the clone on a home
workspace) is the watched root (`FolderFilesTree.tsx:28`, `:42`). Keying liveness on the session
id instead left every sidebar row on the fetched path, and no file anywhere carried a change
badge (regression tests `FolderFilesTree.test.tsx:136`, `:156`). The live row renders that one
root and not the session's add-dirs: the workspace's other folders each have a row of their own,
and passing them here repeats them under this one (`FolderFilesTree.tsx:57`). Folder trees render without
the filter/refresh strip and without a row for their own root — the sidebar row above already
names the folder, and one strip per open folder would stack up (`FolderFilesTree.tsx:39`;
`flattenRoots`, `file-tree/file-tree-visible.ts:44`). A flattened root has no row, so anything
a row would host has to be rendered by the tree instead: the pending "New File"/"New Folder"
input lives in `TreeChildren`, which an expanded directory and the flattened root both render
(`file-tree/tree-node.tsx:53`, `FileTree.tsx:230`). Hanging it off the root's own `TreeNode`
left a create at top level with nowhere to draw — the menu item looked dead
(regression test `FileTree.test.tsx:88`). Depth is carried by indentation alone —
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
clean in the worktree) renders a faint `○` with a plain name (`tree-node-row.tsx:77`, `:169`).
**Folders roll their contents up**: `buildChangeMaps` credits each change to every directory
between it and its root, so a collapsed folder carries a dot — vivid when something inside is
dirty, faint when its contents only differ vs the base branch — with the count in its tooltip
(`file-tree-changes.ts:33`, `tree-node-row.tsx:183`). Never a letter: a directory is not itself
added or modified, it only says *look in here*, which is what makes a change findable without
opening every folder on the way down (`FileTree.test.tsx:176`).
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
