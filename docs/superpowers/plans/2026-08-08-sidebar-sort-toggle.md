# Sidebar Sort Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sidebar toolbar button that switches the workspace list between recency order (today's behavior) and strict A→Z by repo-then-name.

**Architecture:** A new pure module `sidebar-sort.ts` owns the mode (localStorage-backed, like `sidebar-section-state.ts`) and the alphabetical comparator, delegating to the existing `sortByRecency` for the other mode. `ProjectSidebar` owns the hook and renders the button; `WorkspaceList` receives the mode as one prop and swaps its sort call. No context, no new store, no main-process change.

**Tech Stack:** React 19, TypeScript, vitest + @testing-library/react, jsdom.

**Spec:** `docs/superpowers/specs/2026-08-08-sidebar-sort-toggle-design.md`

## Global Constraints

- Run tests with `npm test` only — never `npx vitest run` (skips `pretest`, breaks the `better-sqlite3` ABI). One file: `npm test -- path/to/file.test.ts`.
- Typecheck gates: `npm run typecheck` (chains `:web`, `:node`, `:plugins`). **Baseline as of this plan: all three exit 0, and `npm test -- src/renderer/components/sidebar` is 10 files / 100 tests passing.** Any failure you see is yours.
- Default sort mode is `'recency'` — nothing moves for a user who never touches the button.
- Alphabetical mode does **not** pin the active workspace. Recency mode keeps its pin exactly as today.
- Sort key comes from `workspaceRowLabel`, never from parsing `workspace.name`.
- `localeCompare` at `{ sensitivity: 'base' }` for every comparison.
- Storage key: `manifold.sidebar.sort.v1`. Storage failures are swallowed — the in-session toggle keeps working, only the restore is lost.
- Match surrounding comment density: these files explain *why*, not *what*.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/renderer/components/sidebar/sidebar-sort.ts` | **Create.** Mode type, persisted mode hook, alphabetical comparator, `sortWorkspaces` dispatcher. |
| `src/renderer/components/sidebar/sidebar-sort.test.ts` | **Create.** Comparator + hook unit tests. |
| `src/renderer/components/sidebar/SidebarCardActionGlyphs.tsx:100` | **Modify.** Add `SortModeGlyph`. |
| `src/renderer/components/sidebar/ProjectSidebar.styles.ts` | **Modify.** Add `toolbarActions`. |
| `src/renderer/components/sidebar/ProjectSidebar.tsx:63` | **Modify.** Own the mode, render the button, pass `sortMode` down. |
| `src/renderer/components/sidebar/WorkspaceList.tsx:103` | **Modify.** Accept `sortMode`, call `sortWorkspaces`. |
| `src/renderer/components/sidebar/SidebarSortToggle.test.tsx` | **Create.** Sidebar-level behavior test. |
| `src/renderer/components/sidebar/SidebarSortAlpha.fixture.tsx` | **Create.** Screenshot fixture pinned to alpha mode. |
| `docs/architecture/renderer.md:281,369-386` | **Modify.** The doc states the ordering as unconditional; it must say it is a mode. |

**Known tension, deliberately not resolved here:** `ProjectSidebar.styles.ts` is already 315 lines and this adds ~6 more. Splitting it is a separate change touching every sidebar component that imports `sidebarStyles`; per CLAUDE.md §3 that refactor does not belong in this diff. Leave it, and mention it to the user.

---

### Task 1: The sort module

**Files:**
- Create: `src/renderer/components/sidebar/sidebar-sort.ts`
- Test: `src/renderer/components/sidebar/sidebar-sort.test.ts`

**Interfaces:**
- Consumes: `sortByRecency`, `ProjectRecency` from `./sidebar-recency`; `workspaceRowLabel` from `./agent-labels`; `Workspace` from `../../../shared/workspace-types`; `Project` from `../../../shared/types`.
- Produces:
  - `type SidebarSortMode = 'recency' | 'alpha'`
  - `useSidebarSortMode(): [SidebarSortMode, () => void]`
  - `sortWorkspaces(workspaces: readonly Workspace[], mode: SidebarSortMode, context: { recency: ProjectRecency; activeId: string | null; projects: Project[] }): Workspace[]`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/sidebar/sidebar-sort.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { sortWorkspaces, useSidebarSortMode } from './sidebar-sort'

function installLocalStorage(): void {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size
    },
  } as Storage)
}

beforeEach(() => {
  installLocalStorage()
})

const projects: Project[] = [
  { id: 'p-apex', name: 'apex', path: '/repos/apex', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p-kong', name: 'kong', path: '/repos/kong', baseBranch: 'main', addedAt: '2024-01-02' },
]

function ws(id: string, name: string, projectId: string): Workspace {
  return { id, name, projectIds: [projectId], createdAt: '2024-01-01' }
}

const alpha = (workspaces: Workspace[], activeId: string | null = null): string[] =>
  sortWorkspaces(workspaces, 'alpha', { recency: {}, activeId, projects }).map((w) => w.id)

describe('sortWorkspaces — alphabetical', () => {
  // A row reads `kong / moss`, so A→Z reads the same way: repo first. With
  // several worktrees per repo, that keeps each repo's together.
  it('groups by repo, then orders by the workspace name', () => {
    const workspaces = [
      ws('w-moss', 'moss', 'p-kong'),
      ws('w-zed', 'zed', 'p-apex'),
      ws('w-dune', 'dune', 'p-kong'),
    ]
    expect(alpha(workspaces)).toEqual(['w-zed', 'w-dune', 'w-moss'])
  })

  // A home workspace is named after its repo and renders with no dimmed prefix,
  // so its own name is its repo group and it sorts among that repo's worktrees.
  it('sorts a home workspace among its own repo’s worktrees', () => {
    const workspaces = [
      ws('w-moss', 'moss', 'p-kong'),
      ws('w-home', 'kong', 'p-kong'),
      ws('w-dune', 'dune', 'p-kong'),
    ]
    expect(alpha(workspaces)).toEqual(['w-dune', 'w-home', 'w-moss'])
  })

  it('does not split a group on letter case', () => {
    const workspaces = [ws('w-moss', 'Moss', 'p-kong'), ws('w-dune', 'dune', 'p-kong')]
    expect(alpha(workspaces)).toEqual(['w-dune', 'w-moss'])
  })

  // The whole point of A→Z is that a name's position is predictable; a row that
  // floats to the top on entry would take that away.
  it('does not pin the active workspace', () => {
    const workspaces = [ws('w-dune', 'dune', 'p-kong'), ws('w-moss', 'moss', 'p-kong')]
    expect(alpha(workspaces, 'w-moss')).toEqual(['w-dune', 'w-moss'])
  })

  it('falls back to the stored name when the primary repo is unknown', () => {
    const workspaces = [ws('w-b', 'beta', 'p-missing'), ws('w-a', 'alpha', 'p-missing')]
    expect(alpha(workspaces)).toEqual(['w-a', 'w-b'])
  })
})

describe('sortWorkspaces — recency', () => {
  it('still pins the active workspace, then orders by last visit', () => {
    const workspaces = [
      ws('w-a', 'alpha-space', 'p-apex'),
      ws('w-b', 'beta-space', 'p-kong'),
      ws('w-c', 'gamma-space', 'p-kong'),
    ]
    const sorted = sortWorkspaces(workspaces, 'recency', {
      recency: { 'w-b': 200, 'w-c': 300 },
      activeId: 'w-a',
      projects,
    })
    expect(sorted.map((w) => w.id)).toEqual(['w-a', 'w-c', 'w-b'])
  })
})

describe('useSidebarSortMode', () => {
  it('starts in recency, so nothing moves until the button is used', () => {
    const { result } = renderHook(() => useSidebarSortMode())
    expect(result.current[0]).toBe('recency')
  })

  it('toggles and restores the mode on remount', () => {
    const first = renderHook(() => useSidebarSortMode())
    act(() => first.result.current[1]())
    expect(first.result.current[0]).toBe('alpha')
    first.unmount()

    const second = renderHook(() => useSidebarSortMode())
    expect(second.result.current[0]).toBe('alpha')
  })

  it('toggles back to recency', () => {
    const { result } = renderHook(() => useSidebarSortMode())
    act(() => result.current[1]())
    act(() => result.current[1]())
    expect(result.current[0]).toBe('recency')
  })

  it('ignores a malformed stored mode', () => {
    localStorage.setItem('manifold.sidebar.sort.v1', 'sideways')
    const { result } = renderHook(() => useSidebarSortMode())
    expect(result.current[0]).toBe('recency')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/renderer/components/sidebar/sidebar-sort.test.ts`
