# Dashboard Home Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A global Dashboard home surface, opened by one sidebar button, showing host-owned summary cards (Worktrees, Statistics) that drill into the full plugin panels.

**Architecture:** Generalize the existing Worktrees home-layer overlay (`WorktreeHomeView`) into a `DashboardHomeView` that renders a grid of cards from a host-owned `CARDS` list; each card shows headline numbers from a thin renderer IPC over existing main services, and drills into the plugin webview (`PluginViewPanel`) with a back button. Statistics becomes all-projects and leaves "+ Apps".

**Tech Stack:** Electron + React (renderer), TypeScript, Vitest + Testing Library, esbuild plugin webviews.

## Global Constraints

- Max 300 LOC per touched file; split when approaching it.
- Match existing renderer style (inline `styles` objects keyed off CSS vars; `var(--…)`).
- Keep structural borders; don't restyle adjacent code.
- New renderer IPC channels must be added to `ALLOWED_INVOKE_CHANNELS` in `src/preload/index.ts`.
- Run tests with the project `testing` skill command (`better-sqlite3` ABI rebuild applies).
- Co-author/session trailers on every commit (see repo git convention).

---

## PR1 — Dashboard shell + Worktrees card

### Task 1: Worktrees summary (pure helper + main IPC)

**Files:**
- Create: `src/shared/dashboard-types.ts`
- Create: `src/main/plugins/dashboard-summary.ts`
- Create: `src/main/plugins/dashboard-summary.test.ts`
- Modify: `src/main/plugins/plugin-manager.ts` (store `worktreeOverview` as a field; add `getWorktreesSummary`)
- Modify: `src/main/ipc/plugin-handlers.ts` (register `dashboard:worktrees-summary`)
- Modify: `src/preload/index.ts` (allow the channel)

**Interfaces:**
- Produces: `WorktreesSummary = { worktrees: number; cleanableBranches: number; repos: number }`
- Produces: `summarizeWorktrees(entries: WorktreeOverviewEntry[], cleanable: BranchOverviewEntry[]): WorktreesSummary`
- Produces: IPC `dashboard:worktrees-summary` → `Promise<WorktreesSummary>`

- [ ] **Step 1: Write the failing test** — `src/main/plugins/dashboard-summary.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { summarizeWorktrees } from './dashboard-summary'
import type { WorktreeOverviewEntry, BranchOverviewEntry } from '../../shared/plugins/api-types'

const wt = (projectId: string): WorktreeOverviewEntry => ({
  worktreePath: `/wt/${projectId}/${Math.random()}`, projectId, projectName: projectId,
  branch: 'b', status: 'idle', sessionId: null, ahead: 0, behind: 0, dirty: false,
  lastCommitISO: null, locked: false,
})
const br = (projectId: string): BranchOverviewEntry => ({ projectId, projectName: projectId, branch: 'x', lastCommitISO: null })

describe('summarizeWorktrees', () => {
  it('counts worktrees, distinct repos, and cleanable branches', () => {
    const s = summarizeWorktrees([wt('a'), wt('a'), wt('b')], [br('a'), br('b'), br('b')])
    expect(s).toEqual({ worktrees: 3, cleanableBranches: 3, repos: 2 })
  })
  it('is zero-safe', () => {
    expect(summarizeWorktrees([], [])).toEqual({ worktrees: 0, cleanableBranches: 0, repos: 0 })
  })
})
```

- [ ] **Step 2: Run it, expect FAIL** (`summarizeWorktrees` not defined).

- [ ] **Step 3: Implement** — `src/shared/dashboard-types.ts`

```ts
/** Headline numbers for the Worktrees dashboard card. */
export interface WorktreesSummary {
  worktrees: number
  cleanableBranches: number
  repos: number
}
```

`src/main/plugins/dashboard-summary.ts`

```ts
import type { WorktreeOverviewEntry, BranchOverviewEntry } from '../../shared/plugins/api-types'
import type { WorktreesSummary } from '../../shared/dashboard-types'

/** Pure: fold the worktree overview into the card's three headline numbers. */
export function summarizeWorktrees(
  entries: WorktreeOverviewEntry[],
  cleanable: BranchOverviewEntry[],
): WorktreesSummary {
  return {
    worktrees: entries.length,
    cleanableBranches: cleanable.length,
    repos: new Set(entries.map((e) => e.projectId)).size,
  }
}
```

