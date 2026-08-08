# Favorites for workspaces (restored after the workspaces merge)

**Date:** 2026-08-08
**Status:** Approved

## Problem

Before `77ec0b10` ("Workspaces own the checkout", #880) you could mark a sidebar root as a
favorite and jump to it with ⌘1–9. That is gone.

Nothing was designed away — the merge deleted exactly one file,
`src/renderer/components/sidebar/FavoriteStarButton.tsx`, which was the only UI that could
*set* a favorite. Everything downstream of it survived intact:

- `src/renderer/hooks/project/useFavorites.ts` — persists `settings.favorites`, prunes refs
  that no longer resolve, reorders.
- `src/renderer/components/sidebar/FavoritesList.tsx` — the pinned section, drag-to-reorder,
  ⌘1–9 badges.
- `src/renderer/components/editor/editor-shell/dock-panel-types.ts:140` — `isFavorite` /
  `onToggleFavorite` on `DockStateContext`, wired in `App.tsx:428`.
- `src/shared/commands/catalog.ts:44` — the nine `navigation.favorite.N` commands.

So `settings.favorites` can never grow, `FavoritesList` returns `null` on the empty list, and
the section is invisible. It is a severed nerve, not a missing limb.

## What changed underneath

The merge redefined the vocabulary, which is why this is not a straight revert.

Every sidebar root is now a **workspace**, and a workspace *is* a checkout: a *home* workspace
is the repos' own clones, every other one is a worktree on its own branch
(`src/shared/workspace-types.ts:10`). Repos no longer exist as roots — they appear only as
nested folder rows inside an expanded card (`WorkspaceRepoRow`).

Two consequences:

1. "Favorite a worktree" and "favorite a workspace" are now the same act.
2. The old `'repo'` favorite kind points at something with no row of its own. Its activation
   path is already dead: `activateFavorite` still calls `setActiveWorkspaceId(null)` for a repo
   favorite (`App.tsx:70`), a state the rebuilt sidebar cannot render.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | What can be favorited? | **Workspace rows only.** A workspace over one repo is the ordinary "just a repo" case, so nothing is lost. Keeps ⌘1–9 unambiguous: one favorite, one destination. Existing repo favorites are migrated, not dropped — see Design §1. |
| 2 | Does a favorite still appear in the list below? | **Yes — mirror.** The rail at the top is a stable *address*; the list below keeps reshuffling by recency (`sidebar-recency.ts:66`). Duplication is the price of one of them holding still. Touches none of #894's sticky/MRU logic. |
| 3 | How do you toggle it? | **Right-click context menu. No star on the row.** The row keeps exactly its current anatomy. |
| 4 | What is in the menu? | **The full workspace menu** — favorites, rename, copy to new worktree, add folder, remove. |

### Why no star in the hover cluster

Worth recording, because it looks like the obvious answer. The three existing actions live in
`.sidebar-item-actions`, which is `opacity: 0` until the row is hovered (`theme.css:1036`).
Opacity on a parent establishes a compositing group that a child cannot escape, so a star
placed in that cluster could never stay visible at rest — exactly when it needs to say "this
one is a favorite". A fourth hover button is not an option, it is a bug.

### Discoverability, accepted knowingly

With no row indicator, the Favorites section is the *only* thing that says a workspace is
favorited. Decision 2 makes that coherent: the section is always on screen, so the evidence is
visible even though the row is silent.

## Design

### 1. Data model — collapse the union, and migrate what is on disk

`FavoriteKind` becomes a one-member union under decision 1, which is a smell. The canonical
shape becomes a plain workspace id:

- `ManifoldSettings.favorites?: StoredFavorite[]`, where `StoredFavorite = string |
  LegacyFavoriteRef` — written as ids, still *read* as either.
- `ResolvedFavorite` becomes `{ id, name }`.
- `FavoriteKind` is gone; `FavoriteRef` survives as `LegacyFavoriteRef`, read-only.
- `isFavorite(id)` / `onToggleFavorite(id)` lose their `kind` argument.
- `activateFavorite` loses its dead `'repo'` branch and keeps only the workspace path.

Renderer-only: nothing in `src/main` or the plugins references favorites.

**Existing favorites must survive.** An earlier draft of this spec claimed there were none to
migrate — that was read from the wrong file. Settings live in `~/.manifold/config.json`
(`settings-store.ts:9`), not `settings.json`, and it holds four `{kind: 'repo'}` favorites
(`buildtounderstand.org`, `manifold`, `manifold-server`, `me`). Those are precisely the
favorites this work exists to restore, so dropping the kind without migrating would delete the
feature's own subject matter.

`normalizeFavorites(stored, workspaces)` folds whatever is on disk into ids, on read:

| Stored | Becomes |
| --- | --- |
| `'w1'` | `'w1'` |
| `{kind: 'workspace', id}` | `id` |
| `{kind: 'repo', id}` | the workspace spanning that repo, **preferring the home workspace** |
| a repo in no workspace | dropped, as any unresolvable favorite always was |

A repo favorite meant "the repository", and the home workspace is the repos' own clones — so it
lands there rather than on some feature branch's worktree. Order is preserved; duplicates
collapse, since two repo favorites in one workspace would otherwise take two ⌘ slots for one
row. Nothing is written back on load; the next toggle or reorder persists the migrated form.

### 2. Shared context menu

`ContextMenu.tsx` and `ContextMenu.styles.ts` move from `components/editor/file-tree/` to
`components/common/`, updating three file-tree imports. The component is already generic and
already portals to `document.body` — required here, because a `position: fixed` menu inside a
dockview panel is otherwise offset by `.dv-render-overlay`'s transform. A sidebar importing a
file-tree internal would be the wrong dependency.

Its private `tidy()` helper is exported alongside it so both builders can collapse separators
left dangling by omitted items.

### 3. The menu

A pure `buildWorkspaceContextMenu(cfg)` in `workspace-context-menu.ts`, mirroring
`buildFileTreeContextMenu` — testable without rendering. Items, with optional entries omitted
when their handler is absent:

```
Add to Favorites  /  Remove from Favorites
─────────
Rename…
Copy to New Worktree
Add Folder…
─────────
Remove Workspace
```

**Ownership: per-card.** Each `WorkspaceCard` holds its own `{x, y}` and renders the menu when
set, so "Rename…" simply calls the card's existing `setNameDraft` (`WorkspaceCard.tsx:74`) with
no new prop plumbing. List-ownership would force that draft state up into `WorkspaceList`,
changing working code that landed in #894 to serve the menu. The invariant list-ownership would
buy — only one menu open — already holds in practice via the overlay click.

**One signature fix falls out.** `onRemoveWorkspace` takes `(e, id)` only to call
`stopPropagation` (`WorkspaceList.tsx:83`). A menu action has no event, so the × button does its
own `stopPropagation` and the prop becomes `(id)`.

### 4. File sizes

`WorkspaceCard.tsx` is at 257 lines and the repo caps files at 300. The builder lives in
`workspace-context-menu.ts` and the position state in a small `useContextMenu` hook, so the card
gains only an `onContextMenu` handler and a short conditional render — landing near 270.

### 5. CSS — nothing to restore

Checked rather than assumed: the only favorites CSS `#880` deleted was
`.sidebar-favorite-star`, which stays deleted under decision 3. `.sidebar-favorite-row` never
had rules of its own — it is a hook class, and the row also carries `.sidebar-item-row`, which
already supplies the hover background. `theme.css` is untouched.

## Files

**New**
- `src/renderer/hooks/project/normalize-favorites.ts` (+ test)
- `src/renderer/components/common/ContextMenu.tsx` (moved)
- `src/renderer/components/common/ContextMenu.styles.ts` (moved)
- `src/renderer/components/sidebar/workspace-context-menu.ts`
- `src/renderer/components/sidebar/workspace-context-menu.test.ts`
- `src/renderer/hooks/useContextMenu.ts`

**Modified**
- `src/shared/types.ts`, `src/shared/defaults.ts`
- `src/renderer/hooks/project/useFavorites.ts` (+ test)
- `src/renderer/components/editor/editor-shell/dock-panel-types.ts`
- `src/renderer/App.tsx`
- `src/renderer/components/sidebar/FavoritesList.tsx` (+ test)
- `src/renderer/components/sidebar/WorkspaceCard.tsx`
- `src/renderer/components/sidebar/WorkspaceList.tsx`
- `src/renderer/components/editor/file-tree/FileTree.tsx`,
  `file-tree-context-menu.ts`, `file-tree-context-menu.test.ts` (import paths)
- `docs/architecture/renderer.md`

## Verification

Success criteria, each with its check:

1. Builder is correct → `workspace-context-menu.test.ts`: the favorite label flips on favorited
   state, optional items are omitted with their handler, no dangling separators.
2. Right-click toggles a favorite → card test: context menu opens, "Add to Favorites" calls
   `onToggleFavorite(id)`.
3. Existing favorites survive the upgrade → `normalize-favorites.test.ts` (each stored shape,
   home-workspace preference, order, duplicate collapse) plus hook-level cases in
   `useFavorites.test.ts` proving legacy refs resolve and are rewritten on the next change.
4. Nothing regressed → updated `useFavorites.test.ts` and `FavoritesList.test.tsx`, then
   `npm test`.
5. Types hold → `npm run typecheck:web` and `npm run typecheck:node`.
   (`typecheck:plugins` is pre-existing red and out of scope.)
6. Docs track code → `bash scripts/wiki-lint.sh`, `docs/architecture/renderer.md` updated in the
   same PR.
7. **It actually works in the app** → per CLAUDE.md §4, drive the built app: right-click a
   workspace row, confirm the menu opens at the cursor, add a favorite, confirm it appears in the
   Favorites section with its ⌘ badge. Not called done off a passing test alone.
