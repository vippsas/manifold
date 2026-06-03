# Favorite Repos & Workspaces — Design

**Date:** 2026-06-03
**Status:** Draft

## Background

Manifold's sidebar lists workspaces (top tier) and standalone repos/projects (bottom tier), the latter sorted alphabetically. As the number of repos grows, the list gets long and there is no fast path to the handful a user actually switches between all day. There is no concept of recents, pinned items, or favorites anywhere in the app today, and the active selection is ephemeral React state that resets on reload.

The user's primary need is **fast context-switching** between a small set of go-to targets — ideally muscle-memory fast, "without even looking."

## Goal

Add a **Favorites** feature: a pinned, user-ordered, combined list of repos and workspaces at the top of the sidebar, with **⌘1…⌘9 keyboard jumps** to the first nine entries. Favorites persist across reloads.

## Non-goals

- A ⌘K command palette / fuzzy switcher (a strong later add; explicitly out of v1).
- Auto-surfacing by recency or running state (favorites are hand-curated only).
- Reordering or pinning anything other than repos and workspaces.
- Changing how repos/workspaces themselves are created, removed, or rendered in their home sections (beyond adding a star affordance).

## Core model

A favorite is an **alias**, not a move. Favoriting a repo or workspace adds a quick-access entry at the top; the item still appears in its normal Workspaces/Repositories section below. Unfavoriting just removes the alias.

Repos and workspaces share **one ordered list**. A type icon distinguishes them (workspace vs repo). The array order is the source of truth for ⌘-number assignment: position 0 → ⌘1, position 1 → ⌘2, … position 8 → ⌘9. Entries beyond the ninth are click-only (no chord).

## Data model

```ts
// src/shared/types.ts
export interface FavoriteRef {
  kind: 'repo' | 'workspace'
  id: string            // Project.id or Workspace.id
}

// Added to ManifoldSettings:
favorites?: FavoriteRef[]   // ordered; index 0 == ⌘1
```

- Stored in `ManifoldSettings` → `~/.manifold/config.json` via the existing `SettingsStore`.
- Default `favorites: []` in `src/shared/defaults.ts`.
- Typed refs (not bare IDs) so a repo ID and a workspace ID can never be confused even if the UUID spaces overlapped.

## Persistence & resolution

- Read/write through the existing `useSettings()` / `updateSettings()` path (`App.tsx`), which already persists settings to disk. No new store, no new file, no DB.
- A renderer-side resolver maps each `FavoriteRef` to a live `Project` or `Workspace` from the already-loaded `useProjects()` / `useWorkspaces()` lists.
- **Auto-prune:** any `FavoriteRef` whose target no longer exists (repo/workspace deleted) is dropped during resolution, and the pruned list is written back. ⌘-numbers re-pack with no gaps.

## UI

**New component: `FavoritesList.tsx`** (+ `FavoritesList.styles.ts`), rendered at the very top of `ProjectSidebar.tsx`, above `WorkspaceList`.

- Renders nothing when the resolved list is empty (section hidden until the first favorite).
- Each row: drag handle, type icon (workspace/repo), name, and the ⌘-number badge for the first nine.
- Clicking a row activates it via the existing selection handlers (`onSelectWorkspace` / `onSelectProject`).
- **Drag-to-reorder** within the list using native HTML5 drag-and-drop (no new dependency). On drop, write the reordered `favorites` array back through `updateSettings()`. ⌘-numbers follow position live.

**Star affordance** in `WorkspaceList.tsx` and `ProjectList.tsx`:

- A star button per row, hover-revealed when not favorited (☆) and persistent when favorited (★). Click toggles favorite state.
- To respect the project's ~300-LOC-per-file guideline (both list components are already large), extract a shared **`FavoriteStarButton.tsx`** used by both, so each list file gains only a small call site.

## Keybindings

⌘1–⌘6 currently toggle panels via native app-menu accelerators (`src/main/app/app-menu.ts`, sending `view:toggle-panel`). Native menu accelerators take precedence over renderer key handling, so the jump shortcuts must be registered the same way.

- **Relocate panel toggles:** ⌘1…⌘6 → **⌘⌥1…⌘⌥6** (same numbering + Option). View-menu labels update to show the new chords.
- **Add favorite jumps:** a new top-level **"Go"** submenu with nine items "Jump to Favorite 1…9", accelerators ⌘1…⌘9, each sending a new IPC event `view:jump-favorite` with its slot index (0–8).
- **Renderer handler:** the `useFavorites` hook registers a listener for `view:jump-favorite`, looks up `favorites[index]`, and activates it via the existing selection handlers. No-op if the index is beyond the current favorite count.

This is a deliberate change to existing user-facing shortcuts (panel toggles), approved during design.

## Behaviors summary

| Action | Result |
|---|---|
| Hover a repo/workspace row | ☆ appears; click to favorite |
| Click ★ on a favorited row | Removes it from Favorites |
| Drag within Favorites | Reorders; ⌘-numbers follow position |
| Click a favorite / press ⌘1–9 | Activates that repo/workspace (same as selecting it in its home section) |
| Favorite a workspace | Activates the workspace and its home repo on jump |
| 10th+ favorite | Shown, click-only, no chord badge |

## Edge cases

- **Deleted target:** pruned on resolution; list re-packs.
- **Empty favorites:** section hidden; discovered via the hover star on any row.
- **Duplicate add:** toggling is idempotent — a row is either in the list once or not at all.
- **Reload:** favorites and their order persist (config.json); this is the first sidebar state that survives reload.

## Files to change

| File | Change |
|---|---|
| `src/shared/types.ts` | Add `FavoriteRef`; add `favorites?` to `ManifoldSettings` |
| `src/shared/defaults.ts` | Default `favorites: []` |
| `src/renderer/components/sidebar/FavoritesList.tsx` *(new)* | Pinned ordered list + drag-reorder |
| `src/renderer/components/sidebar/FavoritesList.styles.ts` *(new)* | Styles for the above |
| `src/renderer/components/sidebar/FavoriteStarButton.tsx` *(new)* | Shared star toggle |
| `src/renderer/components/sidebar/ProjectSidebar.tsx` | Mount `FavoritesList` at top |
| `src/renderer/components/sidebar/WorkspaceList.tsx` | Add `FavoriteStarButton` to rows |
| `src/renderer/components/sidebar/ProjectList.tsx` | Add `FavoriteStarButton` to rows |
| `src/renderer/hooks/useFavorites.ts` *(new)* | Resolve/prune/toggle/reorder/jump, backed by `useSettings` |
| `src/renderer/App.tsx` | Wire `useFavorites`; handle `view:jump-favorite` |
| `src/main/app/app-menu.ts` | Move panel toggles to ⌘⌥1–6; add ⌘1–9 favorite-jump items |

## Testing

- **`useFavorites`**: add/remove is idempotent; reorder updates order; resolution prunes missing targets and persists the pruned list; jump maps index → correct target and no-ops out of range.
- **Persistence**: `favorites` round-trips through settings; defaults to `[]`.
- **Type-safety**: `typecheck:web` / `typecheck:node` stay at baseline (web 53 / node 21), no new errors.
- **Manual**: star a repo and a workspace, confirm they appear at top with ⌘1/⌘2 badges; reorder and confirm chords follow; ⌘1–9 jump; ⌘⌥1–6 still toggle panels; delete a favorited repo and confirm it disappears from Favorites.
