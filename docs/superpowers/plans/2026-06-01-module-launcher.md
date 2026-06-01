# Module Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent "+" apps launcher at the end of the dock tab strip that lists the optional modules (Ideas, Loop, Verdicts, Watch), and retire the Settings workspace checkboxes plus Watch's auto-appear special-casing, so "available" (always in the launcher) is cleanly separated from "open" (a sticky tab).

**Architecture:** A small `launcher-modules` registry declares each launcher-able module once (id + description; label reuses `PANEL_TITLES`). A `ModuleLauncher` component reads the registry and the dock state, then renders a dropdown via the existing `ActionMenuButton`. The launcher is mounted into Dockview's right header-actions area (only for the group that owns the `agent` panel) by a thin composing `WorkspaceHeaderActions` wrapper. Opening a module reuses the existing `togglePanel`/`focusPanel` dock actions; the per-session serialized layout (already persisted) is what makes an opened tab "sticky". The four module-gating flags (`showIdeasTab`, `showLoopTab`, `showVerdictsTab`, and the derived `showWatchTab`) are removed from settings and from the dock-layout plumbing; modules are no longer added to the default layout or force-hidden on load — they exist only when launched, and persist in the session layout until their tab is closed.

**Tech Stack:** Electron + React 18 + TypeScript, Dockview v5, Vitest. Inline style objects (this codebase's header components use inline styles, not CSS Modules).

**Key design decisions (settled during brainstorming):**
- Placement: end of the tab strip, as a "+" apps button (Dockview right header actions).
- Model: launcher opens a **sticky tab**; the Settings checkboxes are **retired**. Closing a tab returns the module to the launcher.
- Watch is **folded into the launcher** like the others; its auto-appear-when-not-superagent behavior is removed.
- Stickiness is **per-session** (it rides the existing per-session saved dock layout). This is an intentional behavior change from the old global flags — note it in the PR description.

**Migration note (no code, just awareness):** Existing sessions whose saved layout already contains `watch`/`backgroundAgent`/`loop`/`verdicts` panels keep them (the component IDs are unchanged and still registered). New sessions start without them. Old persisted `showIdeasTab`/`showLoopTab`/`showVerdictsTab` keys in settings.json become ignored dead keys — harmless, since settings load merges over `DEFAULT_SETTINGS`.

---

## File Structure

**New files:**
- `src/renderer/modules/launcher-modules.ts` — the registry: launcher-able module ids + descriptions, and a derived id set.
- `src/renderer/modules/launcher-modules.test.ts` — registry invariants.
- `src/renderer/components/editor/ModuleLauncher.tsx` — the "+" launcher dropdown (reads dock state, renders `ActionMenuButton`).
- `src/renderer/components/editor/ModuleLauncher.test.tsx` — launcher rendering + click behavior.
- `src/renderer/components/editor/WorkspaceHeaderActions.tsx` — composing right-header-actions component (editor actions + launcher).

**Modified files:**
- `src/renderer/components/editor/ActionMenuButton.tsx` — optional per-item `description` subtitle.
- `src/renderer/components/editor/CodeViewer.styles.ts` — add `actionMenuItemDescription` + a column wrapper style.
- `src/renderer/components/editor/dock-panel-types.ts` — add `onOpenModule` / `isModuleOpen` to `DockAppState`.
- `src/renderer/App.tsx` — wire `onOpenModule`/`isModuleOpen`; drop the four flag args to `useDockLayout`.
- `src/renderer/AppShell.tsx` — use `WorkspaceHeaderActions` as `rightHeaderActionsComponent`.
- `src/renderer/hooks/dock-layout-actions.ts` — remove the `backgroundAgent`/`loop` open guards.
- `src/renderer/hooks/useDockLayout.ts` — drop the four flag params; rebuild `hiddenPanels` to exclude launcher modules; drop tab-visibility effects.
- `src/renderer/hooks/dock-layout-context.ts` — drop the four `show*TabRef` fields.
- `src/renderer/hooks/dock-layout-builders.ts` — `applyDefaultLayout` no longer takes options / no longer adds the four modules.
- `src/renderer/hooks/dock-layout-tabs.ts` — drop the four-module reconcile calls; remove now-unused `applyTabSetting` + `useTabVisibilityEffect`.
- `src/shared/types.ts` — remove the three flag fields from `ManifoldSettings`.
- `src/shared/defaults.ts` — remove the three flag defaults.
- Settings UI: `SettingsModal.tsx`, `settings/SettingsModalBody.tsx`, `settings/GeneralSettingsSection.tsx` — remove the three checkboxes + their prop plumbing.
- Test mocks/fixtures: `SettingsModal.test.tsx`, `main/store/settings-store.test.ts`, `dock-layout-builders.test.ts`, and the five `DockAppState` mock literals (`DockTab.test.tsx`, `search/SearchPanel.test.tsx`, `editor/dock-panels.test.tsx`, `background-agent/BackgroundAgentPanel.test.tsx`, `editor/EditorHeaderActions.test.tsx`).

**Execution order rationale:** Build and mount the launcher first (Tasks 1–6) so the modules stay openable at every commit, then retire the flags (Tasks 7–8). Between Task 6 and Task 8 there's a brief interim where a launched Ideas/Loop/Verdicts tab won't survive a session switch (the old flag still force-hides it on reload); Watch still auto-appears. That's acceptable mid-session and is fully resolved by Task 8.

**Test command:** `npm test` runs the whole suite (its `pretest` rebuilds `better-sqlite3` for Node). To target one file quickly after the first full run, use `npx vitest run <path>`. Typecheck with `npm run typecheck`.

---

## Task 1: Module registry

**Files:**
- Create: `src/renderer/modules/launcher-modules.ts`
- Test: `src/renderer/modules/launcher-modules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/modules/launcher-modules.test.ts
import { describe, it, expect } from 'vitest'
import { LAUNCHER_MODULES, LAUNCHER_MODULE_IDS } from './launcher-modules'
import { PANEL_TITLES } from '../hooks/dock-layout-helpers'

describe('launcher-modules registry', () => {
  it('lists the four optional modules in order', () => {
    expect(LAUNCHER_MODULES.map((m) => m.id)).toEqual([
      'backgroundAgent', 'loop', 'verdicts', 'watch',
    ])
  })

  it('every module id has a known panel title and a non-empty description', () => {
    for (const mod of LAUNCHER_MODULES) {
      expect(PANEL_TITLES[mod.id]).toBeTruthy()
      expect(mod.description.length).toBeGreaterThan(0)
    }
  })

  it('LAUNCHER_MODULE_IDS mirrors the registry', () => {
    expect([...LAUNCHER_MODULE_IDS].sort()).toEqual(
      LAUNCHER_MODULES.map((m) => m.id).sort(),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/modules/launcher-modules.test.ts`
Expected: FAIL — cannot find module `./launcher-modules`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/modules/launcher-modules.ts
import type { DockPanelId } from '../hooks/dock-layout-helpers'

/** A module that can be opened on demand from the tab-strip "+" launcher.
 *  Adding a future module to the launcher means adding one entry here —
 *  the label is sourced from PANEL_TITLES so titles stay in one place. */
export interface LauncherModule {
  id: DockPanelId
  description: string
}

export const LAUNCHER_MODULES: readonly LauncherModule[] = [
  { id: 'backgroundAgent', description: 'Experimental project ideas feed.' },
  { id: 'loop', description: 'Autoresearch loop: edit → eval → keep-or-discard.' },
  { id: 'verdicts', description: 'Per-runtime quality metrics and recent sessions.' },
  { id: 'watch', description: 'Analyze a video with its transcript and extracted frames.' },
]

export const LAUNCHER_MODULE_IDS: ReadonlySet<DockPanelId> = new Set(
  LAUNCHER_MODULES.map((m) => m.id),
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/modules/launcher-modules.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/modules/launcher-modules.ts src/renderer/modules/launcher-modules.test.ts
git commit -m "feat: add launcher module registry"
```

---

## Task 2: Optional description subtitle in ActionMenuButton

`ActionMenuButton` currently renders only a `label` per item. The launcher menu wants a name + a one-line description. Add an optional `description` that renders as a stacked subtitle; existing callers (which don't set it) are visually unchanged.

**Files:**
- Modify: `src/renderer/components/editor/ActionMenuButton.tsx`
- Modify: `src/renderer/components/editor/CodeViewer.styles.ts`
- Test: `src/renderer/components/editor/ActionMenuButton.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/editor/ActionMenuButton.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionMenuButton } from './ActionMenuButton'

describe('ActionMenuButton', () => {
  it('renders an item description when provided', () => {
    render(
      <ActionMenuButton
        buttonLabel="+"
        title="Open"
        menuLabel="Modules"
        items={[{ id: 'a', label: 'Ideas', description: 'Idea feed.', action: vi.fn() }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByText('Ideas')).toBeInTheDocument()
    expect(screen.getByText('Idea feed.')).toBeInTheDocument()
  })

  it('fires the item action and closes the menu on click', () => {
    const action = vi.fn()
    render(
      <ActionMenuButton
        buttonLabel="+"
        title="Open"
        menuLabel="Modules"
        items={[{ id: 'a', label: 'Ideas', action }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Ideas/ }))
    expect(action).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/editor/ActionMenuButton.test.tsx`
Expected: FAIL — `Idea feed.` text not found (description not yet rendered).

- [ ] **Step 3: Add the styles**

In `src/renderer/components/editor/CodeViewer.styles.ts`, immediately after the `actionMenuItemLabel` block (ends at line ~191), add two styles:

```ts
  actionMenuItemText: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    minWidth: 0,
  },
  actionMenuItemDescription: {
    fontSize: '0.82em',
    lineHeight: 1.25,
    color: 'var(--text-muted)',
    whiteSpace: 'normal' as const,
  },
```

Also relax the menu item so descriptions can wrap. Change `actionMenuItem` `whiteSpace: 'nowrap'` to `whiteSpace: 'normal'` and add `maxWidth: '260px'`:

```ts
  actionMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    maxWidth: '260px',
    padding: '6px 8px',
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
    textAlign: 'left' as const,
    whiteSpace: 'normal' as const,
    cursor: 'pointer',
  },
```

- [ ] **Step 4: Render the description in ActionMenuButton**

In `src/renderer/components/editor/ActionMenuButton.tsx`, extend the item type (lines 4–8):

```tsx
export interface ActionMenuButtonItem {
  id: string
  label: string
  description?: string
  action: () => void
}
```

Replace the menu-item button body (lines 95–110) so the label and optional description stack:

```tsx
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                style={viewerStyles.actionMenuItem}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  item.action()
                  setMenu(null)
                }}
                role="menuitem"
              >
                <span style={viewerStyles.actionMenuItemText}>
                  <span style={viewerStyles.actionMenuItemLabel}>{item.label}</span>
                  {item.description && (
                    <span style={viewerStyles.actionMenuItemDescription}>{item.description}</span>
                  )}
                </span>
              </button>
            ))}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/renderer/components/editor/ActionMenuButton.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Confirm existing callers still pass**