Expected: FAIL — `Failed to resolve import "./sidebar-sort"`.

- [ ] **Step 3: Write the implementation**

Create `src/renderer/components/sidebar/sidebar-sort.ts`:

```ts
import { useCallback, useState } from 'react'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { workspaceRowLabel } from './agent-labels'
import { sortByRecency, type ProjectRecency } from './sidebar-recency'

const STORAGE_KEY = 'manifold.sidebar.sort.v1'

/** How the workspace list is ordered. `recency` is the default, so a user who
 *  never touches the toolbar toggle sees the list they always saw. */
export type SidebarSortMode = 'recency' | 'alpha'

function readSortMode(): SidebarSortMode {
  if (typeof localStorage === 'undefined') return 'recency'

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'alpha' || raw === 'recency' ? raw : 'recency'
  } catch {
    return 'recency'
  }
}

export function useSidebarSortMode(): [SidebarSortMode, () => void] {
  const [mode, setMode] = useState<SidebarSortMode>(readSortMode)

  const toggleMode = useCallback((): void => {
    setMode((current) => {
      const next: SidebarSortMode = current === 'alpha' ? 'recency' : 'alpha'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // Storage can be unavailable in restricted renderer contexts; the toggle
        // still works for this session, there is just nothing to restore next launch.
      }
      return next
    })
  }, [])

  return [mode, toggleMode]
}

/** A→Z as the row reads, left to right: the repo, then the workspace's own name
 *  — so a repo's worktrees stay together and the dimmed prefix earns its place.
 *
 *  The key comes from `workspaceRowLabel`, the same function the row renders
 *  with, so the order can never disagree with what is on screen. A home
 *  workspace has no dimmed prefix (its name *is* its repo), which puts it in its
 *  repo's group by that name.
 *
 *  Nothing is pinned here. Alphabetical exists to make a name's position
 *  predictable, and a row that floats to the top on entry would undo that. */
function sortAlphabetically(workspaces: readonly Workspace[], projects: Project[]): Workspace[] {
  const keyOf = (workspace: Workspace): readonly [string, string] => {
    const label = workspaceRowLabel(workspace, projects)
    return [label.repo ?? label.name, label.name]
  }
  const compare = (left: string, right: string): number =>
    left.localeCompare(right, undefined, { sensitivity: 'base' })

  return [...workspaces].sort((left, right) => {
    const [leftRepo, leftName] = keyOf(left)
    const [rightRepo, rightName] = keyOf(right)
    return compare(leftRepo, rightRepo) || compare(leftName, rightName)
  })
}

export function sortWorkspaces(
  workspaces: readonly Workspace[],
  mode: SidebarSortMode,
  context: { recency: ProjectRecency; activeId: string | null; projects: Project[] },
): Workspace[] {
  return mode === 'alpha'
    ? sortAlphabetically(workspaces, context.projects)
    : sortByRecency(workspaces, context.recency, context.activeId)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/renderer/components/sidebar/sidebar-sort.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/sidebar/sidebar-sort.ts src/renderer/components/sidebar/sidebar-sort.test.ts
git commit -m "feat(sidebar): add the workspace sort mode and its A-Z comparator"
```