- [ ] **Step 4: Run the test, expect PASS.**

- [ ] **Step 5: Wire main** — in `plugin-manager.ts`, change the local `const worktreeOverview = …` to a private field `this.worktreeOverview = …` (declare `private readonly worktreeOverview: WorktreeOverviewService`), import `summarizeWorktrees` + `WorktreesSummary`, and add:

```ts
async getWorktreesSummary(): Promise<WorktreesSummary> {
  const [entries, cleanable] = await Promise.all([
    this.worktreeOverview.list(),
    this.worktreeOverview.listMergedOrphanBranches(),
  ])
  return summarizeWorktrees(entries, cleanable)
}
```

In `plugin-handlers.ts` add: `ipcMain.handle('dashboard:worktrees-summary', () => deps.pluginManager.getWorktreesSummary())`.
In `preload/index.ts` add `'dashboard:worktrees-summary'` to `ALLOWED_INVOKE_CHANNELS`.

- [ ] **Step 6: Run** `npm run typecheck:node` (expect no new errors) and the dashboard-summary test. Commit.

### Task 2: Card model + Worktrees summary hook (renderer)

**Files:**
- Create: `src/renderer/components/home/dashboard-cards.ts`
- Create: `src/renderer/components/home/dashboard-cards.test.tsx`

**Interfaces:**
- Produces: `DashboardSummary = { loading: boolean; error: boolean; stats: { label: string; value: string | number }[] }`
- Produces: `DashboardCardDef = { id: string; title: string; icon: string; fullViewId: string; useSummary: () => DashboardSummary }`
- Produces: `CARDS: DashboardCardDef[]` (Worktrees only in PR1) and `useWorktreesSummary`

- [ ] **Step 1: Write the failing test** — render a probe component that calls `useWorktreesSummary` with mocked `electronAPI.invoke`.

```tsx
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useWorktreesSummary } from './dashboard-cards'

function Probe(): React.JSX.Element {
  const s = useWorktreesSummary()
  return <div>{s.loading ? 'loading' : s.stats.map((x) => `${x.label}:${x.value}`).join(' ')}</div>
}

describe('useWorktreesSummary', () => {
  beforeEach(() => {
    // @ts-expect-error test stub
    global.window.electronAPI = { invoke: vi.fn(async () => ({ worktrees: 5, cleanableBranches: 2, repos: 3 })), on: vi.fn(() => () => {}) }
  })
  it('maps the summary to labelled stats', async () => {
    render(<Probe />)
    await waitFor(() => expect(screen.getByText(/worktrees:5/)).toBeInTheDocument())
    expect(screen.getByText(/cleanable:2/)).toBeInTheDocument()
    expect(screen.getByText(/repos:3/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it, expect FAIL.**

- [ ] **Step 3: Implement** `dashboard-cards.ts`

```ts
import { useEffect, useState } from 'react'
import type { WorktreesSummary } from '../../../shared/dashboard-types'

export interface DashboardSummary {
  loading: boolean
  error: boolean
  stats: { label: string; value: string | number }[]
}

export interface DashboardCardDef {
  id: string
  title: string
  icon: string
  fullViewId: string
  useSummary: () => DashboardSummary
}

export function useWorktreesSummary(): DashboardSummary {
  const [state, setState] = useState<DashboardSummary>({ loading: true, error: false, stats: [] })
  useEffect(() => {
    let live = true
    window.electronAPI.invoke('dashboard:worktrees-summary')
      .then((raw) => {
        if (!live) return
        const s = raw as WorktreesSummary
        setState({ loading: false, error: false, stats: [
          { label: 'worktrees', value: s.worktrees },
          { label: 'cleanable', value: s.cleanableBranches },
          { label: 'repos', value: s.repos },
        ] })
      })
      .catch(() => { if (live) setState({ loading: false, error: true, stats: [] }) })
    return () => { live = false }
  }, [])
  return state
}

