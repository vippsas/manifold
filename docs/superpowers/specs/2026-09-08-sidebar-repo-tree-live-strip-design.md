# Workspaces sidebar: repo tree with a live strip

**Date:** 2026-09-08
**Status:** Approved
**Issues:** #939 (grouping/ordering model), #940 (repo-parent tree, multi-repo glyph), #902
(multi-open, persisted expansion — resolved as a by-product)
**Mockup:** [`2026-09-08-sidebar-repo-tree-live-strip-mockup.html`](2026-09-08-sidebar-repo-tree-live-strip-mockup.html)
(proposal C; rendered with the Manifold Dark tokens and the live data of one heavy user).
The mockup draws the home workspace as a `main` child under a repo header; decision 2 below
supersedes that — the home workspace *is* the parent row — everything else in it stands.

## Problem

The sidebar lists every workspace as one top-level row in a single flat list
(`src/renderer/components/sidebar/WorkspaceList.tsx:99-133`). A home workspace (the repo's own
clone, folder glyph) and every worktree workspace cut off it (branch glyph) are peers, ordered
globally by last-touched time or A–Z (`sidebar-sort.ts:68-76`). At 33 repos and 70 workspaces
this produces four distinct failures:

1. **A repo's family scatters.** In recency mode only the active row is pinned
   (`sidebar-recency.ts:68-78`); the same repo's other checkouts land wherever their own
   timestamps put them.
2. **The repo prefix repeats on every row** (`kong / moss`, `agent-labels.ts:77-93`). It spends
   the width the sidebar has on the part that is the same, and truncates the part that differs.
3. **Nothing says what is alive.** The only liveness signal is a pulsing dot on rows that
   currently emit output (`WorkspaceCard.tsx:108`). `AgentSession.status` — `running`,
   `waiting`, `done`, `error` (`src/shared/types.ts:15`) — reaches the sidebar via
   `sessionsByWorkspace` (`ProjectSidebar.tsx:20`) and is ignored. An agent *waiting for the
   user* is invisible until scrolled to.
4. **One list holds three populations:** repos merely registered (20 home-only rows), the work
   in progress, and a graveyard of finished pipeline worktrees (one repo alone has 17 rows, 14 of
   them merged).

## What the sidebar lists