---

### Task 2: The toolbar toggle

**Files:**
- Modify: `src/renderer/components/sidebar/SidebarCardActionGlyphs.tsx` (append)
- Modify: `src/renderer/components/sidebar/ProjectSidebar.styles.ts` (add one entry near `toolbarButtonPrimary`)
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx:61-75`
- Modify: `src/renderer/components/sidebar/WorkspaceList.tsx:11-35,62-67,103`
- Test: `src/renderer/components/sidebar/SidebarSortToggle.test.tsx` (new file — `ProjectSidebar.test.tsx` is already 368 lines)

**Interfaces:**
- Consumes: `useSidebarSortMode`, `sortWorkspaces`, `SidebarSortMode` from Task 1.
- Produces: `SortModeGlyph({ mode }: { mode: SidebarSortMode })`; `WorkspaceListProps.sortMode: SidebarSortMode` (required prop).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/components/sidebar/SidebarSortToggle.test.tsx`:

```tsx
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import {
  installElectronApi,
  installLocalStorage,
  renderSidebar,
} from './ProjectSidebar.test-helpers'

const SORTED_BY_RECENCY = 'Sorted by recently used — click to sort A–Z'
const SORTED_ALPHA = 'Sorted A–Z — click to sort by recently used'

/** The workspace rows in the order they render. */
const rowNames = (): string[] =>
  Array.from(document.querySelectorAll('.sidebar-project-row')).map(
    (row) => within(row as HTMLElement).getByRole('button', { name: /Expand|Collapse/ })
      .getAttribute('aria-label')
      ?.replace(/^(Expand|Collapse) /, '') ?? '',
  )

beforeEach(() => {
  vi.clearAllMocks()
  installLocalStorage()
  installElectronApi()
})

describe('sidebar sort toggle', () => {
  it('starts in recency, with the active workspace pinned first', () => {
    localStorage.setItem('manifold.sidebar.recency.v1', JSON.stringify({ w2: 200 }))
    renderSidebar({ activeWorkspaceId: 'w1' })

    expect(screen.getByLabelText(SORTED_BY_RECENCY)).toBeInTheDocument()
    expect(rowNames()).toEqual(['alpha-space', 'beta-space'])
  })

  // A→Z drops the pin, so the active workspace takes its alphabetical place.
  it('reorders strictly A–Z on click, unpinning the active workspace', () => {
    localStorage.setItem('manifold.sidebar.recency.v1', JSON.stringify({ w2: 200 }))
    renderSidebar({
      activeWorkspaceId: 'w2',
      workspaces: [
        { id: 'w2', name: 'zeta-space', projectIds: ['p2'], createdAt: '2024-01-02' },
        { id: 'w1', name: 'alpha-space', projectIds: ['p1'], createdAt: '2024-01-01' },
      ],
    })

    expect(rowNames()).toEqual(['zeta-space', 'alpha-space'])

    fireEvent.click(screen.getByLabelText(SORTED_BY_RECENCY))

    expect(rowNames()).toEqual(['alpha-space', 'zeta-space'])
    expect(screen.getByLabelText(SORTED_ALPHA)).toBeInTheDocument()
  })

  it('restores the chosen mode on remount', () => {
    const first = renderSidebar()
    fireEvent.click(screen.getByLabelText(SORTED_BY_RECENCY))
    first.unmount()

    renderSidebar()
    expect(screen.getByLabelText(SORTED_ALPHA)).toBeInTheDocument()
  })

  it('leaves the Add Repository action in place', () => {
    renderSidebar()
    expect(screen.getByLabelText('Add Repository')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/renderer/components/sidebar/SidebarSortToggle.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Sorted by recently used — click to sort A–Z`.

