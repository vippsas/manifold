# Manifold Plugins — Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Manifold's hardcoded "+ Apps" launcher module list with a contribution registry, registering the four built-in modules (Ideas / Loop / Verdicts / Watch) as **internal contributions** — with zero behavior change — establishing the seam that Phase 1 plugins plug into.

**Architecture:** A shared `PanelContribution` type; a renderer-side **contribution registry** seeded with the four internal modules (each carrying its existing React component); the existing launcher data (`LAUNCHER_MODULES` / `LAUNCHER_MODULE_IDS`) and the dock panel component map (`PANEL_COMPONENTS`) become **derived from the registry** rather than hardcoded. No process, IPC, or extension-host changes — those are Phase 1.

**Tech Stack:** TypeScript, React 18, Electron renderer, Vitest (jsdom). No new dependencies.

---

## Scope Note (deviation from spec §13)

The design spec's Phase 0 mentioned a main-process `PluginManager` that scans a built-in directory. That scanner has **nothing to load** until Phase 1 introduces the extension host and a real external plugin, so it is **deferred to Phase 1** where it is actually exercised. Phase 0 is intentionally renderer-only: it is independently shippable, fully testable, and changes no observable behavior. This keeps each phase a working, verifiable increment (and keeps the change surgical, per the repo's `CLAUDE.md`).

## File Structure

**Create:**
- `src/shared/plugins/contributions.ts` — shared `PanelContribution` / `ContributionSource` types (reused by main + host in Phase 1).
- `src/renderer/plugins/internal-contributions.ts` — `INTERNAL_PANELS`: the four built-in modules as data + their React components.
- `src/renderer/plugins/internal-contributions.test.ts` — unit test for the internal seed.
- `src/renderer/plugins/contribution-registry.ts` — the registry (seed, register, getters).
- `src/renderer/plugins/contribution-registry.test.ts` — unit test for the registry.
- `src/renderer/components/editor/dock-panels.contributions.test.tsx` — guard test that `PANEL_COMPONENTS` still wires the right components after the refactor.

**Modify:**
- `src/renderer/modules/launcher-modules.ts` — derive `LAUNCHER_MODULES` / `LAUNCHER_MODULE_IDS` from the registry (public exports + types unchanged, so `ModuleLauncher.tsx` and `useDockLayout.ts` need no edits).
- `src/renderer/components/editor/dock-panels.tsx` — source the four module entries of `PANEL_COMPONENTS` from the registry instead of importing them directly.

**Unchanged (consumers that keep working by construction):**
- `src/renderer/components/editor/ModuleLauncher.tsx` (still reads `LAUNCHER_MODULES`).
- `src/renderer/hooks/useDockLayout.ts` (still reads `LAUNCHER_MODULE_IDS`).
- `src/renderer/AppShell.tsx` (still passes `PANEL_COMPONENTS` to dockview).
- `src/renderer/modules/launcher-modules.test.ts` (regression guard — must stay green).

### Dependency direction (no runtime import cycle)

`shared/plugins/contributions.ts` ← `internal-contributions.ts` ← `contribution-registry.ts` ← (`launcher-modules.ts`, `dock-panels.tsx`). `internal-contributions.ts` does **not** import the registry, so there is no cycle.

### Test command note

Use targeted runs to avoid the `better-sqlite3` rebuild that `npm test` triggers:
`npx vitest run <path>`. Run the full suite with `npm test` only in the final verification task.

---

### Task 1: Shared contribution types

**Files:**
- Create: `src/shared/plugins/contributions.ts`

This is a pure type declaration (no runtime behavior), so it is verified by the type checker rather than a unit test.

- [ ] **Step 1: Create the types file**

```ts
// src/shared/plugins/contributions.ts
/**
 * Declarative descriptions of what a plugin (or a built-in module) contributes
 * to Manifold's UI. Modeled on VS Code's `contributes`, renamed for Manifold.
 *
 * Shared across the main process, the (future) extension host, and the renderer
 * so all three agree on the shape. Phase 0 uses only `PanelContribution`.
 */

/** Where a contribution originates. */
export type ContributionSource = 'internal' | 'plugin'

/**
 * A panel/view a module contributes. Internal (built-in) modules map to an
 * existing dock panel; plugins (Phase 1) map to a webview panel.
 */
export interface PanelContribution {
  /** Stable view id. Internal modules reuse their existing dock panel id. */
  id: string
  /** Title shown in the "+ Apps" launcher and the panel tab. */
  title: string
  /** One-line description shown in the "+ Apps" launcher menu. */
  description: string
  /** Whether the panel appears in the "+ Apps" launcher menu. */
  launcher: boolean
  /** Origin of the contribution. */
  source: ContributionSource
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run typecheck:node && npm run typecheck:web`
Expected: both pass (the file is compiled by the shared project in each).