Every row is a `Workspace` (`src/shared/workspace-types.ts:11-27`): `projectIds[0]` is the
primary repo, `worktreePaths` present marks a worktree workspace (`isWorktreeWorkspace`,
`:31-33`), `branchName` is the branch every checkout in it sits on. Agents are not rows; they are
tabs of the Agent panel for the selected workspace. Favorites are a separate ordered id list in
settings, rendered by `FavoritesList.tsx` above the list.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Grouping key | `projectIds[0]`, in **both** sort modes. Multi-repo workspaces appear once, under their primary repo (#939). |
| 2 | What is the parent row? | **The repo's home workspace.** Its row keeps today's glyph, label, click-to-select, menu and rename; its disclosure now folds everything under the repo: its own folder rows and drafts, then the worktree workspaces. A repo with only a home workspace is therefore one row, exactly as today — the tree appears only where branches exist. |
| 3 | Repo with worktrees but no home workspace | A synthetic parent row: folder glyph, repo name, muted, count, disclosure only. Not selectable, no menu. (Real case: a repo whose home workspace was removed while its branches remain.) |
| 4 | Order of groups | Recency mode: the active workspace's group first, then groups by the max recency of their members. Alpha mode: by repo name. The existing toggle and its persistence stay (`sidebar-sort.ts`). |
| 5 | Order inside a group | Folder rows and drafts of the home card first (unchanged), then worktree workspaces by recency (recency mode) or A–Z (alpha mode), then the merged fold. |
| 6 | Fold state | Per workspace id, any number open at once, persisted in `localStorage` — the pattern of `folder-disclosure.ts`. Activating a workspace opens its repo group (the way an editor reveals a file). Replaces the single in-memory `expandedId` (`WorkspaceList.tsx:66`), which closes #902. |
| 7 | Prefix on child rows | Dropped: the parent says the repo once. Child rows are indented one level with a 1px indent guide (`--tree-indent-guide`). |
| 8 | Multi-repo workspaces | New `multi` variant of `WorkspaceGlyph` (two linked frames) whenever `projectIds.length > 1`, on home and worktree alike. Label = the workspace's own name; the extra repos become a muted right-aligned sub-label: the repo's name when there is exactly one extra (`+1 vce-cli`), `+N` otherwise. Rename already exists (double-click, menu) — nothing to build. |
| 9 | "Working now" strip | A section between Favorites and the tree listing every workspace with at least one session in status `running` or `waiting`. Rows keep the `repo / name` label (the strip is flat) and end in a status dot: amber if any session is waiting, else turquoise. Waiting rows sort first, then running by recency. Click selects the workspace. Collapsible (`useSidebarSectionState`, new key `working`), hidden when empty like Favorites. No row cap: when many agents run, this is the list you want. |
| 10 | Row dots become status-coloured | The per-row dot and the collapsed parent's dots reflect status, not bytes: turquoise running, amber waiting, ruby error; `done` shows nothing. The label sweep (`sidebar-label-working`) keeps its output-based trigger — it says "typing right now", the dot says "state". |
| 11 | Merged worktrees fold away | Worktree workspaces whose branch the verdict store records as merged collapse into one muted row per group — `14 merged · show` — placed last in the group. Click reveals them in place for this launch (in-memory toggle, default folded). A merged workspace with a running or waiting session is never folded. Cleanup stays the existing per-row **Remove Workspace**; a bulk action is a follow-up, not v1. |
| 12 | Source of "merged" | `VerdictRecord.outcome === 'merged'` only (`src/shared/verdict-types.ts:1-6`). The recorder gates that outcome on real activity (`verdict-recorder.ts:253-262`), so an empty branch that is trivially an ancestor of its base — the phantom-merged trap — never folds a live workspace. Match: `record.projectId === workspace.projectIds[0] && record.branch === workspace.branchName`. |
| 13 | Filter | A search icon in the toolbar (`ProjectSidebar.tsx:74`) toggles a filter field under the toolbar. Case-insensitive substring over repo name, workspace name and `branchName`. While non-empty, Favorites and Working now hide, every group with a hit renders open showing only its hits (merged hits shown inline, muted), and the merged fold is bypassed. `Esc` clears and closes; blur on an empty field closes. No global shortcut in v1. |
| 14 | Section ceiling | Three sections: Favorites, Working now, Repositories. Nothing else goes above the tree. The tree header reuses the dead `repositories` section key (`sidebar-section-state.ts:5`); the unused `withAgents` key is removed. |
| 15 | Favorites | Unchanged (hand-ordered, ⌘1–9). Its rows adopt the `multi` glyph where it applies. |
| 16 | Empty state | Unchanged: "No repositories yet". |

## Design

### Grouping model — `sidebar-groups.ts` (new, pure)

```ts
export interface RepoGroup {
  /** projectIds[0] of every member. */
  projectId: string
  /** The repo's name for the synthetic header; the home card supplies its own. */
  repoName: string
  home: Workspace | null
  /** Worktree workspaces in display order, merged ones excluded. */
  worktrees: Workspace[]
  /** Merged worktree workspaces, in the same order; rendered behind the fold. */
  merged: Workspace[]
}

export function groupWorkspaces(
  workspaces: readonly Workspace[],
  projects: readonly Project[],
  ctx: {
    mode: SidebarSortMode
    recency: ProjectRecency
    activeId: string | null
    mergedIds: ReadonlySet<string>
    liveIds: ReadonlySet<string>   // workspaces with a running|waiting session
  },
): RepoGroup[]
```

- Members are bucketed by `projectIds[0]`. A workspace whose primary project is unknown (not
  in `projects`) forms a group named after the workspace itself, so nothing disappears.
- Group order: `activeId`'s group first in recency mode, then `max(recency[member])` descending;
  alpha mode uses `repoName.localeCompare(..., { sensitivity: 'base' })`. Ties keep incoming
  order (the sort is stable).
- Within a group: `sortWorkspaces` on the worktree members with the mode's existing comparator,
  so a repo's branches order exactly as the flat list did. `merged` = members in `mergedIds` and
  not in `liveIds`.
- `sortByRecency`/`sortAlphabetically` stay where they are; this module composes them. The
  active-pin inside `sortByRecency` becomes irrelevant (the group pin subsumes it) but is left
  untouched so the function's own tests hold.

### Fold state — `sidebar-fold-state.ts` (new)

Same shape as `folder-disclosure.ts`: one shared `Set<string>` behind listeners so every mounted
copy agrees, `localStorage` key `manifold.sidebar.openWorkspaces.v1`, in-memory fallback when
storage is unusable. Keys are `workspace:<id>` for a card (home or worktree) and
`repo:<projectId>` for a synthetic header. `useWorkspaceFolds(): { isOpen, toggle, open }`.
`open` is what activation calls: `WorkspaceList`'s existing `useEffect` on `activeWorkspaceId`
(`WorkspaceList.tsx:74-76`) opens the active workspace's group key alongside touching recency.

### Rendering

`WorkspaceList` maps `groupWorkspaces(...)` to a new `RepoGroup.tsx`:

- **Home card** — today's `WorkspaceCard`, `expanded` now read from the fold store. While open it
  renders its folder rows and drafts (unchanged, `WorkspaceCard.tsx:238-263`), then its group's
  worktree cards, then the merged fold. Closed, it appends a count (`8`) and the group's live dots
  after the label (`.sidebar-group-count`, `--text-muted`, caption size).
- **Synthetic header** — `RepoGroupHeader`, a `.sidebar-item-row` with the folder glyph in
  `--text-muted`, the repo name, count and dots, disclosure on the whole row. No `role="button"`
  select semantics; `aria-expanded` only.
- **Worktree card** — `WorkspaceCard` with a new `nested` prop: 14px extra left padding, the
  indent guide drawn by a `.sidebar-item-row--nested::before`, and `label.repo` suppressed
  (the `+N` sub-label still renders). Its own disclosure keeps opening its folder rows, from the
  same fold store.
- **Merged fold** — `MergedFold`, one muted row: `N merged · show` / `· hide`, caption size,
  `--text-muted`, the count in accent at 45%. Revealed rows are ordinary nested cards in
  `--text-muted`.

`WorkspaceCard.tsx` is at 285 lines. The label block (`:181-222`) moves to
`WorkspaceRowLabel.tsx` (repo, separator, name, sub-label, status dot) before anything is added,
keeping both files under the 300-line ceiling.

### Glyph

`WorkspaceGlyph` gains `kind: 'home' | 'worktree' | 'multi'` derived by a new
`workspaceGlyphKind(workspace)` in `workspace-types.ts` (`multi` wins over the others). The
`worktree` boolean prop is removed and its two callers (`WorkspaceCard`, `FavoritesList` via
`ResolvedFavorite`) updated; `ResolvedFavorite.worktree` becomes `kind`.

### Working now — `WorkingNowList.tsx` (new)

Props: `workspaces`, `projects`, `sessionsByWorkspace`, `recency`, `onSelectWorkspace`. Derives
`live = workspaces.filter(w => sessions(w).some(s => s.status === 'running' || s.status === 'waiting'))`,
sorts waiting-first then by recency, renders `SidebarSectionHeader` + one `.sidebar-item-row`
per workspace using `WorkspaceRowLabel` with the prefix kept. Returns `null` when `live` is empty.

### Status dots

`statusDotFor(sessions): 'waiting' | 'running' | 'error' | null` (waiting > running > error;
`done` → null) in `agent-labels.ts`. The dot element gets `status-dot--waiting|running|error`
classes mapped to `--status-waiting|running|error` in `theme.css`; `core-pulse` applies to
running and waiting. Collapsed parents render one dot per distinct status present in the group,
6px, in the same order.

### Merged ids — one new IPC

Main: `workspace:list-merged` in `src/main/ipc/workspace-handlers.ts` returns `string[]` of
workspace ids, computed from `workspaceManager.list()` × `verdictStore.listAll()` with the
decision-12 match. Added to the preload invoke allowlist (`src/preload/index.ts`). The renderer
hook `useMergedWorkspaces(workspaces, sessionsByWorkspace)` fetches on mount and whenever the
workspace id set or the session id set changes — verdicts finalize on session termination, so
that is when an answer can change. A merge found later by the background PR reconcile shows on
the next such change or relaunch; the fold is tidiness, not truth, so that lag is acceptable.

### Filter — `SidebarFilterField.tsx` + `filterGroups` in `sidebar-groups.ts`

`ProjectSidebar` owns `filter: string | null` (`null` = closed). The toolbar gets a second
24×24 button with a search glyph (`SidebarCardActionGlyphs.tsx`), `aria-pressed` when open,
placed before the sort button. `filterGroups(groups, query, projects)` keeps a group when its
repo name or any member's name or `branchName` contains the query; members are trimmed to hits
(a matching repo name keeps all members); `merged` hits move into `worktrees` flagged muted.
`WorkspaceList` renders filtered groups forced open, ignoring the fold store; `FavoritesList`
and `WorkingNowList` are not rendered while `filter` is non-empty.

### Styles

- `theme.css`: `.sidebar-item-row--nested` (padding-left +14px, `::before` 1px guide at the
  glyph column using `--tree-indent-guide`), `.sidebar-group-count`, `.sidebar-merged-fold`,
  the three status-dot colour classes. Tokens only; no theme-conditional rules.
- `ProjectSidebar.styles.ts`: `filterField` (26px, `--control-bg`, `--control-border`,
  `--radius-sm`, caption text in `--text-muted`), reusing `toolbarButton` for the search button.

### Removed

- `expandedId`/`toggleExpanded` and the single-open comment in `WorkspaceList.tsx:64-81`.
- `SidebarSectionKey` `'withAgents'` and its read loop entry (`sidebar-section-state.ts:5,21`).
- `WorkspaceGlyph`'s `worktree` prop (replaced by `kind`).

## Error handling

- Storage failures in the fold store fall back to memory, as in `folder-disclosure.ts`.
- `workspace:list-merged` failing (IPC rejects) resolves to an empty set: nothing folds, the
  list is merely longer. Logged once at `warn`.
- A verdict whose `projectId` no longer resolves is ignored by the join.
- A filter that matches nothing renders one muted row "No matches" in place of the tree.

## Testing

Unit (vitest, jsdom, following `sidebar-sort.test.ts` / `sidebar-recency.test.ts`):

- `sidebar-groups.test.ts` — grouping by primary; active group pinned in recency, not in alpha;
  group recency = max of members; within-group order matches `sortWorkspaces`; merged excluded
  from `worktrees` unless live; unknown primary forms its own group; `filterGroups` trims
  members, keeps whole group on repo-name hit, bypasses merged.
- `sidebar-fold-state.test.ts` — many open at once, persists, `open` idempotent, storage failure
  keeps toggles working, two hook instances stay in sync.
- `agent-labels.test.ts` — `statusDotFor` precedence; sub-label `+1 <name>` vs `+N`.
- `WorkspaceGlyph.test.tsx` — `kind` from `workspaceGlyphKind`, `data-glyph` attribute per kind.
- `WorkingNowList.test.tsx` — empty → null; waiting sorts first; amber vs turquoise dot; click
  selects.
- `RepoGroup.test.tsx` — home card folds its worktrees; synthetic header for a home-less repo;
  collapsed count and dots; merged fold reveals; nested rows drop the prefix.
- `WorkspaceList.test.tsx` — activation opens the group; filter forces groups open and hides
  Favorites/Working now.
- `workspace-handlers.test.ts` (main, new file) — `workspace:list-merged` joins on primary project +
  branch and returns only `outcome === 'merged'`.

Visual: `npm run screenshot:component ProjectSidebar --theme manifold-dark` with a fixture
carrying a home-with-branches group, a home-less group, a multi-repo workspace, a waiting and a
running agent, and a merged fold — compared against the mockup before claiming done, per the
CLAUDE.md renderer rule. Then `npm run drive:app` on the built app to confirm fold state
survives a relaunch.

## Docs

Same PR: `docs/architecture/renderer.md` (sidebar model: parent = home workspace, fold store,
Working now, merged fold, filter; replace the "list is flat" claim at `:103`), and
`docs/architecture/ipc.md` for `workspace:list-merged`. Bump `updated:` on both. Close #902 in
the PR body; #939/#940 close on merge.

## Scope

**In:** everything above. **Out (follow-ups, each its own issue):** bulk "Remove merged
workspaces" action on the fold; a keyboard shortcut for the filter; a per-agent (not per
workspace) row in Working now; auto-collapsing groups untouched for N days.