- [ ] **Step 3: Add the glyph**

Append to `src/renderer/components/sidebar/SidebarCardActionGlyphs.tsx`:

```tsx
/** Which order the workspace list is in: descending bars with an arrow for A–Z,
 *  a clock for most-recently-used. It shows the mode you are *in*, not the one a
 *  click would switch to — the label says what the click does. */
export function SortModeGlyph({ mode }: { mode: SidebarSortMode }): React.JSX.Element {
  const stroke = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const

  if (mode === 'alpha') {
    return (
      <svg {...stroke} aria-hidden="true">
        <path d="M4 6h9" />
        <path d="M4 12h6" />
        <path d="M4 18h3" />
        <path d="M18 4v15" />
        <path d="M15 16l3 3 3-3" />
      </svg>
    )
  }

  return (
    <svg {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  )
}
```

Add the type import at the top of that file (it currently opens with `import type React from 'react'`):

```tsx
import type { SidebarSortMode } from './sidebar-sort'
```

- [ ] **Step 4: Add the toolbar group style**

In `src/renderer/components/sidebar/ProjectSidebar.styles.ts`, directly after the `toolbarButtonPrimary` entry:

```ts
  // Holds both toolbar actions as one right-aligned cluster, so Add stays at the
  // edge with Sort beside it. toolbarButtonPrimary's own marginLeft: 'auto' is
  // inert inside a content-sized group, so it needs no change.
  toolbarActions: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-xs)',
  },
```

- [ ] **Step 5: Render the button and pass the mode down**

In `src/renderer/components/sidebar/ProjectSidebar.tsx`, add the imports:

```tsx
import { AddFolderGlyph, SortModeGlyph } from './SidebarCardActionGlyphs'
import { useSidebarSortMode } from './sidebar-sort'
```

Inside the component, above the `return`:

```tsx
  const [sortMode, toggleSortMode] = useSidebarSortMode()
  // Says the state *and* what the click does, so the mode is readable without
  // clicking. Not aria-pressed: this is a two-state mode, not an on/off.
  const sortLabel = sortMode === 'alpha'
    ? 'Sorted A–Z — click to sort by recently used'
    : 'Sorted by recently used — click to sort A–Z'
```