Run: `npx vitest run src/renderer/components/editor/EditorHeaderActions.test.tsx`
Expected: PASS (no regressions — those items set no `description`).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/editor/ActionMenuButton.tsx src/renderer/components/editor/CodeViewer.styles.ts src/renderer/components/editor/ActionMenuButton.test.tsx
git commit -m "feat: support optional item descriptions in ActionMenuButton"
```

---

## Task 3: Add `onOpenModule` / `isModuleOpen` to dock state

The launcher renders inside Dockview and reads from `DockStateContext`, so it needs two handlers there. Add them to the type first (tests drive the App wiring in Task 4's mocks). These are **required** fields, so every `DockAppState` mock must set them.

**Files:**
- Modify: `src/renderer/components/editor/dock-panel-types.ts:108-113`
- Modify (mocks): `src/renderer/DockTab.test.tsx`, `src/renderer/components/search/SearchPanel.test.tsx`, `src/renderer/components/editor/dock-panels.test.tsx`, `src/renderer/components/background-agent/BackgroundAgentPanel.test.tsx`, `src/renderer/components/editor/EditorHeaderActions.test.tsx`

- [ ] **Step 1: Extend the DockAppState type**

In `src/renderer/components/editor/dock-panel-types.ts`, in the `// Layout` block (currently lines 108–113), add the two members after `onClosePanel`:

```ts
  // Layout
  onShowSearchPanel: (mode: SearchMode) => void
  onClosePanel: (id: string) => void
  /** Open a launcher module as a tab, or focus it if already open. */
  onOpenModule: (id: DockPanelId) => void
  /** Whether a launcher module currently has an open tab. */
  isModuleOpen: (id: DockPanelId) => boolean
  onFocusPanel: (id: string) => void
```

Add the `DockPanelId` import at the top of the file (it is not currently imported). Update the existing import from `dock-layout-helpers` — note this file lives at `src/renderer/components/editor/`, so the hooks path is `../../hooks/...`:

```ts
import type { DockPanelId } from '../../hooks/dock-layout-helpers'
```

- [ ] **Step 2: Verify the type change fails compilation in test mocks**

Run: `npm run typecheck`
Expected: FAIL — the five `DockAppState` mock literals are missing `onOpenModule` / `isModuleOpen`.

- [ ] **Step 3: Update each mock literal**

In each of these files, find the object that already sets `onClosePanel`/`onFocusPanel` and add the two fields next to them:

```ts
    onOpenModule: vi.fn(),
    isModuleOpen: () => false,
```

Files and anchor lines:
- `src/renderer/DockTab.test.tsx` (near line 81 — `onClosePanel: () => {}`; use `onOpenModule: () => {}` / `isModuleOpen: () => false` to match its non-`vi.fn` style)
- `src/renderer/components/search/SearchPanel.test.tsx` (near line 247)
- `src/renderer/components/editor/dock-panels.test.tsx` (near line 136)
- `src/renderer/components/background-agent/BackgroundAgentPanel.test.tsx` (near line 275)
- `src/renderer/components/editor/EditorHeaderActions.test.tsx` (near line 78)

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: PASS (App.tsx is wired in Task 4; if typecheck still flags App.tsx for missing fields, that's expected until Task 4 — do Task 4 Step 1 in the same commit if needed). To keep this commit green, also apply Task 4 Step 1 now (it's a 2-line addition to App's `dockState` literal).

- [ ] **Step 5: Wire App.tsx `dockState` (also needed for green typecheck)**

In `src/renderer/App.tsx`, in the `dockState` object literal, just after `onClosePanel: editorHandlers.handleClosePanel,` (line 261) add:

```ts
    onOpenModule: (id) => {
      if (dockLayout.isPanelVisible(id)) dockLayout.focusPanel(id)
      else dockLayout.togglePanel(id)
    },
    isModuleOpen: dockLayout.isPanelVisible,
```

- [ ] **Step 6: Run affected tests + typecheck**

Run: `npm run typecheck && npx vitest run src/renderer/DockTab.test.tsx src/renderer/components/editor/EditorHeaderActions.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/editor/dock-panel-types.ts src/renderer/App.tsx src/renderer/DockTab.test.tsx src/renderer/components/search/SearchPanel.test.tsx src/renderer/components/editor/dock-panels.test.tsx src/renderer/components/background-agent/BackgroundAgentPanel.test.tsx src/renderer/components/editor/EditorHeaderActions.test.tsx
git commit -m "feat: add onOpenModule/isModuleOpen to dock state"
```

---

## Task 4: ModuleLauncher component

A "+" button that lists the registry modules. Open modules show a leading "✓" and clicking focuses them; closed modules open as a tab. Reuses `ActionMenuButton`.

**Files:**
- Create: `src/renderer/components/editor/ModuleLauncher.tsx`
- Test: `src/renderer/components/editor/ModuleLauncher.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/editor/ModuleLauncher.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModuleLauncher } from './ModuleLauncher'
import { DockStateContext } from './dock-panel-types'
import type { DockAppState } from './dock-panel-types'

function renderWithState(overrides: Partial<DockAppState>) {
  const state = {
    onOpenModule: vi.fn(),
    isModuleOpen: () => false,
    ...overrides,
  } as unknown as DockAppState
  render(
    <DockStateContext.Provider value={state}>
      <ModuleLauncher />
    </DockStateContext.Provider>,
  )
  return state
}

describe('ModuleLauncher', () => {
  it('lists all four modules in the menu', () => {
    renderWithState({})
    fireEvent.click(screen.getByRole('button', { name: /open module/i }))
    for (const label of ['Ideas', 'Loop', 'Verdicts', 'Watch']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it('opens a module on click', () => {
    const state = renderWithState({})
    fireEvent.click(screen.getByRole('button', { name: /open module/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Watch/ }))
    expect(state.onOpenModule).toHaveBeenCalledWith('watch')
  })

  it('marks open modules with a check', () => {
    renderWithState({ isModuleOpen: (id) => id === 'loop' })
    fireEvent.click(screen.getByRole('button', { name: /open module/i }))
    expect(screen.getByRole('menuitem', { name: /✓ Loop/ })).toBeInTheDocument()
  })

  it('renders nothing without dock state', () => {
    const { container } = render(<ModuleLauncher />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/editor/ModuleLauncher.test.tsx`
Expected: FAIL — cannot find module `./ModuleLauncher`.

- [ ] **Step 3: Implement the component**

```tsx
// src/renderer/components/editor/ModuleLauncher.tsx
import React from 'react'
import { ActionMenuButton, type ActionMenuButtonItem } from './ActionMenuButton'
import { DockStateContext } from './dock-panel-types'
import { PANEL_TITLES } from '../../hooks/dock-layout-helpers'
import { LAUNCHER_MODULES } from '../../modules/launcher-modules'

function PlusIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 2.2V9.8M2.2 6H9.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function ModuleLauncher(): React.JSX.Element | null {
  const state = React.useContext(DockStateContext)
  if (!state) return null

  const items: ActionMenuButtonItem[] = LAUNCHER_MODULES.map((mod) => {
    const open = state.isModuleOpen(mod.id)
    return {
      id: mod.id,
      label: `${open ? '✓ ' : ''}${PANEL_TITLES[mod.id]}`,
      description: mod.description,
      action: () => state.onOpenModule(mod.id),
    }
  })

  return (
    <ActionMenuButton
      buttonLabel={<PlusIcon />}
      title="Open module"
      menuLabel="Modules"
      items={items}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/components/editor/ModuleLauncher.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/editor/ModuleLauncher.tsx src/renderer/components/editor/ModuleLauncher.test.tsx
git commit -m "feat: add ModuleLauncher dropdown"
```

---

## Task 5: Mount the launcher in the tab strip

Dockview accepts one `rightHeaderActionsComponent` per group. Compose the existing `EditorHeaderActions` with the launcher in a new `WorkspaceHeaderActions`, and render the launcher only for the group that owns the `agent` panel (the main workspace group), so it sits at the end of the workspace tab strip and appears exactly once.

**Files:**
- Create: `src/renderer/components/editor/WorkspaceHeaderActions.tsx`
- Modify: `src/renderer/AppShell.tsx:8` (import) and `:136` (prop)
- Test: `src/renderer/components/editor/WorkspaceHeaderActions.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/editor/WorkspaceHeaderActions.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WorkspaceHeaderActions } from './WorkspaceHeaderActions'
import { DockStateContext } from './dock-panel-types'
import type { DockAppState } from './dock-panel-types'
import type { IDockviewHeaderActionsProps } from 'dockview'

const state = {
  onOpenModule: () => {},
  isModuleOpen: () => false,
  editorPaneIds: [],
} as unknown as DockAppState

function props(panelIds: string[]): IDockviewHeaderActionsProps {
  return { panels: panelIds.map((id) => ({ id })) } as unknown as IDockviewHeaderActionsProps
}

describe('WorkspaceHeaderActions', () => {
  it('shows the launcher for the group that owns the agent panel', () => {
    render(
      <DockStateContext.Provider value={state}>
        <WorkspaceHeaderActions {...props(['agent', 'editor'])} />
      </DockStateContext.Provider>,
    )
    expect(screen.getByRole('button', { name: /open module/i })).toBeInTheDocument()
  })

  it('hides the launcher for groups without the agent panel', () => {
    render(
      <DockStateContext.Provider value={state}>
        <WorkspaceHeaderActions {...props(['fileTree', 'modifiedFiles'])} />
      </DockStateContext.Provider>,
    )
    expect(screen.queryByRole('button', { name: /open module/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/editor/WorkspaceHeaderActions.test.tsx`
Expected: FAIL — cannot find module `./WorkspaceHeaderActions`.

- [ ] **Step 3: Implement the composing component**

```tsx
// src/renderer/components/editor/WorkspaceHeaderActions.tsx
import React from 'react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { EditorHeaderActions } from './EditorHeaderActions'
import { ModuleLauncher } from './ModuleLauncher'

/** Right-side header actions for every dock group: the editor pane/mode
 *  actions (which self-gate to editor panes) plus the module launcher,
 *  shown only in the group that owns the `agent` panel so it renders once
 *  at the end of the main workspace tab strip. */
export function WorkspaceHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element {
  const ownsAgent = props.panels.some((panel) => panel.id === 'agent')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <EditorHeaderActions {...props} />
      {ownsAgent && <ModuleLauncher />}
    </div>
  )
}
```

- [ ] **Step 4: Wire it into AppShell**

In `src/renderer/AppShell.tsx`, replace the `EditorHeaderActions` import (line 8):

```tsx
import { WorkspaceHeaderActions } from './components/editor/WorkspaceHeaderActions'
```

And change the Dockview prop (line 136) from `rightHeaderActionsComponent={EditorHeaderActions}` to:

```tsx
              rightHeaderActionsComponent={WorkspaceHeaderActions}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm run typecheck && npx vitest run src/renderer/components/editor/WorkspaceHeaderActions.test.tsx`
Expected: PASS. (`EditorHeaderActions` is still imported by `WorkspaceHeaderActions`, so no orphaned import.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/editor/WorkspaceHeaderActions.tsx src/renderer/components/editor/WorkspaceHeaderActions.test.tsx src/renderer/AppShell.tsx
git commit -m "feat: mount module launcher at end of workspace tab strip"
```

---

## Task 6: Remove the open guards for Ideas/Loop

`togglePanel` currently refuses to open `backgroundAgent`/`loop` unless their flags are set (`dock-layout-actions.ts:57-58`). The launcher must be able to open them regardless, so remove the guards. (Verdicts and Watch have no such guard.)

**Files:**
- Modify: `src/renderer/hooks/dock-layout-actions.ts:54-58`

- [ ] **Step 1: Remove the two guard lines**

In `src/renderer/hooks/dock-layout-actions.ts`, delete lines 57–58 inside `togglePanel`:

```ts
    if (id === 'backgroundAgent' && !ctx.showIdeasTabRef.current) return
    if (id === 'loop' && !ctx.showLoopTabRef.current) return
```

So the start of `togglePanel` becomes:

```ts
  const togglePanel = useCallback((id: DockPanelId): void => {
    const api = ctx.apiRef.current
    if (!api) return

    if (id === 'editor') {
```

- [ ] **Step 2: Verify nothing else references those refs here**

Run: `git grep -n "showIdeasTabRef\|showLoopTabRef" src/renderer/hooks/dock-layout-actions.ts`
Expected: no output (the only references are removed). The refs themselves are removed in Task 8.

- [ ] **Step 3: Run the dock action / layout tests**

Run: `npx vitest run src/renderer/hooks/dock-layout-builders.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/dock-layout-actions.ts
git commit -m "feat: allow launcher to open Ideas/Loop without flags"
```

---

## Task 7: Retire the Settings workspace checkboxes

Remove `showIdeasTab` / `showLoopTab` / `showVerdictsTab` from the settings model and UI. (`showWatchTab` was never a setting.)

**Files:**
- Modify: `src/shared/types.ts:88-90`
- Modify: `src/shared/defaults.ts:9-11`
- Modify: `src/renderer/components/modals/SettingsModal.tsx`
- Modify: `src/renderer/components/modals/settings/SettingsModalBody.tsx`
- Modify: `src/renderer/components/modals/settings/GeneralSettingsSection.tsx`
- Modify (tests): `src/renderer/components/modals/SettingsModal.test.tsx:114,204`, `src/main/store/settings-store.test.ts:114`

- [ ] **Step 1: Update the SettingsModal test first (drives the change)**

In `src/renderer/components/modals/SettingsModal.test.tsx`:
- Remove the `showIdeasTab: false,` line from the settings fixture (line ~114).
- Replace the assertion at line ~204 (`expect.objectContaining({ showIdeasTab: true })`) with an assertion on a field that still exists, e.g.:

```tsx
      expect.objectContaining({ defaultRuntime: expect.any(String) }),
```

(If that test specifically asserted the Ideas checkbox toggles, remove the test body that clicks "Show Ideas tab" — that control no longer exists. Read the surrounding `it(...)` block and delete the now-meaningless case rather than leaving a dangling click on a missing element.)

- [ ] **Step 2: Remove from the type**

In `src/shared/types.ts`, delete these three lines from `ManifoldSettings` (lines 88–90):

```ts
  showIdeasTab: boolean
  showLoopTab: boolean
  showVerdictsTab: boolean
```

- [ ] **Step 3: Remove from defaults**

In `src/shared/defaults.ts`, delete these three lines (9–11):

```ts
  showIdeasTab: false,
  showLoopTab: false,
  showVerdictsTab: false,
```

- [ ] **Step 4: Remove from the settings store test**

In `src/main/store/settings-store.test.ts`, delete the assertion at line ~114:

```ts
      expect(settings.showIdeasTab).toBe(false)
```

(If it's the only assertion in its `it(...)`, replace it with an assertion on a surviving default such as `expect(settings.defaultBaseBranch).toBe('main')`. Read the block before editing.)

- [ ] **Step 5: Remove from SettingsModal.tsx**

In `src/renderer/components/modals/SettingsModal.tsx`, remove:
- State (lines 20–22): the three `useState` lines for `showIdeasTab`/`showLoopTab`/`showVerdictsTab`.
- Reset effect (lines 53–55): the three `setShow...Tab(settings....)` lines.
- `onSave` payload (lines 85–87): the three keys `showIdeasTab, showLoopTab, showVerdictsTab,`.
- `handleSave` dependency array (line 104): remove `showIdeasTab, showLoopTab, showVerdictsTab,`.
- Body props (lines 130–131, 137–140): remove `showIdeasTab={...}`, `showLoopTab={...}`, `onShowIdeasTabChange={...}`, `onShowLoopTabChange={...}`, `showVerdictsTab={...}`, `onShowVerdictsTabChange={...}`.

- [ ] **Step 6: Remove from SettingsModalBody.tsx**

In `src/renderer/components/modals/settings/SettingsModalBody.tsx`:
- Remove `showIdeasTab`, `showLoopTab`, `showVerdictsTab` and their `onShow*TabChange` from the props interface (around line 27 and the matching change-handler lines).
- Remove the same names from where `SettingsModalBody` forwards props down to `GeneralSettingsSection`.

Run `git grep -n "ShowIdeasTab\|ShowLoopTab\|ShowVerdictsTab\|showIdeasTab\|showLoopTab\|showVerdictsTab" src/renderer/components/modals/settings/SettingsModalBody.tsx` and remove every match (interface members and JSX pass-through).

- [ ] **Step 7: Remove the checkboxes from GeneralSettingsSection.tsx**

In `src/renderer/components/modals/settings/GeneralSettingsSection.tsx`:
- Remove the three `<label>…</label>` checkbox blocks (lines 86–100): "Show Ideas tab", "Show Loop tab", "Show Verdicts tab".
- Remove the corresponding members from the component's props interface (e.g. `showIdeasTab`, `onShowIdeasTabChange`, and the Loop/Verdicts equivalents around line 13+).

Run `git grep -n "ShowIdeasTab\|ShowLoopTab\|ShowVerdictsTab\|showIdeasTab\|showLoopTab\|showVerdictsTab" src/renderer/components/modals/settings/GeneralSettingsSection.tsx` and confirm zero matches afterward.

- [ ] **Step 8: Verify the whole settings surface is clean**

Run: `git grep -n "showIdeasTab\|showLoopTab\|showVerdictsTab"`
Expected: only matches now are in `src/renderer/hooks/*` (handled in Task 8) and the verdicts dashboard plan doc under `docs/` (historical, leave it). No matches in `src/shared`, `src/main`, or `src/renderer/components/modals`.

- [ ] **Step 9: Run settings tests + typecheck**

Run: `npm run typecheck && npx vitest run src/renderer/components/modals/SettingsModal.test.tsx src/main/store/settings-store.test.ts`
Expected: PASS. (Typecheck will still flag `src/renderer/hooks` + `App.tsx` references — those are removed in Task 8. If executing tasks strictly green-per-commit, combine Task 7 and Task 8 into a single commit; they form one coherent removal.)

- [ ] **Step 10: Commit (with Task 8 if keeping every commit green)**

```bash
git add src/shared/types.ts src/shared/defaults.ts src/renderer/components/modals/SettingsModal.tsx src/renderer/components/modals/settings/SettingsModalBody.tsx src/renderer/components/modals/settings/GeneralSettingsSection.tsx src/renderer/components/modals/SettingsModal.test.tsx src/main/store/settings-store.test.ts
git commit -m "feat: retire Settings workspace module checkboxes"
```

---

## Task 8: Retire the flags from the dock-layout plumbing

Drop the four flag params and stop gating modules: they're no longer added to the default layout, no longer force-hidden on load, and no longer reconciled. `hiddenPanels` (the StatusBar reopen list) now excludes launcher modules so the launcher is their single door.

**Files:**
- Modify: `src/renderer/hooks/useDockLayout.ts`
- Modify: `src/renderer/hooks/dock-layout-context.ts:14-17`
- Modify: `src/renderer/hooks/dock-layout-builders.ts`
- Modify: `src/renderer/hooks/dock-layout-builders.test.ts`
- Modify: `src/renderer/hooks/dock-layout-tabs.ts`
- Modify: `src/renderer/App.tsx:75`

- [ ] **Step 1: Update the default-layout test first**

Replace `src/renderer/hooks/dock-layout-builders.test.ts` cases that call `applyDefaultLayout(api, { showIdeasTab, ... })` so they call the new no-options signature and assert the four modules are NOT added. Read the file, then change the two invocations (lines ~35 and ~51) to:

```ts
    applyDefaultLayout(api as never)
```

Add an assertion in at least one case that optional modules are absent. The builder uses `api.addPanel`; assert it was never called with a module id. For example, if the test spies on `addPanel`:

```ts
    const addedIds = (api.addPanel as Mock).mock.calls.map((c) => c[0].id)
    expect(addedIds).not.toContain('watch')
    expect(addedIds).not.toContain('backgroundAgent')
    expect(addedIds).toEqual(expect.arrayContaining(['projects', 'agent', 'fileTree', 'modifiedFiles']))
```

(Match the file's existing spy/mocking style — read it first and mirror how `api` is faked.)

- [ ] **Step 2: Simplify `applyDefaultLayout`**

Rewrite `src/renderer/hooks/dock-layout-builders.ts` lines 8–67 so it takes no options and adds only the core panels. Replace the `DefaultLayoutOptions` interface and the function header + the four `if (options.show...)` blocks. New top of file through the files panel:

```ts
import type { DockviewApi, SerializedDockview } from 'dockview'
import {
  PANEL_TITLES,
  isEditorPanelId,
  parseEditorPanelOrder,
} from './dock-layout-helpers'

export function applyDefaultLayout(api: DockviewApi): void {
  const projectsPanel = api.addPanel({
    id: 'projects',
    component: 'projects',
    title: PANEL_TITLES.projects,
  })

  api.addPanel({
    id: 'agent',
    component: 'agent',
    title: PANEL_TITLES.agent,
    position: { referencePanel: projectsPanel, direction: 'right' },
  })

  const filesPanel = api.addPanel({
    id: 'fileTree',
    component: 'fileTree',
    title: PANEL_TITLES.fileTree,
    position: { referencePanel: 'agent', direction: 'right' },
  })

  api.addPanel({
    id: 'modifiedFiles',
    component: 'modifiedFiles',
    title: PANEL_TITLES.modifiedFiles,
    position: { referencePanel: filesPanel, direction: 'within' },
  })

  filesPanel.api.setActive()
```

Leave the grid-ratio patching block (old lines 85–100) and the rest of the file unchanged. The `DefaultLayoutOptions` interface (old lines 8–13) is deleted.

- [ ] **Step 3: Drop the flags from `useDockLayout`**

In `src/renderer/hooks/useDockLayout.ts`:

- Signature (lines 49–56) → drop the four flag params:

```ts
export function useDockLayout(
  sessionId: string | null,
  liveSessions: AgentSession[] = [],
): UseDockLayoutResult {
```

- Remove the four refs + their `.current =` assignments (lines 60–63 and 68–71).
- Remove `showIdeasTabRef`, `showLoopTabRef`, `showVerdictsTabRef`, `showWatchTabRef` from the `ctx` object (lines 124–127).
- `buildDefaultLayout` (line 118) → `const buildDefaultLayout = useCallback((api: DockviewApi) => applyDefaultLayout(api), [])`.
- Remove the four `previousShow*TabRef` + `useTabVisibilityEffect(...)` calls (lines 228–235).
- Remove the now-unused import `useTabVisibilityEffect` from the `./dock-layout-tabs` import (line 18) — keep `reconcileLayoutAfterLoad`.
- Rebuild `hiddenPanels` (lines 237–241) to exclude launcher modules, importing the id set:

```ts
  const hiddenPanels = PANEL_IDS
    .filter((id) => !LAUNCHER_MODULE_IDS.has(id))
    .filter((id) => !isPanelVisible(id)) as DockPanelId[]
```

Add the import near the top of `useDockLayout.ts`:

```ts
import { LAUNCHER_MODULE_IDS } from '../modules/launcher-modules'
```

- [ ] **Step 4: Drop the refs from the context type**

In `src/renderer/hooks/dock-layout-context.ts`, delete these four fields (lines 14–17):

```ts
  showIdeasTabRef: MutableRefObject<boolean>
  showLoopTabRef: MutableRefObject<boolean>
  showVerdictsTabRef: MutableRefObject<boolean>
  showWatchTabRef: MutableRefObject<boolean>
```

- [ ] **Step 5: Simplify `dock-layout-tabs.ts`**

The four-module reconcile calls and the `applyTabSetting` / `useTabVisibilityEffect` helpers are now dead. Replace `src/renderer/hooks/dock-layout-tabs.ts` entirely with the reduced version (keeps only `reconcileLayoutAfterLoad`, minus the four module calls):

```ts
import type { DockviewApi } from 'dockview'
import { getSidebarWidths } from './dock-layout-helpers'
import { ensureSearchPanelInWorkspace } from './dock-layout-search'
import type { DockLayoutCtx } from './dock-layout-context'

/**
 * After a layout load/build, ensure the search panel is present and bump the
 * version counters. Optional modules (Ideas/Loop/Verdicts/Watch) are no longer
 * gated here — they persist in the saved layout and are opened on demand from
 * the tab-strip launcher.
 */
export function reconcileLayoutAfterLoad(api: DockviewApi, ctx: DockLayoutCtx): void {
  ctx.syncPanels(api)
  ctx.sidebarWidthsRef.current = getSidebarWidths(api)
  if (ensureSearchPanelInWorkspace(api, ctx.editorPanelIdsRef.current)) {
    ctx.lastLayoutRef.current = api.toJSON()
    ctx.saveLayout()
  }
  ctx.bumpVersion()
  ctx.bumpReloadVersion()
}
```

(If a `dock-layout-tabs.test.ts` exists, run it; the grep showed none. If `applyTabSetting`/`useTabVisibilityEffect` are imported anywhere besides `useDockLayout.ts`, run `git grep -n "applyTabSetting\|useTabVisibilityEffect"` and clean up — expected only the now-removed `useDockLayout` usage.)

- [ ] **Step 6: Update the App call site**

In `src/renderer/App.tsx` line 75, change:

```ts
  const dockLayout = useDockLayout(dockLayoutKey, activeProjectSessions)
```

- [ ] **Step 7: Verify no stale references remain**

Run: `git grep -n "showIdeasTab\|showLoopTab\|showVerdictsTab\|showWatchTab\|applyTabSetting\|useTabVisibilityEffect"`
Expected: matches only in `docs/` (historical plan). Zero in `src/`.

- [ ] **Step 8: Run full typecheck + targeted tests**

Run: `npm run typecheck && npx vitest run src/renderer/hooks/dock-layout-builders.test.ts src/renderer/components/git/StatusBar.test.tsx src/renderer/hooks/useAppEffects.test.ts`
Expected: PASS. (StatusBar tests use `mockDockLayout({ hiddenPanels: [...] })` and don't depend on the flags, so they stay green; the `hiddenPanels` shape is unchanged.)

- [ ] **Step 9: Commit**

```bash
git add src/renderer/hooks/useDockLayout.ts src/renderer/hooks/dock-layout-context.ts src/renderer/hooks/dock-layout-builders.ts src/renderer/hooks/dock-layout-builders.test.ts src/renderer/hooks/dock-layout-tabs.ts src/renderer/App.tsx
git commit -m "feat: retire module-gating flags from dock layout"
```

---

## Task 9: Full suite + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS, no type errors. (`npm test` rebuilds `better-sqlite3` for Node via `pretest`.)

- [ ] **Step 2: Launch the app**

Run: `npm run dev`
Expected: app boots, no console errors about missing settings keys or unregistered panels.

- [ ] **Step 3: Manually verify the launcher (success criteria)**

With a project + active agent session:
- A "+" button appears at the right end of the main (agent) tab strip, and only there (not on the Files group).
- Clicking it shows a menu of four modules — Ideas, Loop, Verdicts, Watch — each with a description.
- Clicking **Watch** opens a Watch tab next to the agent; reopening the menu shows "✓ Watch".
- Clicking "✓ Watch" again focuses the existing Watch tab (does not duplicate it).
- Closing the Watch tab (its × ) removes it; the menu shows "Watch" again (no check).
- Repeat for Ideas, Loop, Verdicts — each opens, persists, and closes.
- Switch to another session and back: an opened module's tab is remembered for that session (per-session stickiness).
- Open Settings → General: the "Show Ideas/Loop/Verdicts tab" checkboxes are gone.
- Default new session: starts without any of the four modules; they appear only after launching.

- [ ] **Step 4: Verify in superagent mode**

Enter a superagent: the "+" launcher still appears on the superagent/agent group and can open modules. (Watch no longer auto-appears — this is the intended change.)

- [ ] **Step 5: Final commit if any verification fixes were needed**

```bash
git add -A
git commit -m "fix: address module launcher verification findings"
```

(Skip if Step 1–4 passed clean.)

---

## Self-Review

**Spec coverage:**
- Persistent "+" launcher at end of tab strip → Tasks 4–5 (`ModuleLauncher` + `WorkspaceHeaderActions`, mounted as `rightHeaderActionsComponent`, gated to the agent group).
- Lists all modules incl. future ones via a registry → Task 1 (`launcher-modules.ts`; future modules = one entry).
- Sticky tab; closing returns to launcher → relies on existing per-session saved layout + `togglePanel`/`focusPanel` (Task 3 wiring, Task 6 guard removal, Task 8 stops force-hiding).
- Retire Settings checkboxes → Task 7.
- Fold Watch in like the others / remove auto-appear → Task 8 (drops `showWatchTab = !activeSuperagentId` and default-layout add).
- No double door (StatusBar reopen vs launcher) → Task 8 Step 3 excludes launcher modules from `hiddenPanels`.

**Placeholder scan:** No "TBD"/"add error handling"/"similar to" — every code step has concrete code or an exact line reference. Two steps ("remove the matching pass-through in SettingsModalBody/GeneralSettingsSection") use a `git grep` sweep because the exact secondary lines weren't quoted; each names the precise pattern to remove and an after-check asserting zero matches.

**Type consistency:**
- `onOpenModule(id: DockPanelId)` / `isModuleOpen(id: DockPanelId)` — defined in `dock-panel-types.ts` (Task 3), consumed in `ModuleLauncher` (Task 4) and `App.tsx` (Task 3 Step 5), mocked in tests with matching signatures.
- `ActionMenuButtonItem.description?: string` — added in Task 2, set in Task 4.
- `applyDefaultLayout(api)` no-arg signature — Task 2-of-builders consistent between `dock-layout-builders.ts`, its test, and `useDockLayout.buildDefaultLayout`.
- `LAUNCHER_MODULE_IDS` / `LAUNCHER_MODULES` — defined Task 1, consumed in `useDockLayout` (Task 8) and `ModuleLauncher` (Task 4); both import from `../modules/launcher-modules`.
- `PANEL_TITLES` import paths differ by directory depth: `../hooks/dock-layout-helpers` from `components/editor/*`, `./dock-layout-helpers` within `hooks/*` — both spelled correctly per file location.