- [ ] **Step 3: Commit**

```bash
git add src/shared/plugins/contributions.ts
git commit -m "feat(plugins): add shared PanelContribution types"
```

---

### Task 2: Internal contributions (the four built-in modules as data)

**Files:**
- Create: `src/renderer/plugins/internal-contributions.ts`
- Test: `src/renderer/plugins/internal-contributions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/plugins/internal-contributions.test.ts
import { describe, expect, it } from 'vitest'
import { INTERNAL_PANELS } from './internal-contributions'

describe('INTERNAL_PANELS', () => {
  it('lists the four built-in modules in launcher order', () => {
    expect(INTERNAL_PANELS.map((p) => p.id)).toEqual([
      'backgroundAgent', 'loop', 'verdicts', 'watch',
    ])
  })

  it('marks every entry as an internal launcher panel with a renderable component', () => {
    for (const p of INTERNAL_PANELS) {
      expect(p.source).toBe('internal')
      expect(p.launcher).toBe(true)
      expect(p.title.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
      expect(typeof p.component).toBe('function')
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/plugins/internal-contributions.test.ts`
Expected: FAIL — cannot resolve `./internal-contributions`.

- [ ] **Step 3: Create the implementation**

```ts
// src/renderer/plugins/internal-contributions.ts
import type React from 'react'
import type { PanelContribution } from '../../shared/plugins/contributions'
import { PANEL_TITLES } from '../hooks/dock-layout-helpers'
import { BackgroundAgentPanel } from '../components/background-agent/BackgroundAgentPanel'
import { LoopPanel } from '../components/loop/LoopPanel'
import { VerdictsPanel } from '../components/verdicts/VerdictsPanel'
import { WatchPanel } from '../components/watch/WatchPanel'

/** An internal (built-in) panel contribution: a PanelContribution plus the
 *  renderer component that draws it. Plugin contributions (Phase 1) render via a
 *  webview instead and carry no component. */
export interface InternalPanel extends PanelContribution {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.FC<any>
}

/** The four built-in modules formerly hardcoded in launcher-modules.ts and
 *  dock-panels.tsx. Array order defines their order in the "+ Apps" menu.
 *  Titles are sourced from PANEL_TITLES so titles stay in one place. */
export const INTERNAL_PANELS: InternalPanel[] = [
  {
    id: 'backgroundAgent',
    title: PANEL_TITLES.backgroundAgent,
    description: 'Experimental project ideas feed.',
    launcher: true,
    source: 'internal',
    component: BackgroundAgentPanel,
  },
  {
    id: 'loop',
    title: PANEL_TITLES.loop,
    description: 'Autoresearch loop: edit → eval → keep-or-discard.',
    launcher: true,
    source: 'internal',
    component: LoopPanel,
  },
  {
    id: 'verdicts',
    title: PANEL_TITLES.verdicts,
    description: 'Per-runtime quality metrics and recent sessions.',
    launcher: true,
    source: 'internal',
    component: VerdictsPanel,
  },
  {
    id: 'watch',
    title: PANEL_TITLES.watch,
    description: 'Analyze a video with its transcript and extracted frames.',
    launcher: true,
    source: 'internal',
    component: WatchPanel,
  },
]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/plugins/internal-contributions.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/plugins/internal-contributions.ts src/renderer/plugins/internal-contributions.test.ts
git commit -m "feat(plugins): declare the four built-in modules as internal contributions"
```

---

### Task 3: Contribution registry