export const CARDS: DashboardCardDef[] = [
  { id: 'worktrees', title: 'Worktrees', icon: '⎇', fullViewId: 'manifold.worktrees.panel', useSummary: useWorktreesSummary },
]
```

- [ ] **Step 4: Run the test, expect PASS. Commit.**

### Task 3: DashboardCard (presentational)

**Files:**
- Create: `src/renderer/components/home/DashboardCard.tsx`
- Create: `src/renderer/components/home/DashboardCard.test.tsx`

**Interfaces:**
- Consumes: `DashboardCardDef`, `DashboardSummary` (Task 2)
- Produces: `DashboardCard({ card, onOpen }: { card: DashboardCardDef; onOpen: () => void })` — calls `card.useSummary()`, renders title + stats + click.

- [ ] **Step 1: Failing test** — renders the title and stat values, click fires `onOpen`.

```tsx
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DashboardCard } from './DashboardCard'
import type { DashboardCardDef } from './dashboard-cards'

const card: DashboardCardDef = {
  id: 'x', title: 'Worktrees', icon: '⎇', fullViewId: 'v',
  useSummary: () => ({ loading: false, error: false, stats: [{ label: 'worktrees', value: 5 }] }),
}

describe('DashboardCard', () => {
  it('renders title + stats and fires onOpen on click', async () => {
    const onOpen = vi.fn()
    render(<DashboardCard card={card} onOpen={onOpen} />)
    expect(screen.getByText('Worktrees')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `DashboardCard.tsx` — a `<button>` styled as a card with title row (icon + title), a stats row (`value` large, `label` muted), and `loading`/`error` placeholders (`—`). Use inline `styles` keyed off `var(--…)`, mirroring `WorktreeHomeView`'s palette (`--bg-chrome`, `--border`, `--text-primary/secondary/muted`, `--radius-sm`, `--space-*`). Keep under ~90 LOC.

- [ ] **Step 4: Run, expect PASS. Commit.**

### Task 4: DashboardHomeView (grid ↔ drill-in)

**Files:**
- Create: `src/renderer/components/home/DashboardHomeView.tsx`
- Create: `src/renderer/components/home/DashboardHomeView.test.tsx`
- Delete: `src/renderer/components/home/WorktreeHomeView.tsx` (replaced; orphaned by this change)

**Interfaces:**
- Consumes: `CARDS`, `DashboardCard`, `PluginViewPanel`
- Produces: `DashboardHomeView({ onClose, initialCard }: { onClose: () => void; initialCard?: string | null })`

Behavior: internal state `view: 'grid' | cardId`, seeded from `initialCard ?? 'grid'`. Grid renders header ("Dashboard" + Done/Esc) and a card grid (`CARDS.map`). Selecting a card → `view = card.id`, header shows the card title + a "← Dashboard" back control, body renders `<PluginViewPanel api={{ id: card.fullViewId }} />`. Esc: from drill-in returns to grid; from grid calls `onClose`. Reuse `WorktreeHomeView`'s wrapper/header styles.

- [ ] **Step 1: Failing test**

```tsx
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardHomeView } from './DashboardHomeView'

beforeEach(() => {
  // @ts-expect-error test stub
  global.window.electronAPI = { invoke: vi.fn(async () => ({ worktrees: 0, cleanableBranches: 0, repos: 0 })), on: vi.fn(() => () => {}) }
})

describe('DashboardHomeView', () => {
  it('shows the card grid, drills in on click, and returns via back', () => {
    render(<DashboardHomeView onClose={vi.fn()} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Worktrees/i }))
    expect(screen.getByTitle('manifold.worktrees.panel')).toBeInTheDocument() // iframe drilled in
    fireEvent.click(screen.getByRole('button', { name: /Dashboard/i })) // back
    expect(screen.queryByTitle('manifold.worktrees.panel')).toBeNull()
  })
  it('opens straight into a card when initialCard is set', () => {
    render(<DashboardHomeView onClose={vi.fn()} initialCard="worktrees" />)
    expect(screen.getByTitle('manifold.worktrees.panel')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `DashboardHomeView.tsx` (drill-in renders `PluginViewPanel`; wrap in `DockStateContext` is provided by `AppShell` already — `PluginViewPanel` reads `useDockState().theme`, so the test stubs that via the `DockStateContext` provider OR we render it inside one. NOTE: in the test, wrap with a minimal `DockStateContext.Provider value={{ theme: 'dark' } as DockAppState}` if `useDockState` throws.) Keep under ~140 LOC; split styles if needed.
- [ ] **Step 4: Run, expect PASS. Commit.**

### Task 5: Rename overlay/command/button wiring to Dashboard

**Files:**
- Modify: `src/renderer/hooks/useAppOverlays.ts` (`showWorktrees`→`showDashboard`, `setShowWorktrees`→`setShowDashboard`; add `dashboardInitialCard: string | null` + `setDashboardInitialCard`)
- Modify: `src/renderer/components/editor/editor-shell/dock-panel-types.ts` (`onOpenWorktrees: () => void` → `onOpenDashboard: (cardId?: string) => void`)
- Modify: `src/renderer/App.tsx` (dockState `onOpenDashboard`; command `openDashboard`)
- Modify: `src/renderer/commands/command-handlers.ts` + `.test.ts` (`openWorktrees`→`openDashboard`, `'view.worktrees'`→`'view.dashboard'`)
- Modify: `src/shared/commands/catalog.ts` (entry → `{ id: 'view.dashboard', title: 'Dashboard', category: 'View', menu: { section: 'view', order: 16 } }`)
- Modify: `src/renderer/AppShell.tsx` (import `DashboardHomeView`; render with `showDashboard` + `dashboardInitialCard`)
- Rename: `WorktreesSidebarButton.tsx` → `DashboardSidebarButton.tsx` (component + label "Dashboard", icon `⊞`, reads `onOpenDashboard`)
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx` (import/use `DashboardSidebarButton`)
- Modify: `src/renderer/components/modals/ReusableSessionsCard.tsx` (`onOpenDashboard('worktrees')`, guard `dockState?.onOpenDashboard`)
- Create: `src/renderer/components/sidebar/DashboardSidebarButton.test.tsx`

**Interfaces:**
- App.tsx dockState: `onOpenDashboard: (cardId) => { overlays.setDashboardInitialCard(cardId ?? null); overlays.setShowDashboard(true) }`
- App.tsx command ctx: `openDashboard: () => { overlays.setDashboardInitialCard(null); overlays.setShowDashboard(true) }`

- [ ] **Step 1: Failing test** — `DashboardSidebarButton.test.tsx`: renders "Dashboard" when `onOpenDashboard` present; click calls it; returns null when absent.

```tsx
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardSidebarButton } from './DashboardSidebarButton'
import { DockStateContext, type DockAppState } from '../editor/editor-shell/dock-panel-types'

describe('DashboardSidebarButton', () => {
  it('renders and opens the dashboard', () => {
    const onOpenDashboard = vi.fn()
    render(
      <DockStateContext.Provider value={{ onOpenDashboard } as unknown as DockAppState}>
        <DashboardSidebarButton />
      </DockStateContext.Provider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Dashboard/i }))
    expect(onOpenDashboard).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, expect FAIL** (module not found / name mismatch).
- [ ] **Step 3: Apply the renames** across the files above. Update `command-handlers.test.ts` (`openWorktrees`→`openDashboard`) and assert `handlers['view.dashboard']` wires it.
- [ ] **Step 4: Run** the renderer suite for touched files + `npm run typecheck:web`. Expect PASS / 0 web errors.
- [ ] **Step 5: Commit.**

### Task 6: PR1 verification + open PR

- [ ] Run full `testing` suite for `src/renderer` and `src/main/plugins`; fix fallout.
- [ ] `npm run typecheck:web` (must stay 0) and `npm run typecheck:node` (no new errors vs. baseline 10).
- [ ] Launch the app (run skill) and confirm: sidebar shows "Dashboard"; clicking opens the grid; the Worktrees card shows live numbers; clicking it drills into the worktrees panel; back returns to grid; `Esc` closes; "View all worktrees →" deep-links into the Worktrees card.
- [ ] Update `docs/architecture/` page covering the worktrees home surface (rename to Dashboard) + doc map; `bash scripts/wiki-lint.sh`.
- [ ] Open PR via gh-create-pr.

---

## PR2 — Statistics card (all-projects) + remove from "+ Apps"

### Task 7: All-projects verdicts summary (store + pure helper + IPC)

**Files:**
- Modify: `src/main/store/verdict-store.ts` (add `listAll(): VerdictRecord[]`)
- Modify: `src/shared/dashboard-types.ts` (`VerdictsSummary`)
- Modify: `src/main/plugins/dashboard-summary.ts` (`summarizeVerdicts`)
- Modify: `src/main/plugins/dashboard-summary.test.ts`
- Modify: `src/main/plugins/plugin-manager.ts` (`getVerdictsSummary`)
- Modify: `src/main/ipc/plugin-handlers.ts` + `src/preload/index.ts` (`dashboard:verdicts-summary`)

**Interfaces:**
- `VerdictsSummary = { sessions: number; mergedPct: number; repos: number; perProject: { projectId: string; sessions: number; mergedPct: number }[] }`
- `summarizeVerdicts(records: VerdictRecord[]): VerdictsSummary` — group by `projectId`; `mergedPct = round(merged / sessions * 100)`; `repos = distinct projectId`.

TDD: write `summarizeVerdicts` tests (group-by, mergedPct rounding, zero-safe) → implement → `listAll()` returns the flat array → IPC + allowlist. Commit.

### Task 8: Statistics card + all-projects drill-in

**Files:**
- Modify: `src/renderer/components/home/dashboard-cards.ts` (`useVerdictsSummary`; append `statisticsCard` → `fullViewId: 'manifold.statistics.panel'`; resolve `repos` count is in summary; card stats = sessions, mergedPct, repos)
- Modify: `resources/plugins/manifold.statistics/src/*` — add `verdicts.listAll()` consumption; the panel renders **total + per-repo breakdown** (all-projects default); drop `activeProjectId` dependency from `webview-host`/`plugin.ts`.
- Modify: `resources/plugins/manifold.statistics/src/webview/aggregates.ts` + `.test.ts` (per-repo aggregation)
- Add `verdicts.listAll()` to the plugin API surface (`api-types.ts` + host RPC) under `verdicts:read`.

TDD: aggregation tests in the plugin → panel renders breakdown → card hook test (mock IPC). Map `projectId → name` renderer-side via `useProjects()` (pass names into the card; the plugin panel resolves names from the workspace API it already uses, or the summary includes names).

### Task 9: Remove Statistics from "+ Apps"

**Files:**
- Modify: `resources/plugins/manifold.statistics/package.json` (`"launcher": true` → `false`)
- Verify: "+ Apps" no longer lists Statistics; Dashboard is the only entry. Update any test asserting the launcher contains Statistics.

### Task 10: PR2 verification + PR

- [ ] Plugin build (`npm run build` for the statistics plugin if separate) + full suite.
- [ ] Launch app: Statistics card shows aggregated numbers; drill-in shows per-repo breakdown; Statistics absent from "+ Apps".
- [ ] Update covering `docs/architecture/` page (statistics now all-projects + Dashboard-only); wiki-lint.
- [ ] Open PR via gh-create-pr.

---

## Self-Review

- **Spec coverage:** Dashboard surface (Tasks 4–5), one button (Task 5), summary tile→drill-in (Tasks 3–4), host-owned `CARDS` (Task 2), Worktrees card (Tasks 1–4), all-projects Statistics (Tasks 7–8), drop from "+ Apps" (Task 9), renderer IPC (Tasks 1, 7), 300-LOC split (new focused files). ✓
- **Placeholder scan:** none — every code step shows real code; behavioral steps name exact files/assertions. ✓
- **Type consistency:** `WorktreesSummary`/`VerdictsSummary` (shared), `DashboardSummary`/`DashboardCardDef` (renderer), `onOpenDashboard(cardId?)`, `showDashboard`/`dashboardInitialCard` used consistently across tasks. ✓
