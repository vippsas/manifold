# Favorite Repos & Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pinned, user-ordered, combined Favorites list (repos + workspaces) at the top of the sidebar, with ⌘1…⌘9 muscle-memory jumps.

**Architecture:** Favorites are an ordered, typed array (`{kind,id}[]`) persisted in `ManifoldSettings` (`~/.manifold/config.json`). A `useFavorites` hook (called once in `App.tsx`, next to `useProjects`/`useWorkspaces`) resolves refs to live objects, prunes missing ones for display, and persists toggles/reorders. State is distributed to the sidebar through the existing `DockStateContext` bus (the `dockState` object) — the new components read it via `useContext`, avoiding prop-drilling through four layers. ⌘-jumps are native app-menu accelerators that send a `view:jump-favorite` IPC event to the renderer; the existing ⌘1–6 panel toggles move to ⌘⌥1–6.

**Tech Stack:** Electron + React + TypeScript, Vitest + `@testing-library/react`, inline style objects (`*.styles.ts`) + global `theme.css` classes.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/types.ts` *(modify)* | `FavoriteKind`, `FavoriteRef`, `ResolvedFavorite` types; `favorites?` on `ManifoldSettings` |
| `src/shared/defaults.ts` *(modify)* | Default `favorites: []` |
| `src/renderer/hooks/useFavorites.ts` *(create)* | Resolve/prune/toggle/reorder logic, backed by `useSettings` values |
| `src/renderer/hooks/useFavorites.test.ts` *(create)* | Unit tests for the hook |
| `src/renderer/components/sidebar/FavoriteStarButton.tsx` *(create)* | Shared ☆/★ toggle, reads `DockStateContext` |
| `src/renderer/components/sidebar/FavoriteStarButton.test.tsx` *(create)* | Component test |
| `src/renderer/components/sidebar/FavoritesList.tsx` *(create)* | Pinned ordered list + drag-reorder, reads `DockStateContext` |
| `src/renderer/components/sidebar/FavoritesList.styles.ts` *(create)* | Inline styles for the list |
| `src/renderer/components/sidebar/FavoritesList.test.tsx` *(create)* | Component test |
| `src/renderer/components/editor/dock-panel-types.ts` *(modify)* | Add 5 favorites fields to `DockAppState` |
| `src/renderer/App.tsx` *(modify)* | Call `useFavorites`; build `activateFavorite`/`jumpToFavorite`; populate `dockState` |
| `src/renderer/components/sidebar/ProjectSidebar.tsx` *(modify)* | Mount `<FavoritesList />` at top |
| `src/renderer/components/sidebar/ProjectItem.tsx` *(modify)* | Star button on active repo row |
| `src/renderer/components/sidebar/ProjectList.tsx` *(modify)* | Star button on inactive "Repositories" rows |
| `src/renderer/components/sidebar/WorkspaceList.tsx` *(modify)* | Star button on workspace rows (collapsed + active card) |
| `src/renderer/styles/theme.css` *(modify)* | `.sidebar-favorite-star` hover-reveal + persistent rules |
| `src/renderer/hooks/useAppEffects.ts` *(modify)* | `jumpToFavorite` input + `view:jump-favorite` listener |
| `src/preload/index.ts` *(modify)* | Allow `view:jump-favorite` listen channel |
| `src/main/app/app-menu.ts` *(modify)* | Move panel toggles to ⌘⌥1–6; add "Go" menu with ⌘1–9 jumps |

**Scope notes (deliberate v1 limitations, documented):**
- The star appears on: the active repo card, the inactive "Repositories" rows, and workspace rows (collapsed + active). It is intentionally **not** added to the "With agents" collapsed repo rows or to repos shown *inside* a workspace card. A favorited repo still shows in the Favorites section regardless; this only limits where the ☆ affordance appears.
- No ⌘K command palette (separate future plan).

**Conventions to follow (verified in repo):**
- Test runner: Vitest. Run a single file with `npm test -- <path>` (the `pretest` hook rebuilds `better-sqlite3` automatically).
- Typecheck gates: `npm run typecheck:web` and `npm run typecheck:node`. These have a **non-zero baseline** (web ≈ 53, node ≈ 21 pre-existing errors). Success = **no new errors above baseline**, not zero.
- `useDockState()` throws when the context is null; new components must use `useContext(DockStateContext)` directly and guard for `null` (keeps existing context-free `ProjectSidebar` tests green).

---

### Task 1: Favorites types & default

**Files:**
- Modify: `src/shared/types.ts` (after the `Project` interface, ~line 56; and inside `ManifoldSettings`, ~line 100)
- Modify: `src/shared/defaults.ts` (inside `DEFAULT_SETTINGS`, ~line 19)

- [ ] **Step 1: Add the favorites types to `src/shared/types.ts`**

Insert immediately after the `Project` interface (the block ending at `}` on line 56):

```ts
export type FavoriteKind = 'repo' | 'workspace'

