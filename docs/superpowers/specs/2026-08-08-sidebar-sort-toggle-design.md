# Sidebar sort toggle: alphabetical or last used

**Date:** 2026-08-08
**Status:** Approved
**Issue:** #867 (sort half only; see [Scope](#scope))

## Problem

The sidebar's workspace list has exactly one ordering and no way to change it. `WorkspaceList`
calls `sortByRecency` unconditionally (`src/renderer/components/sidebar/WorkspaceList.tsx:103`):
the active workspace is pinned first, then the rest by last-accessed, from a `localStorage` map
of timestamps (`sidebar-recency.ts:68`).

That ordering is good for "where was I working" and bad for "where is `kong-gateway`" — a row's
position depends on history you cannot see, so finding a known name means reading the whole list.
With several worktrees per repo the list is long enough for that to cost something.

## What the sidebar actually lists

Top-level rows are **workspaces**, not repos. A workspace is a checkout: a *home* workspace is the
repos' own clones, every other one is a worktree on its own branch
(`src/shared/workspace-types.ts:10`). So the one list already contains both "repos" and
"worktrees" in the user's sense, and most workspaces span a single repo.

A row renders as `kong / moss` — a dimmed repo prefix plus the workspace's own name — via
`workspaceRowLabel` (`agent-labels.ts:47`). A home workspace shows just `kong`, since repeating the
repo name adds nothing.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | What does "last activity" mean? | Last time you were *in* it — the existing `useProjectRecency` timestamp. Not agent output, not commit time; neither is persisted today and both need a new main-process data path. |
| 2 | What does the button reorder? | The workspace list only. |
| 3 | Repo rows inside an expanded card? | No. Their order is meaningful — `projectIds[0]` is the primary repo every agent runs in (`WorkspaceCard.tsx:239`), so it is not a display choice. |
| 4 | Favorites? | No. Hand-ordered and drag-reorderable, with ⌘1–9 bound to position (`FavoritesList.tsx:25`); re-sorting would fight the drag handles and silently remap the shortcuts. |
| 5 | Active-workspace pin in alphabetical mode? | No pin. Strict A→Z. A row that jumps to the top on entry destroys the predictable positions the mode exists to provide; the active row still reads as active from `sidebar-item-row--active`. Recency mode keeps its pin unchanged. |
| 6 | Button or menu? | Toggle button. Two modes; a toggle shows its state without being opened. It becomes a menu if a third mode ever lands. |
| 7 | Alphabetical sorts on what? | Repo, then name. Groups a repo's worktrees together, which is the point with several per repo, and makes the dimmed prefix meaningful rather than decorative. |
| 8 | Default mode? | `recency` — today's behavior, so nothing moves for anyone who never touches the button. |

## Design

### Sorting logic

New module `src/renderer/components/sidebar/sidebar-sort.ts`. It is separate from
`sidebar-recency.ts` so that file stays about recency alone, and so both stay well under the
300-line ceiling.

```ts
export type SidebarSortMode = 'recency' | 'alpha'

/** localStorage-backed, key `manifold.sidebar.sort.v1`, default 'recency'.
 *  Read/write/fallback shape follows useSidebarSectionState. */
export function useSidebarSortMode(): [SidebarSortMode, () => void]

/** 'recency' -> sortByRecency (active pinned, unchanged).
 *  'alpha'   -> sortAlphabetically (no pin). */
export function sortWorkspaces(
  workspaces: readonly Workspace[],
  mode: SidebarSortMode,
  context: { recency: ProjectRecency; activeId: string | null; projects: Project[] },
): Workspace[]
```

`sortAlphabetically` derives its key from `workspaceRowLabel(workspace, projects)` — the same
function that renders the row, so the order can never disagree with what is on screen:

- Primary key: `label.repo ?? label.name`. A home workspace has no dimmed prefix, so its own name
  *is* its repo group, which sorts it alongside its worktrees.
- Tiebreak: `label.name`.
- Both compared with `localeCompare` at `sensitivity: 'base'`, so `Kong` and `kong` do not split.

Persistence failures are swallowed the way `sidebar-section-state.ts:37` swallows them: the
in-memory toggle keeps working, only the restore across launch is lost.

### Wiring

`ProjectSidebar` owns the mode via `useSidebarSortMode`, renders the button in its toolbar
(`ProjectSidebar.tsx:63`), and passes `sortMode` down to `WorkspaceList` as one prop.
`WorkspaceList` swaps its `sortByRecency(...)` call at line 103 for `sortWorkspaces(...)` and goes
on owning recency as it does today.

State lives where the button lives; one prop reaches where the list is. No context, no new store.

### The button

A 24px `sidebar-toolbar-button` using a new `SortModeGlyph({ mode })` in
`SidebarCardActionGlyphs.tsx` — an A–Z glyph for `alpha`, a clock for `recency`. The glyph shows
the mode you are **in**, not the one you would switch to.

Both toolbar buttons get wrapped in a `toolbarActions` flex group carrying `marginLeft: 'auto'`, so
Add stays right-pinned and Sort sits beside it. `toolbarButtonPrimary` is left untouched — its own
`marginLeft: 'auto'` is inert inside a content-sized group, so nothing else has to move.

Label and tooltip state the mode *and* the action: `"Sorted A–Z — click to sort by recently used"`.
No `aria-pressed`: this is a two-state mode, not an on/off, and the accessible name carries the
state.

## Testing

`sidebar-sort.test.ts`, against the comparator directly:

- Repo-then-name grouping: `apex/zed`, `kong/dune`, `kong/moss`.
- A home workspace groups under its own name, among that repo's worktrees.
- Case-insensitivity: `Kong` and `kong` do not split into two groups.
- Alphabetical does **not** pin the active workspace.
- Recency delegates to `sortByRecency` and still pins the active workspace.

A sidebar-level test: clicking the toggle flips the rendered row order, writes the mode to
`localStorage`, and restores it on remount.

Per CLAUDE.md §4, "done" includes seeing it — the sidebar gets captured under a real theme before
this is called complete.

## Scope

Not in scope, and #867 stays open until the implementing PR merges:

- **Per-repo expand/collapse of agent rows.** Obsolete as specified. #867 was written against
  `ProjectList.tsx`, deleted in `77ec0b10` (#880). There is no "With agents" section and no
  mini-status-dot rows; agents are not sidebar rows at all, but tabs of the Agent panel
  (`WorkspaceCard.tsx:48`). Nothing remains to expand into.
- **Sticky multi-expand of workspace cards.** A real, unmet gap in smaller form — cards expand one
  at a time and the state is not persisted (`expandedId` is plain `useState`,
  `WorkspaceList.tsx:66`) — but about workspaces and their repo rows, not agents. Deserves a fresh
  issue against the current sidebar.
- **A settings-menu surface for the sort mode.** #867 requires one; decision 6 deliberately
  diverges. Revisit when a third sort mode makes a menu earn its place.