**Files:**
- Create: `src/renderer/plugins/contribution-registry.ts`
- Test: `src/renderer/plugins/contribution-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/plugins/contribution-registry.test.ts
import { describe, expect, it, afterEach } from 'vitest'
import {
  getLauncherContributions,
  getLauncherContributionIds,
  getPanelComponents,
  getPanelContributions,
  registerPanelContribution,
  resetToInternal,
} from './contribution-registry'

afterEach(() => resetToInternal())

describe('contribution-registry', () => {
  it('is seeded with the four internal launcher modules in order', () => {
    expect(getLauncherContributions().map((p) => p.id)).toEqual([
      'backgroundAgent', 'loop', 'verdicts', 'watch',
    ])
  })

  it('exposes launcher ids as a set', () => {
    expect([...getLauncherContributionIds()].sort()).toEqual(
      ['backgroundAgent', 'loop', 'verdicts', 'watch'],
    )
  })

  it('returns a component for each internal panel', () => {
    const components = getPanelComponents()
    for (const id of ['backgroundAgent', 'loop', 'verdicts', 'watch']) {
      expect(typeof components[id]).toBe('function')
    }
  })

  it('lets a plugin register a launcher contribution without a component', () => {
    registerPanelContribution({
      id: 'example.hello',
      title: 'Hello',
      description: 'An example plugin panel.',
      launcher: true,
      source: 'plugin',
    })
    expect(getLauncherContributions().map((p) => p.id)).toContain('example.hello')
    expect(getPanelComponents()['example.hello']).toBeUndefined()
    expect(getPanelContributions().some((p) => p.id === 'example.hello')).toBe(true)
  })

  it('resets back to just the internal contributions', () => {
    registerPanelContribution({
      id: 'example.hello', title: 'Hello', description: 'x', launcher: true, source: 'plugin',
    })
    resetToInternal()
    expect(getLauncherContributions().map((p) => p.id)).toEqual([
      'backgroundAgent', 'loop', 'verdicts', 'watch',
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/plugins/contribution-registry.test.ts`
Expected: FAIL — cannot resolve `./contribution-registry`.

- [ ] **Step 3: Create the implementation**

```ts
// src/renderer/plugins/contribution-registry.ts
import type React from 'react'
import type { PanelContribution } from '../../shared/plugins/contributions'
import { INTERNAL_PANELS } from './internal-contributions'

/** A panel contribution as held by the registry. Internal contributions carry a
 *  renderer component; plugin contributions (Phase 1) resolve to a webview and
 *  leave `component` undefined. */
export interface RegisteredPanel extends PanelContribution {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component?: React.FC<any>
}

/** id → contribution. Map insertion order is preserved and defines launcher order. */
const panels = new Map<string, RegisteredPanel>()

function seed(): void {
  panels.clear()
  for (const panel of INTERNAL_PANELS) panels.set(panel.id, panel)
}
seed()

/** Add (or replace) a panel contribution. Phase 1 plugins call this at activation. */
export function registerPanelContribution(panel: RegisteredPanel): void {
  panels.set(panel.id, panel)
}

/** All registered panel contributions, in registration order. */
export function getPanelContributions(): RegisteredPanel[] {
  return [...panels.values()]
}

/** Contributions that should appear in the "+ Apps" launcher. */
export function getLauncherContributions(): RegisteredPanel[] {
  return [...panels.values()].filter((p) => p.launcher)
}

/** The set of launcher panel ids. */
export function getLauncherContributionIds(): Set<string> {
  return new Set(getLauncherContributions().map((p) => p.id))
}

/** id → renderer component, for contributions that have one (internal modules). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPanelComponents(): Record<string, React.FC<any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, React.FC<any>> = {}
  for (const panel of panels.values()) {
    if (panel.component) out[panel.id] = panel.component
  }
  return out
}

/** Reset the registry to just the built-in internal contributions (for tests). */
export function resetToInternal(): void {
  seed()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/plugins/contribution-registry.test.ts`