/** A persisted favorite: a typed pointer to a Project or Workspace by id. */
export interface FavoriteRef {
  kind: FavoriteKind
  id: string
}

/** A favorite resolved against the live project/workspace lists, for display. */
export interface ResolvedFavorite {
  kind: FavoriteKind
  id: string
  name: string
}
```

- [ ] **Step 2: Add `favorites` to `ManifoldSettings`**

In the `ManifoldSettings` interface, add this line right after `sidebarResizeReversed: boolean` (line 95):

```ts
  /** Ordered, typed favorites. Index 0 maps to ⌘1. */
  favorites?: FavoriteRef[]
```

- [ ] **Step 3: Add the default in `src/shared/defaults.ts`**

Add this line right after `sidebarResizeReversed: false,` (line 19):

```ts
  favorites: [],
```

- [ ] **Step 4: Verify typecheck has no new errors**

Run: `npm run typecheck:web`
Expected: completes with no errors referencing `types.ts`/`defaults.ts` (total count stays at the ~53 baseline).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts
git commit -m "feat(favorites): add FavoriteRef types and settings field"
```

---

### Task 2: `useFavorites` hook

**Files:**
- Create: `src/renderer/hooks/useFavorites.ts`
- Test: `src/renderer/hooks/useFavorites.test.ts`

Design: the hook receives `settings`, `updateSettings`, `projects`, `workspaces` (all already owned by `App.tsx`). It exposes a resolved+pruned display list, `isFavorite`, `toggleFavorite`, and `reorderFavorites`. Mutations persist the **resolved** ref order (this also cleans up stale refs on the next change — safe, because at mutation time the lists are loaded; we never auto-write a pruned list on first paint, which would wipe favorites before the lists arrive).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/hooks/useFavorites.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFavorites } from './useFavorites'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import type { ManifoldSettings, Project, FavoriteRef } from '../../shared/types'
import type { Workspace } from '../../shared/workspace-types'

const projects: Project[] = [
  { id: 'p1', name: 'api-gateway', path: '/a', baseBranch: 'main', addedAt: '' },
  { id: 'p2', name: 'billing', path: '/b', baseBranch: 'main', addedAt: '' },
]
const workspaces: Workspace[] = [
  { id: 'w1', name: 'ML Pipeline', projectIds: ['p1', 'p2'], createdAt: '' },
]

function makeSettings(favorites: FavoriteRef[]): ManifoldSettings {
  return { ...DEFAULT_SETTINGS, favorites }
}