Replace the toolbar's Add button (`ProjectSidebar.tsx:65-74`) with the cluster:

```tsx
        <div style={sidebarStyles.toolbarActions}>
          <button
            type="button"
            onClick={toggleSortMode}
            className="sidebar-toolbar-button"
            style={sidebarStyles.toolbarButton}
            aria-label={sortLabel}
            title={sortLabel}
          >
            <SortModeGlyph mode={sortMode} />
          </button>
          <button
            type="button"
            onClick={onNewProject}
            className="sidebar-toolbar-button sidebar-toolbar-button--primary"
            style={{ ...sidebarStyles.toolbarButton, ...sidebarStyles.toolbarButtonPrimary }}
            aria-label="Add Repository"
            title="Add Repository"
          >
            <AddFolderGlyph />
          </button>
        </div>
```

Pass the mode to the list — add `sortMode={sortMode}` to the `<WorkspaceList ... />` call.

- [ ] **Step 6: Consume the mode in the list**

In `src/renderer/components/sidebar/WorkspaceList.tsx`, swap the recency-only import:

```tsx
import { useProjectRecency } from './sidebar-recency'
import { sortWorkspaces, type SidebarSortMode } from './sidebar-sort'
```

Add to `WorkspaceListProps`:

```tsx
  /** How the list is ordered. Owned by ProjectSidebar, which renders the toggle. */
  sortMode: SidebarSortMode
```

Destructure `sortMode` alongside the other props, then replace line 103:

```tsx
      {sortWorkspaces(workspaces, sortMode, {
        recency,
        activeId: activeWorkspaceId,
        projects,
      }).map((workspace) => (
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- src/renderer/components/sidebar`
Expected: PASS — 12 files, all green. The pre-existing `ProjectSidebar.test.tsx` recency assertions must still pass untouched; `sortMode` is required, so any other call site fails typecheck rather than silently defaulting.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: exit 0 on all three projects.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/sidebar/
git commit -m "feat(sidebar): toggle the workspace list between A-Z and recently used"
```

---

### Task 3: Documentation and visual verification

**Files:**
- Create: `src/renderer/components/sidebar/SidebarSortAlpha.fixture.tsx`
- Modify: `docs/architecture/renderer.md` (`:281`, `:369-386`, and the `updated:` frontmatter)

**Interfaces:**
- Consumes: everything from Tasks 1–2. Produces nothing consumed by later tasks.

- [ ] **Step 1: Add the alpha-mode fixture**

`ProjectSidebar.fixture.tsx` seeds recency and so captures the default mode. This second fixture pins the toggle to `alpha` so both button states and the reordering can be seen. Create `src/renderer/components/sidebar/SidebarSortAlpha.fixture.tsx`:

```tsx
import { ProjectSidebar } from './ProjectSidebar'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

// Two repos, four workspaces: enough for A→Z to visibly group a repo's worktrees
// together and to show a home workspace sorting among them by its own name.
const projects: Project[] = [
  { id: 'p-kong', name: 'kong', path: '/repos/kong', baseBranch: 'main', addedAt: '2026-07-10' },
  { id: 'p-apex', name: 'apex', path: '/repos/apex', baseBranch: 'main', addedAt: '2026-07-11' },
]

const workspaces: Workspace[] = [
  { id: 'w-moss', name: 'moss', projectIds: ['p-kong'], createdAt: '2026-07-12' },
  { id: 'w-zed', name: 'zed', projectIds: ['p-apex'], createdAt: '2026-07-13' },
  { id: 'w-kong', name: 'kong', projectIds: ['p-kong'], createdAt: '2026-07-14' },
  { id: 'w-dune', name: 'dune', projectIds: ['p-kong'], createdAt: '2026-07-15' },
]

// The mode is read from localStorage on mount, so seed it before rendering.
localStorage.setItem('manifold.sidebar.sort.v1', 'alpha')