Expected: PASS (all five cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/plugins/contribution-registry.ts src/renderer/plugins/contribution-registry.test.ts
git commit -m "feat(plugins): add renderer contribution registry seeded with internal modules"
```

---

### Task 4: Derive launcher modules from the registry

**Files:**
- Modify: `src/renderer/modules/launcher-modules.ts` (full replacement below)
- Guard: `src/renderer/modules/launcher-modules.test.ts` (existing — must stay green, unchanged)

- [ ] **Step 1: Establish the baseline — run the existing launcher test**

Run: `npx vitest run src/renderer/modules/launcher-modules.test.ts`
Expected: PASS (this is the regression guard we must preserve).

- [ ] **Step 2: Replace the file contents to derive from the registry**

Replace the entire contents of `src/renderer/modules/launcher-modules.ts` with:

```ts
// src/renderer/modules/launcher-modules.ts
import type { DockPanelId } from '../hooks/dock-layout-helpers'
import { getLauncherContributions } from '../plugins/contribution-registry'

/** A module that can be opened on demand from the tab-strip "+" launcher.
 *  Sourced from the contribution registry — built-in modules are registered as
 *  internal contributions in src/renderer/plugins/internal-contributions.ts. */
export interface LauncherModule {
  id: DockPanelId
  description: string
}

export const LAUNCHER_MODULES: readonly LauncherModule[] = getLauncherContributions()
  .map((c) => ({ id: c.id as DockPanelId, description: c.description }))

export const LAUNCHER_MODULE_IDS: ReadonlySet<DockPanelId> = new Set(
  LAUNCHER_MODULES.map((m) => m.id),
)
```

(The `c.id as DockPanelId` cast is safe in Phase 0: the only launcher contributions are the four built-in modules, whose ids are valid `DockPanelId`s. Phase 1 widens these signatures to accept plugin ids holistically.)

- [ ] **Step 3: Run the existing launcher test again — it must still pass**

Run: `npx vitest run src/renderer/modules/launcher-modules.test.ts`
Expected: PASS — `LAUNCHER_MODULES` still yields `['backgroundAgent','loop','verdicts','watch']` with non-empty descriptions, and `LAUNCHER_MODULE_IDS` still mirrors it.

- [ ] **Step 4: Type-check the renderer**

Run: `npm run typecheck:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/modules/launcher-modules.ts
git commit -m "refactor(plugins): derive launcher modules from the contribution registry"
```

---

### Task 5: Source PANEL_COMPONENTS module entries from the registry

**Files:**
- Modify: `src/renderer/components/editor/dock-panels.tsx` (imports + `PANEL_COMPONENTS` only)
- Test: `src/renderer/components/editor/dock-panels.contributions.test.tsx`

- [ ] **Step 1: Write the guard test**

This test passes both before and after the refactor; it proves the registry wires the *same* components (behavior preserved). Create:

```tsx
// src/renderer/components/editor/dock-panels.contributions.test.tsx
import { describe, expect, it } from 'vitest'
import { PANEL_COMPONENTS } from './dock-panels'
import { BackgroundAgentPanel } from '../background-agent/BackgroundAgentPanel'
import { LoopPanel } from '../loop/LoopPanel'
import { VerdictsPanel } from '../verdicts/VerdictsPanel'
import { WatchPanel } from '../watch/WatchPanel'

describe('PANEL_COMPONENTS module entries', () => {
  it('still includes the six core panels', () => {
    for (const id of ['agent', 'editor', 'fileTree', 'modifiedFiles', 'shell', 'projects']) {
      expect(typeof PANEL_COMPONENTS[id]).toBe('function')
    }
  })

  it('sources the four module panels from the contribution registry', () => {
    expect(PANEL_COMPONENTS.backgroundAgent).toBe(BackgroundAgentPanel)
    expect(PANEL_COMPONENTS.loop).toBe(LoopPanel)
    expect(PANEL_COMPONENTS.verdicts).toBe(VerdictsPanel)
    expect(PANEL_COMPONENTS.watch).toBe(WatchPanel)
  })
})
```

- [ ] **Step 2: Run the guard test (baseline — passes before the refactor)**

Run: `npx vitest run src/renderer/components/editor/dock-panels.contributions.test.tsx`
Expected: PASS (today `PANEL_COMPONENTS` wires these via direct imports).

- [ ] **Step 3: Refactor the imports and `PANEL_COMPONENTS` in `dock-panels.tsx`**

In `src/renderer/components/editor/dock-panels.tsx`:

3a. **Remove** these four import lines (currently lines 8–11):

```tsx
import { BackgroundAgentPanel } from '../background-agent/BackgroundAgentPanel'
import { LoopPanel } from '../loop/LoopPanel'
import { VerdictsPanel } from '../verdicts/VerdictsPanel'
import { WatchPanel } from '../watch/WatchPanel'
```

3b. **Add** this import (next to the other local imports, e.g. after the `AgentPanel` import):

```tsx
import { getPanelComponents } from '../../plugins/contribution-registry'
```

3c. **Replace** the `PANEL_COMPONENTS` declaration (currently lines 17–29) with:

```tsx
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PANEL_COMPONENTS: Record<string, React.FC<any>> = {
  agent: AgentPanel,
  editor: EditorPanel,
  fileTree: FileTreePanel,
  modifiedFiles: ModifiedFilesPanel,
  shell: ShellPanel,
  projects: ProjectsPanel,
  // backgroundAgent, loop, verdicts, watch — sourced from the contribution
  // registry (registered as internal contributions in src/renderer/plugins).
  ...getPanelComponents(),
}
```

(`EditorPanel`, `FileTreePanel`, `ModifiedFilesPanel`, `ShellPanel`, `ProjectsPanel` are function declarations later in the same file and are hoisted, exactly as in the original — no reordering needed.)

- [ ] **Step 4: Run the guard test — it must still pass after the refactor**

Run: `npx vitest run src/renderer/components/editor/dock-panels.contributions.test.tsx`
Expected: PASS — proving the registry returns the identical components.

- [ ] **Step 5: Run the existing dock-panels test to confirm no regression**

Run: `npx vitest run src/renderer/components/editor/dock-panels.test.tsx`
Expected: PASS.

- [ ] **Step 6: Type-check the renderer**

Run: `npm run typecheck:web`
Expected: PASS (no unused-import errors; the four imports are gone).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/editor/dock-panels.tsx src/renderer/components/editor/dock-panels.contributions.test.tsx
git commit -m "refactor(plugins): source dock module panels from the contribution registry"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check both projects**

Run: `npm run typecheck:node && npm run typecheck:web`
Expected: both PASS.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS (this runs the `better-sqlite3` node rebuild first, then all suites — including the four touched/added test files and the unchanged `launcher-modules.test.ts`).

- [ ] **Step 3: Manual smoke check in the running app**

Run: `npm run dev`
Then: click the **"+ Apps"** button in the tab strip and confirm all four modules still appear — **Ideas, Loop, Verdicts, Watch** — with their descriptions, and that selecting each opens its panel exactly as before. A checkmark (`✓`) should show next to a module that is already open. Close the app when done.
Expected: identical behavior to `main` (zero functional change).

- [ ] **Step 4: Confirm the seam works (optional sanity check)**

Temporarily, in a Node/vitest scratch or the registry test, call `registerPanelContribution({ id: 'example.hello', title: 'Hello', description: 'x', launcher: true, source: 'plugin' })` and confirm it appears in `getLauncherContributions()`. (Already covered by the registry test in Task 3 — no code change needed; this is just a reminder that Phase 1 plugins will register exactly this way.)

---

## Self-Review

**Spec coverage (against design spec §6.10, §10, §13 Phase 0):**
- "Data-driven launcher" → Tasks 3–4 (registry + derived `LAUNCHER_MODULES`).
- "`PANEL_COMPONENTS` gains a registry path" → Task 5.
- "Built-in modules register as internal contributions" → Task 2.
- "Behavior unchanged" → guard tests (Task 5) + unchanged `launcher-modules.test.ts` (Task 4) + manual smoke (Task 6).
- "PluginManager scan of built-in dir" → **intentionally deferred to Phase 1** (Scope Note above) — documented, not a silent gap.

**Placeholder scan:** none — every step contains full code/commands.

**Type consistency:** `PanelContribution` (Task 1) is extended by `InternalPanel` (Task 2, `component` required) and `RegisteredPanel` (Task 3, `component` optional); `getLauncherContributions`/`getLauncherContributionIds`/`getPanelComponents`/`registerPanelContribution`/`resetToInternal` names are used identically across Tasks 3–5; `LAUNCHER_MODULES`/`LAUNCHER_MODULE_IDS` keep their original exported types so unchanged consumers compile.

---

## Phase 1 (next plan — not in scope here)

Phase 1 is a separate, larger subsystem and should be its own plan, authored **after** Phase 0 lands (its exact code depends on the types Phase 0 establishes and on the then-current tree). Outline:

1. **Manifest schema + parser** (`src/main/plugins/manifest.ts`, types in `src/shared/plugins/manifest.ts`): `engines.manifold`, `main`, `activationEvents`, `contributes.{views,commands,configuration}`, `capabilities`.
2. **PluginManager + scanner** (`src/main/plugins/`): scan `resources/plugins/` + `~/.manifold/plugins/`, validate, build the registry; expose contributions to the renderer via new `plugins:*` IPC channels (extend the preload whitelist).
3. **Extension host** (`src/plugin-host/`, new `electron.vite.config.ts` build target): Electron `utilityProcess`; lean `MessagePort` RPC (`HostContext`/`PluginHostContext`); `manifold` module interception; `activate`/`deactivate`; crash recovery.
4. **`manifold` API v1**: `commands`, `window` (webview view provider), `workspace` (read), `storage` (per-plugin JSON), `configuration`; host-side services delegating to existing managers, capability-gated.
5. **Webview panels** (`src/renderer/components/editor/PluginWebviewPanel.tsx` + `src/preload/webview-preload.ts`): sandboxed `<webview>`, message routing renderer ⇄ main ⇄ host ⇄ plugin; make the launcher/registry **reactive** to runtime-registered plugin contributions (replacing the import-time-derived `LAUNCHER_MODULES` shim).
6. **Reference external plugin** under `resources/plugins/` proving the full path end-to-end.