describe('useFavorites', () => {
  it('resolves refs to ordered display entries with names, dropping unknown refs', () => {
    const settings = makeSettings([
      { kind: 'workspace', id: 'w1' },
      { kind: 'repo', id: 'p2' },
      { kind: 'repo', id: 'gone' },
    ])
    const { result } = renderHook(() => useFavorites(settings, vi.fn(), projects, workspaces))
    expect(result.current.favorites).toEqual([
      { kind: 'workspace', id: 'w1', name: 'ML Pipeline' },
      { kind: 'repo', id: 'p2', name: 'billing' },
    ])
  })

  it('isFavorite reflects the raw refs', () => {
    const settings = makeSettings([{ kind: 'repo', id: 'p1' }])
    const { result } = renderHook(() => useFavorites(settings, vi.fn(), projects, workspaces))
    expect(result.current.isFavorite('repo', 'p1')).toBe(true)
    expect(result.current.isFavorite('repo', 'p2')).toBe(false)
    expect(result.current.isFavorite('workspace', 'p1')).toBe(false)
  })

  it('toggleFavorite appends when absent and persists a pruned list', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const settings = makeSettings([{ kind: 'repo', id: 'gone' }])
    const { result } = renderHook(() => useFavorites(settings, updateSettings, projects, workspaces))
    act(() => { result.current.toggleFavorite('repo', 'p1') })
    expect(updateSettings).toHaveBeenCalledWith({ favorites: [{ kind: 'repo', id: 'p1' }] })
  })

  it('toggleFavorite removes when already present', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const settings = makeSettings([{ kind: 'repo', id: 'p1' }, { kind: 'repo', id: 'p2' }])
    const { result } = renderHook(() => useFavorites(settings, updateSettings, projects, workspaces))
    act(() => { result.current.toggleFavorite('repo', 'p1') })
    expect(updateSettings).toHaveBeenCalledWith({ favorites: [{ kind: 'repo', id: 'p2' }] })
  })

  it('reorderFavorites moves an entry and persists the new order', () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined)
    const settings = makeSettings([
      { kind: 'repo', id: 'p1' },
      { kind: 'repo', id: 'p2' },
      { kind: 'workspace', id: 'w1' },
    ])
    const { result } = renderHook(() => useFavorites(settings, updateSettings, projects, workspaces))
    act(() => { result.current.reorderFavorites(2, 0) })
    expect(updateSettings).toHaveBeenCalledWith({
      favorites: [
        { kind: 'workspace', id: 'w1' },
        { kind: 'repo', id: 'p1' },
        { kind: 'repo', id: 'p2' },
      ],
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/renderer/hooks/useFavorites.test.ts`
Expected: FAIL — "Cannot find module './useFavorites'".

- [ ] **Step 3: Implement the hook**

Create `src/renderer/hooks/useFavorites.ts`:

```ts
import { useCallback, useMemo } from 'react'
import type {
  FavoriteKind,
  FavoriteRef,
  ManifoldSettings,
  Project,
  ResolvedFavorite,
} from '../../shared/types'
import type { Workspace } from '../../shared/workspace-types'

export interface UseFavoritesResult {
  /** Resolved, ordered, pruned-for-display favorites. Index 0 maps to ⌘1. */
  favorites: ResolvedFavorite[]
  isFavorite: (kind: FavoriteKind, id: string) => boolean
  toggleFavorite: (kind: FavoriteKind, id: string) => void
  reorderFavorites: (fromIndex: number, toIndex: number) => void
}

export function useFavorites(
  settings: ManifoldSettings,
  updateSettings: (partial: Partial<ManifoldSettings>) => Promise<void>,
  projects: Project[],
  workspaces: Workspace[],
): UseFavoritesResult {
  const raw = useMemo<FavoriteRef[]>(() => settings.favorites ?? [], [settings.favorites])

  const resolveName = useCallback(
    (ref: FavoriteRef): string | null => {
      if (ref.kind === 'repo') return projects.find((p) => p.id === ref.id)?.name ?? null
      return workspaces.find((w) => w.id === ref.id)?.name ?? null
    },
    [projects, workspaces],
  )

  const favorites = useMemo<ResolvedFavorite[]>(() => {
    const out: ResolvedFavorite[] = []
    for (const ref of raw) {
      const name = resolveName(ref)
      if (name !== null) out.push({ kind: ref.kind, id: ref.id, name })
    }
    return out
  }, [raw, resolveName])

  const isFavorite = useCallback(
    (kind: FavoriteKind, id: string): boolean => raw.some((r) => r.kind === kind && r.id === id),
    [raw],
  )

  /** Persist only refs that currently resolve (cleans up stale entries on change). */
  const persist = useCallback(
    (next: FavoriteRef[]): void => {
      const pruned = next.filter((ref) => resolveName(ref) !== null)
      void updateSettings({ favorites: pruned })
    },
    [resolveName, updateSettings],
  )

  const toggleFavorite = useCallback(
    (kind: FavoriteKind, id: string): void => {
      const exists = raw.some((r) => r.kind === kind && r.id === id)
      const next = exists
        ? raw.filter((r) => !(r.kind === kind && r.id === id))
        : [...raw, { kind, id }]
      persist(next)
    },
    [raw, persist],
  )

  const reorderFavorites = useCallback(
    (fromIndex: number, toIndex: number): void => {
      // Operate on the resolved (visible) order, which the user is dragging.
      const order: FavoriteRef[] = favorites.map((f) => ({ kind: f.kind, id: f.id }))
      if (fromIndex < 0 || fromIndex >= order.length || toIndex < 0 || toIndex >= order.length) return
      const [moved] = order.splice(fromIndex, 1)
      order.splice(toIndex, 0, moved)
      persist(order)
    },
    [favorites, persist],
  )

  return { favorites, isFavorite, toggleFavorite, reorderFavorites }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/renderer/hooks/useFavorites.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useFavorites.ts src/renderer/hooks/useFavorites.test.ts
git commit -m "feat(favorites): add useFavorites hook with resolve/prune/toggle/reorder"
```

---

### Task 3: `FavoriteStarButton` component

**Files:**
- Create: `src/renderer/components/sidebar/FavoriteStarButton.tsx`
- Test: `src/renderer/components/sidebar/FavoriteStarButton.test.tsx`

Reads `DockStateContext` for `isFavorite` / `onToggleFavorite`. Renders nothing when context is absent (keeps context-free tests unaffected). Uses the existing `sidebar-icon-button` style plus a new `sidebar-favorite-star` class (CSS added in Task 6).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/sidebar/FavoriteStarButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FavoriteStarButton } from './FavoriteStarButton'
import { DockStateContext } from '../editor/dock-panel-types'
import type { DockAppState } from '../editor/dock-panel-types'

function renderWithContext(overrides: Partial<DockAppState>) {
  const value = {
    isFavorite: vi.fn().mockReturnValue(false),
    onToggleFavorite: vi.fn(),
    ...overrides,
  } as unknown as DockAppState
  return { value, ...render(
    <DockStateContext.Provider value={value}>
      <FavoriteStarButton kind="repo" id="p1" name="api-gateway" />
    </DockStateContext.Provider>,
  ) }
}

describe('FavoriteStarButton', () => {
  it('renders nothing without a DockState context', () => {
    const { container } = render(<FavoriteStarButton kind="repo" id="p1" name="api-gateway" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an outline star and "Add to Favorites" label when not favorited', () => {
    renderWithContext({ isFavorite: vi.fn().mockReturnValue(false) })
    expect(screen.getByLabelText('Add api-gateway to Favorites')).toBeTruthy()
  })

  it('toggles favorite and stops row activation on click', () => {
    const onToggleFavorite = vi.fn()
    const { value } = renderWithContext({ onToggleFavorite })
    const btn = screen.getByLabelText('Add api-gateway to Favorites')
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
    const stop = vi.spyOn(clickEvent, 'stopPropagation')
    fireEvent(btn, clickEvent)
    expect(onToggleFavorite).toHaveBeenCalledWith('repo', 'p1')
    expect(stop).toHaveBeenCalled()
    expect(value.isFavorite).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/renderer/components/sidebar/FavoriteStarButton.test.tsx`
Expected: FAIL — "Cannot find module './FavoriteStarButton'".

- [ ] **Step 3: Implement the component**

Create `src/renderer/components/sidebar/FavoriteStarButton.tsx`:

```tsx
import React, { useContext } from 'react'
import type { FavoriteKind } from '../../../shared/types'
import { DockStateContext } from '../editor/dock-panel-types'

interface FavoriteStarButtonProps {
  kind: FavoriteKind
  id: string
  name: string
}

export function FavoriteStarButton({ kind, id, name }: FavoriteStarButtonProps): React.JSX.Element | null {
  const state = useContext(DockStateContext)
  if (!state) return null

  const favorited = state.isFavorite(kind, id)
  const handleClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    state.onToggleFavorite(kind, id)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={(e) => e.stopPropagation()}
      className={`sidebar-icon-button sidebar-favorite-star${favorited ? ' is-favorite' : ''}`}
      aria-label={favorited ? `Remove ${name} from Favorites` : `Add ${name} to Favorites`}
      aria-pressed={favorited}
      title={favorited ? 'Remove from Favorites' : 'Add to Favorites'}
    >
      {favorited ? '★' : '☆'}
    </button>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/renderer/components/sidebar/FavoriteStarButton.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/sidebar/FavoriteStarButton.tsx src/renderer/components/sidebar/FavoriteStarButton.test.tsx
git commit -m "feat(favorites): add FavoriteStarButton toggle"
```

---

### Task 4: `FavoritesList` component + styles

**Files:**
- Create: `src/renderer/components/sidebar/FavoritesList.styles.ts`
- Create: `src/renderer/components/sidebar/FavoritesList.tsx`
- Test: `src/renderer/components/sidebar/FavoritesList.test.tsx`

Reads `DockStateContext` for `favorites`, `onActivateFavorite`, `onReorderFavorites`. Renders `null` when empty. Native HTML5 drag-and-drop reorders; the first 9 entries show a `⌘N` badge.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/sidebar/FavoritesList.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FavoritesList } from './FavoritesList'
import { DockStateContext } from '../editor/dock-panel-types'
import type { DockAppState } from '../editor/dock-panel-types'
import type { ResolvedFavorite } from '../../../shared/types'

function renderList(favorites: ResolvedFavorite[], overrides: Partial<DockAppState> = {}) {
  const value = {
    favorites,
    onActivateFavorite: vi.fn(),
    onReorderFavorites: vi.fn(),
    isFavorite: vi.fn(),
    onToggleFavorite: vi.fn(),
    ...overrides,
  } as unknown as DockAppState
  render(
    <DockStateContext.Provider value={value}>
      <FavoritesList />
    </DockStateContext.Provider>,
  )
  return value
}

describe('FavoritesList', () => {
  it('renders nothing when there are no favorites', () => {
    const { container } = render(
      <DockStateContext.Provider value={{ favorites: [], onActivateFavorite: vi.fn(), onReorderFavorites: vi.fn() } as unknown as DockAppState}>
        <FavoritesList />
      </DockStateContext.Provider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders favorite names with ⌘ badges for the first nine', () => {
    renderList([
      { kind: 'workspace', id: 'w1', name: 'ML Pipeline' },
      { kind: 'repo', id: 'p2', name: 'billing' },
    ])
    expect(screen.getByText('ML Pipeline')).toBeTruthy()
    expect(screen.getByText('billing')).toBeTruthy()
    expect(screen.getByText('⌘1')).toBeTruthy()
    expect(screen.getByText('⌘2')).toBeTruthy()
  })

  it('activates a favorite on click', () => {
    const onActivateFavorite = vi.fn()
    renderList([{ kind: 'repo', id: 'p2', name: 'billing' }], { onActivateFavorite })
    fireEvent.click(screen.getByText('billing'))
    expect(onActivateFavorite).toHaveBeenCalledWith({ kind: 'repo', id: 'p2', name: 'billing' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/renderer/components/sidebar/FavoritesList.test.tsx`
Expected: FAIL — "Cannot find module './FavoritesList'".

- [ ] **Step 3: Create the styles file**

Create `src/renderer/components/sidebar/FavoritesList.styles.ts`:

```ts
import type React from 'react'

export const favoritesStyles: Record<string, React.CSSProperties> = {
  section: {
    padding: '4px 0 2px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px var(--space-sm)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    fontSize: 'var(--type-ui-small)',
    fontWeight: 600,
  },
  rowDragging: {
    opacity: 0.5,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
  glyph: {
    flexShrink: 0,
    width: 14,
    textAlign: 'center' as const,
    opacity: 0.8,
  },
  badge: {
    flexShrink: 0,
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },
}
```

- [ ] **Step 4: Implement the component**

Create `src/renderer/components/sidebar/FavoritesList.tsx`:

```tsx
import React, { useContext, useState } from 'react'
import { DockStateContext } from '../editor/dock-panel-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { favoritesStyles } from './FavoritesList.styles'

export function FavoritesList(): React.JSX.Element | null {
  const state = useContext(DockStateContext)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  if (!state || state.favorites.length === 0) return null
  const { favorites, onActivateFavorite, onReorderFavorites } = state

  return (
    <div style={favoritesStyles.section}>
      <div style={sidebarStyles.sectionLabel}>Favorites</div>
      {favorites.map((fav, index) => (
        <div
          key={`${fav.kind}-${fav.id}`}
          role="button"
          tabIndex={0}
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (dragIndex !== null && dragIndex !== index) onReorderFavorites(dragIndex, index)
            setDragIndex(null)
          }}
          onDragEnd={() => setDragIndex(null)}
          onClick={() => onActivateFavorite(fav)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onActivateFavorite(fav)
            }
          }}
          className="sidebar-item-row sidebar-favorite-row"
          style={{ ...favoritesStyles.row, ...(dragIndex === index ? favoritesStyles.rowDragging : undefined) }}
          title={fav.name}
        >
          <span style={favoritesStyles.glyph} aria-hidden>{fav.kind === 'workspace' ? '◧' : '▢'}</span>
          <span className="truncate" style={favoritesStyles.name}>{fav.name}</span>
          {index < 9 && <span style={favoritesStyles.badge}>⌘{index + 1}</span>}
        </div>
      ))}
      <div style={sidebarStyles.sectionDivider} />
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/renderer/components/sidebar/FavoritesList.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/sidebar/FavoritesList.tsx src/renderer/components/sidebar/FavoritesList.styles.ts src/renderer/components/sidebar/FavoritesList.test.tsx
git commit -m "feat(favorites): add FavoritesList with drag-reorder and ⌘ badges"
```

---

### Task 5: Extend `DockAppState` and wire `App.tsx`

**Files:**
- Modify: `src/renderer/components/editor/dock-panel-types.ts` (imports near top; `DockAppState` fields before its closing `}` at line 121)
- Modify: `src/renderer/App.tsx` (imports; hook usage after line 45; `dockState` object; `useAppEffects` call)

- [ ] **Step 1: Add favorites fields to `DockAppState`**

In `src/renderer/components/editor/dock-panel-types.ts`, add `FavoriteKind` and `ResolvedFavorite` to the existing shared-types import (the file already imports from `../../../shared/types`). Then insert these fields just before the `DockAppState` closing brace `}` that precedes `export const DockStateContext` (after `discardDraft: (draftId: string) => void` on line 120):

```ts
  // Favorites
  favorites: ResolvedFavorite[]
  isFavorite: (kind: FavoriteKind, id: string) => boolean
  onToggleFavorite: (kind: FavoriteKind, id: string) => void
  onReorderFavorites: (fromIndex: number, toIndex: number) => void
  onActivateFavorite: (favorite: ResolvedFavorite) => void
```

If `FavoriteKind`/`ResolvedFavorite` are not part of an existing `import type { ... } from '../../../shared/types'`, add:

```ts
import type { FavoriteKind, ResolvedFavorite } from '../../../shared/types'
```

- [ ] **Step 2: Wire the hook and activation handlers in `App.tsx`**

Add the import near the other hook imports (after line 33 `import { useWorkspaces } ...`):

```ts
import { useFavorites } from './hooks/useFavorites'
import type { ResolvedFavorite } from '../shared/types'
```

Immediately after line 45 (`const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)`), add:

```ts
  const { favorites, isFavorite, toggleFavorite, reorderFavorites } = useFavorites(
    settings, updateSettings, projects, workspaces,
  )
  const activateFavorite = useCallback((fav: ResolvedFavorite): void => {
    if (fav.kind === 'repo') {
      setActiveWorkspaceId(null)
      setActiveProject(fav.id)
    } else {
      const ws = workspaces.find((w) => w.id === fav.id)
      setActiveWorkspaceId(fav.id)
      if (ws && ws.projectIds[0]) setActiveProject(ws.projectIds[0])
      setActiveSession(null)
    }
  }, [workspaces, setActiveProject, setActiveSession])
  const jumpToFavorite = useCallback((index: number): void => {
    const fav = favorites[index]
    if (fav) activateFavorite(fav)
  }, [favorites, activateFavorite])
```

- [ ] **Step 3: Pass `jumpToFavorite` into `useAppEffects`**

Change the `useAppEffects({ ... })` call (lines 87–90) to include `jumpToFavorite`:

```ts
  const appEffects = useAppEffects({
    activeSessionId, dockLayout, settings,
    setActiveProject, spawnAgent, refreshOpenFiles: codeView.refreshOpenFiles, refreshDiff,
    jumpToFavorite,
  })
```

- [ ] **Step 4: Populate the new `dockState` fields**

In the `dockState` object, add these entries right after `drafts, activeDraft, promoteDraft, discardDraft,` (line 265):

```ts
    favorites, isFavorite, onToggleFavorite: toggleFavorite,
    onReorderFavorites: reorderFavorites, onActivateFavorite: activateFavorite,
```

- [ ] **Step 5: Verify typecheck has no new errors**

Run: `npm run typecheck:web`
Expected: no new errors beyond baseline. (If `useAppEffects` reports a missing `jumpToFavorite` property, that is fixed in Task 7 — proceed; do not add it twice.)

> Note: Task 5 and Task 7 both touch the `useAppEffects` input. Because Step 3 here passes `jumpToFavorite` before Task 7 adds it to the input type, `typecheck:web` will show **one** new error on the `useAppEffects(...)` call until Task 7 completes. This is expected and resolved by Task 7. Do not "fix" it by removing the argument.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/editor/dock-panel-types.ts src/renderer/App.tsx
git commit -m "feat(favorites): expose favorites state through DockAppState"
```

---

### Task 6: Mount the list and add star buttons

**Files:**
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx`
- Modify: `src/renderer/components/sidebar/ProjectItem.tsx`
- Modify: `src/renderer/components/sidebar/ProjectList.tsx`
- Modify: `src/renderer/components/sidebar/WorkspaceList.tsx`
- Modify: `src/renderer/styles/theme.css`

- [ ] **Step 1: Mount `<FavoritesList />` at the top of the sidebar**

In `src/renderer/components/sidebar/ProjectSidebar.tsx`, add the import after line 7 (`import { ProjectList } ...`):

```ts
import { FavoritesList } from './FavoritesList'
```

Then insert `<FavoritesList />` as the first child of the root `<div style={sidebarStyles.root}>` (immediately after line 89's `<div style={sidebarStyles.root}>`):

```tsx
      <FavoritesList />
```

- [ ] **Step 2: Add the star to the active repo row (`ProjectItem.tsx`)**

Add the import (top of file, after the other component imports):

```ts
import { FavoriteStarButton } from './FavoriteStarButton'
```

Inside the `<div className="sidebar-item-actions" style={sidebarStyles.itemRight}>` block, add the star as the **first** child (before the fetch button):

```tsx
        <FavoriteStarButton kind="repo" id={project.id} name={project.name} />
```

- [ ] **Step 3: Add the star to inactive "Repositories" rows (`ProjectList.tsx`)**

Add the import after line 8 (`import { ProjectItem } ...`):

```ts
import { FavoriteStarButton } from './FavoriteStarButton'
```

In the inactive-projects map (the row block at lines 234–256), replace the single `<span>` name child with the name span plus an actions wrapper. Replace this exact block:

```tsx
                  <span
                    className="truncate sidebar-row-label"
                    style={{ color: 'var(--text-muted)', fontSize: 'var(--type-ui-small)' }}
                  >
                    {project.name}
                  </span>
```

with:

```tsx
                  <span
                    className="truncate sidebar-row-label"
                    style={{ color: 'var(--text-muted)', fontSize: 'var(--type-ui-small)', flex: 1, minWidth: 0 }}
                  >
                    {project.name}
                  </span>
                  <span className="sidebar-item-actions" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <FavoriteStarButton kind="repo" id={project.id} name={project.name} />
                  </span>
```

- [ ] **Step 4: Add the star to workspace rows (`WorkspaceList.tsx`)**

Add the import alongside the other sidebar component imports at the top of the file:

```ts
import { FavoriteStarButton } from './FavoriteStarButton'
```

**(4a) Collapsed workspace row** — in the `if (!isActive)` block, replace the repo-count span (lines 121–123):

```tsx
              <span style={{ fontSize: 'var(--type-ui-caption)', color: 'var(--text-muted)', flexShrink: 0 }}>
                {w.projectIds.length} {w.projectIds.length === 1 ? 'repo' : 'repos'}
              </span>
```

with:

```tsx
              <span style={{ fontSize: 'var(--type-ui-caption)', color: 'var(--text-muted)', flexShrink: 0 }}>
                {w.projectIds.length} {w.projectIds.length === 1 ? 'repo' : 'repos'}
              </span>
              <span className="sidebar-item-actions" style={{ flexShrink: 0 }}>
                <FavoriteStarButton kind="workspace" id={w.id} name={w.name} />
              </span>
```

**(4b) Active workspace card header** — inside the `<div className="sidebar-item-actions" style={sidebarStyles.itemRight}>` (line 174), add the star as the **first** child (before the add-repo button):

```tsx
                <FavoriteStarButton kind="workspace" id={w.id} name={w.name} />
```

- [ ] **Step 5: Add CSS for the star reveal**

In `src/renderer/styles/theme.css`, add this block immediately after the `.sidebar-icon-button:hover { ... }` rule (after line 743):

```css
.sidebar-favorite-star {
  opacity: 0;
  pointer-events: none;
}

.sidebar-item-row:hover .sidebar-favorite-star,
.sidebar-item-row:focus-within .sidebar-favorite-star,
.sidebar-item-row--active .sidebar-favorite-star,
.sidebar-project-group--collapsed:hover .sidebar-favorite-star,
.sidebar-inactive-project:hover .sidebar-favorite-star {
  opacity: 0.95;
  pointer-events: auto;
}

/* A favorited star stays visible even when the row is not hovered. */
.sidebar-favorite-star.is-favorite {
  opacity: 1;
  pointer-events: auto;
  color: var(--accent);
}

/* The Favorites-section rows are always interactive (no hover-reveal). */
.sidebar-favorite-row .sidebar-favorite-star {
  opacity: 1;
  pointer-events: auto;
}
```

- [ ] **Step 6: Verify existing sidebar tests still pass and typecheck is clean**

Run: `npm test -- src/renderer/components/sidebar/ProjectSidebar.test.tsx`
Expected: PASS (the context-free render shows no stars / no Favorites section — unchanged behavior).

Run: `npm run typecheck:web`
Expected: only the single expected `useAppEffects` error from Task 5 remains (resolved in Task 7); no other new errors.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/sidebar/ProjectSidebar.tsx src/renderer/components/sidebar/ProjectItem.tsx src/renderer/components/sidebar/ProjectList.tsx src/renderer/components/sidebar/WorkspaceList.tsx src/renderer/styles/theme.css
git commit -m "feat(favorites): mount FavoritesList and add star toggles to sidebar rows"
```

---

### Task 7: Keyboard jumps (preload + listener + menu)

**Files:**
- Modify: `src/preload/index.ts` (`ALLOWED_LISTEN_CHANNELS`, ~line 141)
- Modify: `src/renderer/hooks/useAppEffects.ts` (input type + new listener near line 71)
- Modify: `src/main/app/app-menu.ts` (View accelerators lines 71–97; add "Go" menu)

- [ ] **Step 1: Allow the new IPC listen channel**

In `src/preload/index.ts`, add `'view:jump-favorite'` to the `ALLOWED_LISTEN_CHANNELS` array, right after the existing `'view:show-search',` entry:

```ts
  'view:jump-favorite',
```

- [ ] **Step 2: Add `jumpToFavorite` to the `useAppEffects` input and register the listener**

In `src/renderer/hooks/useAppEffects.ts`, add `jumpToFavorite: (index: number) => void` to the hook's input interface (the `interface`/type describing the `input` argument — the same one that lists `refreshDiff`, `spawnAgent`, etc.).

Then add this listener right after the existing `view:show-search` effect (after line 77):

```ts
  useEffect(() => window.electronAPI.on('view:jump-favorite', (index: unknown) => {
    input.jumpToFavorite(index as number)
  }), [input.jumpToFavorite])
```

- [ ] **Step 3: Move panel toggles and add the "Go" menu in `app-menu.ts`**

Change the six View-menu accelerators (lines 71, 76, 81, 86, 91, 96) from `'CmdOrCtrl+N'` to `'CmdOrCtrl+Alt+N'`:

```ts
          accelerator: 'CmdOrCtrl+Alt+1',   // Toggle Projects
          accelerator: 'CmdOrCtrl+Alt+2',   // Toggle Agent
          accelerator: 'CmdOrCtrl+Alt+3',   // Toggle Editor
          accelerator: 'CmdOrCtrl+Alt+4',   // Toggle Files
          accelerator: 'CmdOrCtrl+Alt+5',   // Toggle Modified Files
          accelerator: 'CmdOrCtrl+Alt+6',   // Toggle Shell
```

Then add a new top-level menu to `menuTemplate`, inserted **after** the `View` menu object (after its closing `},` on line 110) and before the `Window` menu:

```ts
    {
      label: 'Go',
      submenu: Array.from({ length: 9 }, (_, i) => ({
        label: `Jump to Favorite ${i + 1}`,
        accelerator: `CmdOrCtrl+${i + 1}`,
        click: () => mainWindow?.webContents.send('view:jump-favorite', i),
      })),
    },
```

- [ ] **Step 4: Verify both typechecks are clean**

Run: `npm run typecheck:web`
Expected: the Task 5 `useAppEffects` error is now gone; no new errors above baseline.

Run: `npm run typecheck:node`
Expected: no new errors above baseline (~21).

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/renderer/hooks/useAppEffects.ts src/main/app/app-menu.ts
git commit -m "feat(favorites): add ⌘1-9 jump shortcuts; move panel toggles to ⌘⌥1-6"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit-test suite**

Run: `npm test`
Expected: PASS, including the three new test files; no regressions.

- [ ] **Step 2: Run both typechecks for a final baseline check**

Run: `npm run typecheck:web && npm run typecheck:node`
Expected: no new errors above the documented baselines (web ≈ 53, node ≈ 21).

- [ ] **Step 3: Manual smoke test in the running app**

Launch the app (use the project's run skill / `npm run dev` equivalent). Verify:
1. Hover a repo in "Repositories" → ☆ appears; click it → it shows at the top under **Favorites** with badge `⌘1`.
2. Hover a workspace (collapsed) → ☆ appears; favorite it → appears in Favorites with the next `⌘N` badge and a `◧` glyph.
3. Drag a favorite to a new position → order changes and the `⌘N` badges follow position.
4. Press `⌘1`…`⌘N` → the matching favorite activates (repo selected / workspace + home repo selected).
5. Press `⌘⌥1`…`⌘⌥6` → panels still toggle (Projects/Agent/Editor/Files/Modified/Shell).
6. Reload the app → Favorites and their order persist.
7. Remove a favorited repo via its `×` → it disappears from Favorites and the badges re-pack.

- [ ] **Step 4: Commit any fixups**

If manual testing surfaced styling/positioning tweaks (e.g., star alignment in a row), make the minimal fix and commit:

```bash
git add -A
git commit -m "fix(favorites): polish star alignment and reveal"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** Pinned combined list (Task 4/6) ✓ · ordered with type icons (Task 4) ✓ · ⌘1–9 jumps + ⌘⌥1–6 relocation (Task 7) ✓ · hover-star add/remove (Task 3/6) ✓ · drag reorder (Task 4) ✓ · typed ordered persistence in `ManifoldSettings` (Task 1/2) ✓ · auto-prune (Task 2: stale refs dropped from display immediately and from storage on next change — see note) ✓ · empty-state hidden (Task 4) ✓ · alias model (stars added without removing rows from home sections — Task 6) ✓ · palette out of scope ✓.

**Deviation from spec (intentional):** the spec said the pruned list is "written back" on resolution. To avoid wiping favorites during the brief startup window when `projects`/`workspaces` are still empty, pruning is applied to the display immediately but persisted to disk only on the next toggle/reorder. Net user-visible behavior matches (stale items vanish and don't occupy ⌘-slots).

**Type consistency:** `FavoriteRef`/`ResolvedFavorite`/`FavoriteKind` defined once in `shared/types.ts` and imported everywhere. Hook returns `{ favorites, isFavorite, toggleFavorite, reorderFavorites }`; `DockAppState` exposes them as `favorites/isFavorite/onToggleFavorite/onReorderFavorites/onActivateFavorite` (the `on*` rename happens only at the `dockState` boundary in Task 5 Step 4). `view:jump-favorite` carries a 0-based index in both sender (app-menu) and receiver (useAppEffects).

**Placeholder scan:** none — every step has concrete code or an exact command with expected output.

**Cross-task coupling called out:** Task 5 and Task 7 both touch `useAppEffects`; the transient typecheck error between them is documented in both places so an out-of-order or between-task review doesn't "fix" it incorrectly.