// The active workspace is last alphabetically: it can only sit at the bottom if
// A→Z really has dropped the recency pin.
export default (
  <div style={{ width: 320, height: 480, background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
    <ProjectSidebar
      projects={projects}
      activeProjectId="p-kong"
      outputtingSessionIds={new Set<string>()}
      onNewProject={() => undefined}
      onNewWorkspace={() => undefined}
      workspaces={workspaces}
      activeWorkspaceId="w-moss"
      sessionsByWorkspace={{}}
      onSelectWorkspace={() => undefined}
      onRenameWorkspace={() => undefined}
      onRemoveWorkspace={async () => undefined}
      onCopyWorkspace={() => undefined}
      onSelectWorkspaceRepo={() => undefined}
      onAddProjectToWorkspace={() => undefined}
      onRemoveProjectFromWorkspace={() => undefined}
      onProjectFetched={() => undefined}
      drafts={[]}
      activeDraftId={null}
      onSelectDraft={() => undefined}
      onDiscardDraft={() => undefined}
    />
  </div>
)
```

- [ ] **Step 2: Capture both modes and look at them**

```bash
npm run screenshot:component ProjectSidebar --theme royal-dark
npm run screenshot:component SidebarSortAlpha --theme royal-dark
```

Read both PNGs under `screenshots/`. Confirm, by eye:
1. The toolbar shows two buttons, right-aligned, Add at the outer edge, and they do not overlap the "Workspaces" label.
2. `ProjectSidebar` shows the clock glyph; `SidebarSortAlpha` shows the A–Z glyph.
3. In the alpha shot the order is `apex / zed`, `kong / dune`, `kong` (home), `kong / moss` — the active workspace `moss` is **last**, not pinned.

If any of these is wrong, fix it before continuing. Do not proceed on code inspection alone.

- [ ] **Step 3: Update the architecture doc**

`docs/architecture/renderer.md` states the ordering as unconditional and must now state it as a mode. Three edits:

1. **`:281`** — the Explorer paragraph ends "…while the list below keeps reshuffling by recency." Amend to note the list reshuffles by recency *in the default mode*, and that a toolbar toggle switches it to A–Z, where the favorites section's fixed address matters less because every row's position is already stable.
2. **`:369-386`** — the "selected workspace is pinned first" and "most-recently-used stack" paragraphs. Scope both to recency mode and add the alternative: A→Z on repo-then-name, keyed off `workspaceRowLabel` so the order matches the rendered row, with no active pin, persisted at `manifold.sidebar.sort.v1` (`sidebar-sort.ts`; `ProjectSidebar.tsx` owns the toggle, `WorkspaceList.tsx` consumes the mode). Note that the sticky active-card header (`theme.css:870`) is unaffected — it is scoped to the card, so it still holds the active row in view while that card's own content scrolls, whatever position the card is in.
3. **Frontmatter** — bump `updated:` to `2026-08-08`.

Cite `file:line` for every claim, verified against the code as written, per CLAUDE.md §5.

- [ ] **Step 4: Run the wiki lint**

Run: `bash scripts/wiki-lint.sh`
Expected: no new staleness reported for `renderer.md`.

- [ ] **Step 5: Full suite and typecheck**

```bash
npm test
npm run typecheck
```
Expected: green, matching the recorded baseline plus the new tests.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/sidebar/SidebarSortAlpha.fixture.tsx docs/architecture/renderer.md
git commit -m "docs(sidebar): record the sort mode in the renderer wiki page"
```

---

## Self-Review

**Spec coverage:** Decisions 1–4 (recency source, workspace-list-only scope) → Task 2 Step 6 changes only `WorkspaceList`, leaving `WorkspaceCard`'s repo rows and `FavoritesList` untouched. Decision 5 (no pin) → Task 1 test "does not pin the active workspace" + Task 2 test "unpinning the active workspace" + Task 3 Step 2 check 3. Decision 6 (toggle) → Task 2 Steps 3–5. Decision 7 (repo-then-name) → Task 1 tests 1–3. Decision 8 (default recency) → Task 1 hook test 1 + Task 2 test 1. Spec's Testing section → Tasks 1–2. Spec's "done includes seeing it" → Task 3 Step 2.

**Placeholder scan:** No TBD/TODO. Every code step carries the literal code; the doc-prose step (Task 3 Step 3) names the exact lines, the claims to make, and the citations required, since prose cannot be pre-written against lines the earlier tasks will have shifted.

**Type consistency:** `SidebarSortMode` is spelled identically in `sidebar-sort.ts`, `SidebarCardActionGlyphs.tsx`, `ProjectSidebar.tsx`, and `WorkspaceList.tsx`. `sortWorkspaces`' third parameter is `{ recency, activeId, projects }` at its definition (Task 1) and at its one call site (Task 2 Step 6). `ProjectRecency` is imported from `sidebar-recency.ts`, where it is already exported.

**Not in scope:** per-repo agent expansion, sticky multi-expand, a settings-menu surface. #867 stays open until this merges.
