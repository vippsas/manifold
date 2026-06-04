# Manifold Plugins — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Manifold plugin (a folder with a manifest) discoverable, runnable in an isolated extension host, and able to contribute a working panel via a Manifold-native API — realizing VS Code's *model* with a native API.

**Architecture:** Plugins are discovered from disk by a main-process `PluginManager` (manifest = `package.json`, modeled on VS Code). Plugin JS runs in an isolated **Electron `utilityProcess`** extension host and talks to the main process over a small `MessagePort`/`parentPort` RPC. Plugins `import 'manifold'` to get a native API whose calls proxy to host services backed by Manifold's managers. Contributed panels render as **sandboxed localhost iframes** (forced by Manifold's `will-attach-webview` policy), with messages routed renderer ⇄ main ⇄ host ⇄ plugin. Built on the Phase 0 contribution registry.

**Tech Stack:** TypeScript, Electron 39 (`utilityProcess`, `MessageChannelMain`), React 18, electron-vite (multi-target build), Vitest (jsdom), Node `http` (localhost asset server, like `local-renderer-server.ts`).

---

## Decomposition (read first)

Phase 1 is large and splits into four sub-phases, each a working, testable increment. **This document specifies Phase 1a in full bite-sized TDD detail (execution-ready). Phases 1b–1d are precise task outlines** — files, interfaces, key code sketches, verification, and flagged design decisions — to be expanded into full bite-sized plans when reached (their exact code is best authored against the tree once 1a has landed and its types exist).

| Sub-phase | Deliverable | Status of this doc |
|---|---|---|
| **1a — Discovery, manifest, registry, reactive launcher** | A plugin folder with a `views` manifest is discovered, validated, and appears in the "+ Apps" menu (selecting it shows a "coming soon" item — no host yet). Main + renderer only. | **Full plan below** |
| **1b — Extension host + RPC + activation + `commands`** | `utilityProcess` host loads a plugin, calls `activate(context)`, and `manifold.commands.register/execute` round-trips. | Outline |
| **1c — Webview panels + `window` API** | A contributed view opens a real panel: a sandboxed localhost iframe rendering the plugin's UI, messaging the plugin's `WebviewViewProvider`. | Outline |
| **1d — `workspace`/`storage`/`configuration` + reference plugin** | Read-only context APIs + per-plugin storage + a polished reference plugin proving the full path end-to-end. | Outline |

### Verification environment notes (apply to every task)
- Work in `/Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins`, branch `manifold/plugins` (or its successor). `node_modules` installed; do NOT reinstall.
- Tests: `npx vitest run <path>` (fast). Avoid `npm test` mid-task.
- The branch carries **pre-existing, type-level-only** `tsc` errors (baseline: 38 `typecheck:web`, 16 `typecheck:node`). Gate = **no increase** in those counts and **no error referencing a file you created/edited**. The runtime test suite is green (605 renderer/shared tests).
- `any` needs an inline `// eslint-disable-next-line @typescript-eslint/no-explicit-any` (repo convention). No `npm run lint` script exists.

---

# Phase 1a — Discovery, manifest, registry, reactive launcher

## File Structure (1a)

**Create:**
- `src/shared/plugins/manifest.ts` — `ManifoldPluginManifest`, `PluginViewContribution`, `PluginDescriptor` (shared with main + future host).
- `src/main/plugins/manifest.ts` — `parseManifest()` validator (pure).
- `src/main/plugins/scanner.ts` — `scanPluginDir()` (fs).
- `src/main/plugins/plugin-paths.ts` — bundled + user plugin dir resolvers.
- `src/main/plugins/plugin-manager.ts` — `PluginManager` + pure `viewContributionsOf()`.
- `src/main/ipc/plugin-handlers.ts` — `registerPluginHandlers()`.
- `src/renderer/plugins/use-contributions.ts` — `useLoadPluginContributions()` + `useLauncherContributions()` hooks.
- Tests: `manifest.test.ts`, `scanner.test.ts`, `plugin-manager.test.ts` (main), and `contribution-registry.subscribe.test.ts` (renderer).
- `resources/plugins/hello/package.json` — sample built-in plugin (manifest only).

**Modify:**
- `src/renderer/plugins/contribution-registry.ts` — add `subscribeContributions()` + `notify()` on register/reset.
- `src/renderer/components/editor/ModuleLauncher.tsx` — read live launcher contributions; render plugin items.
- `src/renderer/AppShell.tsx` — call `useLoadPluginContributions()` once.
- `src/main/ipc/types.ts` — add `pluginManager` to `IpcDependencies`.
- `src/main/app/ipc-handlers.ts` — call `registerPluginHandlers(deps)`.
- `src/main/app/index.ts` — instantiate `PluginManager`, `scan()`, add to `ipcDeps`.
- `src/preload/index.ts` — whitelist `plugins:list-contributions`, `plugins:list`.
- `package.json` (build) — add `resources/plugins` to `extraResources` (flagged config change; needed only for packaged builds, not dev).

---

### Task 1: Shared manifest types

**Files:** Create `src/shared/plugins/manifest.ts`. Pure types — verified by typecheck.

- [ ] **Step 1: Create the file**

```ts
// src/shared/plugins/manifest.ts
/** A plugin's package.json, modeled on VS Code's extension manifest. */

export interface PluginViewContribution {
  /** Stable, globally-unique view id, e.g. "manifold.hello.panel". */
  id: string
  /** Title shown in the "+ Apps" launcher and panel tab. */
  title: string
  /** One-line description for the launcher menu. */
  description?: string
  /** Whether the view appears in the "+ Apps" launcher. */
  launcher?: boolean
}

export interface PluginCommandContribution {
  command: string
  title: string
}

export interface PluginContributions {
  views?: PluginViewContribution[]
  commands?: PluginCommandContribution[]
  configuration?: unknown
}

export interface ManifoldPluginManifest {
  name: string
  publisher: string
  version: string
  displayName?: string
  description?: string
  engines: { manifold: string }
  /** Extension-host entry (relative to the plugin root). Consumed in Phase 1b. */
  main?: string
  activationEvents?: string[]
  contributes?: PluginContributions
  capabilities?: string[]
}

/** A plugin discovered on disk. */
export interface PluginDescriptor {
  /** Unique id: `${publisher}.${name}`. */
  id: string
  manifest: ManifoldPluginManifest
  /** Absolute path to the plugin folder. */
  root: string
  origin: 'builtin' | 'user'
}
```

- [ ] **Step 2:** `npm run typecheck:node && npm run typecheck:web` — counts unchanged (≤38/≤16).
- [ ] **Step 3:** Commit `feat(plugins): add plugin manifest types`.

---

### Task 2: Manifest parser/validator

**Files:** Create `src/main/plugins/manifest.ts` + `src/main/plugins/manifest.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/plugins/manifest.test.ts
import { describe, expect, it } from 'vitest'
import { parseManifest } from './manifest'

const valid = {
  name: 'hello', publisher: 'manifold', version: '0.0.1',
  engines: { manifold: '^0.3.0' },
  contributes: { views: [{ id: 'manifold.hello.panel', title: 'Hello' }] },
}

describe('parseManifest', () => {
  it('accepts a valid manifest', () => {
    const r = parseManifest(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.manifest.name).toBe('hello')
  })
  it('rejects a non-object', () => {
    expect(parseManifest(null).ok).toBe(false)
    expect(parseManifest('x').ok).toBe(false)
  })
  it('requires name/publisher/version', () => {
    expect(parseManifest({ ...valid, name: undefined }).ok).toBe(false)
    expect(parseManifest({ ...valid, version: '' }).ok).toBe(false)
  })
  it('requires engines.manifold', () => {
    expect(parseManifest({ ...valid, engines: {} }).ok).toBe(false)
  })
  it('rejects malformed view contributions', () => {
    expect(parseManifest({ ...valid, contributes: { views: 'x' } }).ok).toBe(false)
    expect(parseManifest({ ...valid, contributes: { views: [{ id: 'a' }] } }).ok).toBe(false)
  })
})
```

- [ ] **Step 2:** Run → FAIL (no module). `npx vitest run src/main/plugins/manifest.test.ts`
- [ ] **Step 3: Implement**

```ts
// src/main/plugins/manifest.ts
import type { ManifoldPluginManifest } from '../../shared/plugins/manifest'

export type ManifestParseResult =
  | { ok: true; manifest: ManifoldPluginManifest }
  | { ok: false; error: string }

export function parseManifest(raw: unknown): ManifestParseResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'manifest is not an object' }
  const m = raw as Record<string, unknown>
  for (const field of ['name', 'publisher', 'version'] as const) {
    if (typeof m[field] !== 'string' || (m[field] as string).length === 0) {
      return { ok: false, error: `missing or invalid "${field}"` }
    }
  }
  const engines = m.engines as Record<string, unknown> | undefined
  if (!engines || typeof engines.manifold !== 'string') {
    return { ok: false, error: 'missing "engines.manifold"' }
  }
  const contributes = m.contributes as Record<string, unknown> | undefined
  if (contributes && contributes.views !== undefined) {
    if (!Array.isArray(contributes.views)) return { ok: false, error: '"contributes.views" must be an array' }
    for (const v of contributes.views) {
      if (typeof v !== 'object' || v === null) return { ok: false, error: 'invalid view contribution' }
      const view = v as Record<string, unknown>
      if (typeof view.id !== 'string' || view.id.length === 0) return { ok: false, error: 'view contribution missing "id"' }
      if (typeof view.title !== 'string' || view.title.length === 0) return { ok: false, error: `view "${String(view.id)}" missing "title"` }
    }
  }
  return { ok: true, manifest: m as unknown as ManifoldPluginManifest }
}
```

- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(plugins): add manifest parser/validator`.

---

### Task 3: Plugin scanner

**Files:** Create `src/main/plugins/scanner.ts` + `src/main/plugins/scanner.test.ts`.

- [ ] **Step 1: Write the failing test** (uses a real temp dir)

```ts
// src/main/plugins/scanner.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanPluginDir } from './scanner'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mf-plugins-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function plugin(name: string, manifest: unknown): void {
  const p = join(dir, name)
  mkdirSync(p, { recursive: true })
  writeFileSync(join(p, 'package.json'), JSON.stringify(manifest))
}

describe('scanPluginDir', () => {
  it('returns empty for a missing dir', () => {
    expect(scanPluginDir(join(dir, 'nope'), 'user')).toEqual({ plugins: [], errors: [] })
  })
  it('discovers a valid plugin and builds publisher.name id', () => {
    plugin('hello', { name: 'hello', publisher: 'manifold', version: '1.0.0', engines: { manifold: '^0.3.0' } })
    const r = scanPluginDir(dir, 'builtin')
    expect(r.plugins).toHaveLength(1)
    expect(r.plugins[0].id).toBe('manifold.hello')
    expect(r.plugins[0].origin).toBe('builtin')
  })
  it('records an error for invalid JSON and for invalid manifests, skipping them', () => {
    const bad = join(dir, 'bad'); mkdirSync(bad); writeFileSync(join(bad, 'package.json'), '{ not json')
    plugin('nomanifold', { name: 'x' }) // missing publisher/version/engines
    const r = scanPluginDir(dir, 'user')
    expect(r.plugins).toHaveLength(0)
    expect(r.errors).toHaveLength(2)
  })
  it('ignores directories without a package.json', () => {
    mkdirSync(join(dir, 'empty'))
    expect(scanPluginDir(dir, 'user').plugins).toHaveLength(0)
  })
})
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**

```ts
// src/main/plugins/scanner.ts
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginDescriptor } from '../../shared/plugins/manifest'
import { parseManifest } from './manifest'

export interface ScanResult {
  plugins: PluginDescriptor[]
  errors: Array<{ path: string; error: string }>
}

export function scanPluginDir(dir: string, origin: 'builtin' | 'user'): ScanResult {
  const plugins: PluginDescriptor[] = []
  const errors: Array<{ path: string; error: string }> = []
  if (!existsSync(dir)) return { plugins, errors }
  for (const entry of readdirSync(dir)) {
    const root = join(dir, entry)
    if (!statSync(root).isDirectory()) continue
    const manifestPath = join(root, 'package.json')
    if (!existsSync(manifestPath)) continue
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (err) {
      errors.push({ path: manifestPath, error: `invalid JSON: ${String(err)}` })
      continue
    }
    const result = parseManifest(raw)
    if (!result.ok) {
      errors.push({ path: manifestPath, error: result.error })
      continue
    }
    plugins.push({
      id: `${result.manifest.publisher}.${result.manifest.name}`,
      manifest: result.manifest,
      root,
      origin,
    })
  }
  return { plugins, errors }
}
```

- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(plugins): add plugin directory scanner`.

---

### Task 4: Plugin path resolvers

**Files:** Create `src/main/plugins/plugin-paths.ts`. (Mirrors `src/main/watch/resource-path.ts`.) `getUserPluginsDir` is pure and gets a unit test; `getBundledPluginsDir` touches `electron`/`__dirname` and is verified via the dev smoke in Task 10.

- [ ] **Step 1: Implement**

```ts
// src/main/plugins/plugin-paths.ts
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Built-in plugins shipped with the app (resources/plugins). */
export function getBundledPluginsDir(): string {
  if (app?.isPackaged) return join(process.resourcesPath, 'plugins')
  const candidates = [
    join(__dirname, '..', '..', 'resources', 'plugins'),
    join(__dirname, '..', '..', '..', 'resources', 'plugins'),
    join(process.cwd(), 'resources', 'plugins'),
  ]
  for (const c of candidates) if (existsSync(c)) return c
  return candidates[candidates.length - 1]
}

/** User-installed plugins (under the configurable storage root). */
export function getUserPluginsDir(storagePath: string): string {
  return join(storagePath, 'plugins')
}
```

- [ ] **Step 2:** Add `src/main/plugins/plugin-paths.test.ts` asserting `getUserPluginsDir('/x') === '/x/plugins'`. Run → PASS.
- [ ] **Step 3:** Commit `feat(plugins): add plugin path resolvers`.

---

### Task 5: PluginManager + pure view-contribution mapping

**Files:** Create `src/main/plugins/plugin-manager.ts` + `src/main/plugins/plugin-manager.test.ts`.

- [ ] **Step 1: Write the failing test** (tests the pure mapper with hand-built descriptors)

```ts
// src/main/plugins/plugin-manager.test.ts
import { describe, expect, it } from 'vitest'
import { viewContributionsOf } from './plugin-manager'
import type { PluginDescriptor } from '../../shared/plugins/manifest'

const desc = (id: string, views: unknown[]): PluginDescriptor => ({
  id, root: '/x', origin: 'user',
  manifest: { name: id, publisher: 'p', version: '1.0.0', engines: { manifold: '^0.3.0' }, contributes: { views: views as never } },
})

describe('viewContributionsOf', () => {
  it('flattens views into PanelContributions tagged source=plugin', () => {
    const out = viewContributionsOf([
      desc('p.a', [{ id: 'a.view', title: 'A', description: 'desc', launcher: true }]),
      desc('p.b', [{ id: 'b.view', title: 'B' }]),
    ])
    expect(out).toEqual([
      { id: 'a.view', title: 'A', description: 'desc', launcher: true, source: 'plugin', pluginId: 'p.a' },
      { id: 'b.view', title: 'B', description: '', launcher: false, source: 'plugin', pluginId: 'p.b' },
    ])
  })
  it('returns [] when a plugin has no views', () => {
    expect(viewContributionsOf([desc('p.c', [])])).toEqual([])
  })
})
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**

```ts
// src/main/plugins/plugin-manager.ts
import type { PluginDescriptor } from '../../shared/plugins/manifest'
import type { PanelContribution } from '../../shared/plugins/contributions'
import { scanPluginDir } from './scanner'
import { getBundledPluginsDir, getUserPluginsDir } from './plugin-paths'
import { debugLog } from '../app/debug-log'

export interface PluginPanelContribution extends PanelContribution {
  pluginId: string
}

/** Pure: flatten plugin view contributions into renderer PanelContributions. */
export function viewContributionsOf(plugins: PluginDescriptor[]): PluginPanelContribution[] {
  const out: PluginPanelContribution[] = []
  for (const p of plugins) {
    for (const v of p.manifest.contributes?.views ?? []) {
      out.push({
        id: v.id,
        title: v.title,
        description: v.description ?? '',
        launcher: v.launcher ?? false,
        source: 'plugin',
        pluginId: p.id,
      })
    }
  }
  return out
}

export class PluginManager {
  private plugins: PluginDescriptor[] = []

  constructor(private readonly storagePath: string) {}

  /** Discover built-in + user plugins. Errors are logged and skipped. */
  scan(): void {
    const builtin = scanPluginDir(getBundledPluginsDir(), 'builtin')
    const user = scanPluginDir(getUserPluginsDir(this.storagePath), 'user')
    this.plugins = [...builtin.plugins, ...user.plugins]
    for (const e of [...builtin.errors, ...user.errors]) {
      debugLog(`[plugins] skipped ${e.path}: ${e.error}`)
    }
    debugLog(`[plugins] discovered ${this.plugins.length} plugin(s)`)
  }

  listPlugins(): PluginDescriptor[] {
    return this.plugins
  }

  listViewContributions(): PluginPanelContribution[] {
    return viewContributionsOf(this.plugins)
  }
}
```

> Confirm the `debugLog` import path against `src/main/app/debug-log.ts` (the scanner research showed `[provisioning]` logs via `debugLog`); adjust if the export differs.

- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(plugins): add PluginManager`.

---

### Task 6: IPC handlers + service wiring + preload whitelist

**Files:** Create `src/main/ipc/plugin-handlers.ts`; modify `src/main/ipc/types.ts`, `src/main/app/ipc-handlers.ts`, `src/main/app/index.ts`, `src/preload/index.ts`.

- [ ] **Step 1: Create the handler module**

```ts
// src/main/ipc/plugin-handlers.ts
import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'

export function registerPluginHandlers(deps: IpcDependencies): void {
  ipcMain.handle('plugins:list-contributions', () => deps.pluginManager.listViewContributions())
  ipcMain.handle('plugins:list', () => deps.pluginManager.listPlugins())
}
```

- [ ] **Step 2: Add to `IpcDependencies`** (`src/main/ipc/types.ts`) — add `pluginManager: import('../plugins/plugin-manager').PluginManager` to the interface.

- [ ] **Step 3: Register** in `src/main/app/ipc-handlers.ts`: add `import { registerPluginHandlers } from '../ipc/plugin-handlers'` and call `registerPluginHandlers(deps)` inside `registerIpcHandlers`.

- [ ] **Step 4: Instantiate** in `src/main/app/index.ts` (near the other module instances):

```ts
import { PluginManager } from '../plugins/plugin-manager'
const pluginManager = new PluginManager(settingsStore.getSettings().storagePath)
pluginManager.scan()
```
and add `pluginManager,` to the `ipcDeps` object literal.

- [ ] **Step 5: Whitelist channels** in `src/preload/index.ts` — add to `ALLOWED_INVOKE_CHANNELS`:
```ts
  'plugins:list-contributions',
  'plugins:list',
```

- [ ] **Step 6: Verify** `npm run typecheck:node` count unchanged (≤16). Commit `feat(plugins): expose plugin contributions over IPC`.

---

### Task 7: Make the contribution registry reactive

**Files:** Modify `src/renderer/plugins/contribution-registry.ts`; add `src/renderer/plugins/contribution-registry.subscribe.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/plugins/contribution-registry.subscribe.test.ts
import { describe, expect, it, afterEach, vi } from 'vitest'
import { registerPanelContribution, subscribeContributions, resetToInternal } from './contribution-registry'

afterEach(() => resetToInternal())

describe('subscribeContributions', () => {
  it('notifies on register and on reset, and unsubscribes', () => {
    const cb = vi.fn()
    const off = subscribeContributions(cb)
    registerPanelContribution({ id: 'p.v', title: 'V', description: '', launcher: true, source: 'plugin' })
    expect(cb).toHaveBeenCalledTimes(1)
    off()
    registerPanelContribution({ id: 'p.w', title: 'W', description: '', launcher: true, source: 'plugin' })
    expect(cb).toHaveBeenCalledTimes(1) // not called after unsubscribe
  })
})
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — in `contribution-registry.ts` add a listener set and notify on mutation:

```ts
type Listener = () => void
const listeners = new Set<Listener>()

/** Subscribe to registry changes; returns an unsubscribe fn. */
export function subscribeContributions(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function notify(): void {
  for (const listener of listeners) listener()
}
```
Then call `notify()` at the end of `registerPanelContribution` and `resetToInternal`.

- [ ] **Step 4:** Run → PASS. Also re-run `contribution-registry.test.ts` (unchanged, must still pass).
- [ ] **Step 5:** Commit `feat(plugins): make contribution registry observable`.

---

### Task 8: Renderer hooks to load + observe plugin contributions

**Files:** Create `src/renderer/plugins/use-contributions.ts` + `src/renderer/plugins/use-contributions.test.tsx`.

- [ ] **Step 1: Write the failing test** (mocks `window.electronAPI`)

```tsx
// src/renderer/plugins/use-contributions.test.tsx
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLoadPluginContributions } from './use-contributions'
import { getLauncherContributions, resetToInternal } from './contribution-registry'

beforeEach(() => {
  resetToInternal()
  // @ts-expect-error test stub
  global.window.electronAPI = {
    invoke: vi.fn(async (ch: string) =>
      ch === 'plugins:list-contributions'
        ? [{ id: 'p.v', title: 'Plug View', description: 'd', launcher: true, source: 'plugin', pluginId: 'p' }]
        : []),
    on: vi.fn(() => () => {}),
  }
})

describe('useLoadPluginContributions', () => {
  it('fetches plugin views and registers them as launcher contributions', async () => {
    renderHook(() => useLoadPluginContributions())
    await waitFor(() => {
      expect(getLauncherContributions().some((c) => c.id === 'p.v')).toBe(true)
    })
  })
})
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**

```ts
// src/renderer/plugins/use-contributions.ts
import { useEffect, useState } from 'react'
import {
  getLauncherContributions,
  registerPanelContribution,
  subscribeContributions,
  type RegisteredPanel,
} from './contribution-registry'

/** On mount, fetch plugin-contributed views from main and register them.
 *  Phase 1a registers them WITHOUT a component (not yet openable — the webview
 *  panel arrives in Phase 1c). They appear in the "+ Apps" launcher. */
export function useLoadPluginContributions(): void {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const views = (await window.electronAPI.invoke('plugins:list-contributions')) as RegisteredPanel[]
      if (cancelled) return
      for (const v of views) registerPanelContribution(v)
    })()
    return () => { cancelled = true }
  }, [])
}

/** Live launcher contributions; re-renders when the registry changes. */
export function useLauncherContributions(): RegisteredPanel[] {
  const [items, setItems] = useState<RegisteredPanel[]>(() => getLauncherContributions())
  useEffect(() => subscribeContributions(() => setItems(getLauncherContributions())), [])
  return items
}
```

- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(plugins): add hooks to load and observe plugin contributions`.

---

### Task 9: Reactive "+ Apps" launcher + load on startup

**Files:** Modify `src/renderer/components/editor/ModuleLauncher.tsx` and `src/renderer/AppShell.tsx`.

- [ ] **Step 1: Update `ModuleLauncher.tsx`** to read live contributions and render plugin items (no `disabled` support in `ActionMenuButtonItem`, so plugin items use a "coming soon" label and a no-op action in 1a):

```tsx
import React from 'react'
import { ActionMenuButton, type ActionMenuButtonItem } from './ActionMenuButton'
import { DockStateContext } from './dock-panel-types'
import { useLauncherContributions } from '../../plugins/use-contributions'
import type { DockPanelId } from '../../hooks/dock-layout-helpers'

function PlusIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 2.2V9.8M2.2 6H9.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function ModuleLauncher(): React.JSX.Element | null {
  const state = React.useContext(DockStateContext)
  const contributions = useLauncherContributions()
  if (!state) return null

  const items: ActionMenuButtonItem[] = contributions.map((c) => {
    if (c.source === 'plugin') {
      return { id: c.id, label: `${c.title} (soon)`, description: c.description, action: () => {} }
    }
    const open = state.isModuleOpen(c.id as DockPanelId)
    return {
      id: c.id,
      label: `${open ? '✓ ' : ''}${c.title}`,
      description: c.description,
      action: () => state.onOpenModule(c.id as DockPanelId),
    }
  })

  return (
    <ActionMenuButton
      buttonLabel={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <PlusIcon />
          Apps
        </span>
      }
      title="Open module"
      menuLabel="Modules"
      items={items}
    />
  )
}
```

- [ ] **Step 2: Load on startup** — in `src/renderer/AppShell.tsx`, import `useLoadPluginContributions` and call it once at the top of the `AppShell` component body (alongside its other hooks):
```tsx
import { useLoadPluginContributions } from './plugins/use-contributions'
// ...inside AppShell(...):
useLoadPluginContributions()
```

- [ ] **Step 3: Verify** existing launcher behavior unchanged — run the existing `dock-panels.contributions.test.tsx` and any `ModuleLauncher`-related tests; run `npm run typecheck:web` (count ≤38). (Internal modules still open exactly as before; plugin items render with a "(soon)" suffix and no-op.)
- [ ] **Step 4:** Commit `feat(plugins): drive the + Apps launcher from the live contribution registry`.

---

### Task 10: Sample built-in plugin + dev verification

**Files:** Create `resources/plugins/hello/package.json`. (No code — manifest only. Panel content arrives in 1c.)

- [ ] **Step 1: Create the manifest**

```json
{
  "name": "hello",
  "publisher": "manifold",
  "version": "0.0.1",
  "displayName": "Hello",
  "description": "Example plugin — panel arrives in a later phase.",
  "engines": { "manifold": "^0.3.0" },
  "main": "./out/plugin.js",
  "activationEvents": ["onView:manifold.hello.panel"],
  "contributes": {
    "views": [
      { "id": "manifold.hello.panel", "title": "Hello (plugin)", "description": "Example plugin panel.", "launcher": true }
    ]
  }
}
```

- [ ] **Step 2: Dev smoke** — `npm run dev`, open the **"+ Apps"** menu, and confirm **Hello (plugin) (soon)** appears beneath the four built-in modules (Ideas/Loop/Verdicts/Watch). Confirm the built-in modules still open normally and the plugin item is a no-op. This exercises the full pipeline: `getBundledPluginsDir()` (dev walk-up) → scan → IPC → renderer registration → reactive launcher.

- [ ] **Step 3:** Commit `feat(plugins): add Hello sample built-in plugin`.

---

### Task 11 (flagged config change — confirm before doing): package the plugins dir

**Files:** Modify `package.json` `build.extraResources`. **This is a build-config change; per repo CLAUDE.md, confirm before modifying.** Not required for dev verification (Task 10 works without it); required so built-in plugins ship in packaged `.dmg` builds.

- [ ] Add to `build.extraResources`:
```json
{ "from": "resources/plugins", "to": "plugins" }
```
- [ ] Verify `npm run build` still succeeds (does not typecheck; should bundle). Commit `build(plugins): ship resources/plugins as an extra resource`.

---

### Phase 1a Self-Review checklist
- [ ] All new tests pass; `typecheck:web`/`typecheck:node` counts unchanged (≤38/≤16); no error names a new file.
- [ ] Internal modules (Ideas/Loop/Verdicts/Watch) open exactly as before (Phase 0 guard tests + dev smoke).
- [ ] The sample plugin appears in "+ Apps" (dev smoke).
- [ ] No import cycle: `contributions ← manifest`/`internal-contributions ← registry ← use-contributions ← ModuleLauncher`; main side `manifest ← scanner ← plugin-manager ← plugin-handlers`.

---

# Phase 1b — Extension host + RPC + activation + `commands` (OUTLINE)

**Deliverable:** A plugin's `main` module loads in an isolated `utilityProcess`, its `activate(context)` runs, it registers a command via `manifold.commands.registerCommand`, and `manifold.commands.executeCommand` round-trips between host and main.

**New build target** (`electron.vite.config.ts`): add an `extensionHost` section → `src/plugin-host/index.ts` → `out/extension-host/index.js` (Node, `externalizeDepsPlugin()`). Add `src/plugin-host/**` to `tsconfig.node.json` includes.

**Files:**
- `src/shared/plugins/rpc.ts` — RPC envelope + proxy-identifier enums. Envelope: `{ t: 'req'|'rep'|'evt', id, ctx, method, args?|value?|error? }`. `HostContext` (services in main: `HostCommands`, later `HostWindow`/`HostWorkspace`/`HostStorage`/`HostConfiguration`) and `PluginHostContext` (services in host: `PluginActivation`, `PluginCommands`).
- `src/shared/plugins/api-types.ts` — the public `manifold` API shapes (`Disposable`, `ManifoldContext`, `commands` namespace) shared so host + main agree.
- `src/main/plugins/extension-host.ts` — owns the `utilityProcess`:
  ```ts
  import { utilityProcess } from 'electron'
  const child = utilityProcess.fork(join(__dirname, '../extension-host/index.js'), [], { serviceName: 'manifold-plugin-host' })
  child.on('message', onRpcMessage); child.postMessage(rpcMessage)
  child.on('exit', code => { /* mark all plugins inactive; offer restart */ })
  ```
  (Transport = `utilityProcess` `postMessage`/`'message'` over `parentPort`. No `MessageChannelMain` needed for 1b since renderer talks to the host *through* main.)
- `src/main/plugins/rpc-endpoint.ts` — generic bidirectional endpoint: pending-promise map, dispatch incoming `req` to registered local services, `getProxy(ctx)` returns a `Proxy` that turns `obj.$method(...)` into a `req`. ~150 lines; shared shape with the host side.
- `src/plugin-host/index.ts` — boot: connect `process.parentPort`, build the RPC endpoint, register `PluginActivation`/`PluginCommands`, await init (plugin list + roots).
- `src/plugin-host/activator.ts` — load a plugin's `main` module (`require(resolve(root, manifest.main))`), call `activate(context)`, track `context.subscriptions`, run `deactivate()`.
- `src/plugin-host/require-interceptor.ts` — intercept `require('manifold')`, return the per-plugin API object.
- `src/plugin-host/api-impl.ts` — build the `manifold` module: `commands.registerCommand` (stores handler locally + `$registerCommand(id)` to main), `commands.executeCommand` (→ `HostCommands.$executeCommand`).
- `src/main/plugins/api/host-commands.ts` — `$registerCommand`/`$executeCommand`; a command registry; routes execution back to the owning host via `PluginCommands.$invokeCommand`.
- Extend `PluginManager` with activation: `activate(pluginId)` (fire `onStartupFinished`/`onCommand:`/`onView:` events → host `$activate`).

**Verification:** a fixture plugin whose `activate` registers `manifold.command.ping` returning `'pong'`; an integration test boots the host and asserts `executeCommand('manifold.command.ping')` resolves to `'pong'`; assert host `exit` marks the plugin inactive.

**Design decisions to settle when expanding:** CJS vs ESM plugin entry (lean CJS `require` first); whether commands may be invoked from the renderer in 1b (defer — host/main only); error envelope shape for thrown plugin errors.

---

# Phase 1c — Webview panels + `window` API (OUTLINE)

**Deliverable:** Selecting a plugin view in "+ Apps" opens a dock panel rendering the plugin's own UI, which can `postMessage` to/from the plugin's `WebviewViewProvider` running in the host.

**Key constraint (confirmed):** Manifold's `will-attach-webview` (window-factory.ts) **deletes the webview `preload` and forces a localhost-only origin**. Therefore plugin UIs are **served over localhost and use `window.postMessage`**, not a preload bridge.

**Recommended approach (settle on expansion):** render contributed views as a **sandboxed `<iframe>`** pointing at a localhost asset server (reusing the `local-renderer-server.ts` pattern) that serves each plugin's webview assets at `http://127.0.0.1:<port>/<pluginId>/...`. The iframe page talks to the host renderer via `window.postMessage` (origin-checked); the renderer relays to the ext host via `plugins:webview-message` IPC → RPC → the plugin's `onDidReceiveMessage`. (Iframe is simpler and safer than `<webview>` here precisely because the webview preload is stripped anyway.)

**Files:**
- `src/main/plugins/asset-server.ts` — localhost static server scoped to plugin roots (read-only; path-traversal-guarded), à la `local-renderer-server.ts`.
- `src/renderer/components/editor/PluginViewPanel.tsx` — generic component registered **once** in `PANEL_COMPONENTS` under a static key (e.g. `'pluginView'`); reads `api.id` (the view id), mounts the iframe, and bridges `postMessage` ⇄ IPC. (Avoids dynamic dockview component registration.)
- Dock-open wiring: map a plugin view id → `component: 'pluginView'` (not the id) in the open/restore path (`dock-layout-*`), and make `ModuleLauncher` actually open plugin views (replacing the 1a "(soon)" no-op). Register plugin contributions with `component: PluginViewPanel` so `getPanelComponents()` includes the static `'pluginView'` mapping.
- `src/main/plugins/api/host-window.ts` + host `window.registerWebviewViewProvider`, `WebviewView` (`webview.html`, `postMessage`, `onDidReceiveMessage`, `asWebviewUri`), `showInformationMessage`.
- Activation event `onView:<id>` fires when the panel opens → host resolves the provider.

**Verification:** the reference plugin contributes a view whose provider sets `webview.html` and echoes a `postMessage`; dev smoke: open it from "+ Apps", see the plugin UI, click a button, observe the round-trip.

**Design decisions to settle:** iframe vs `<webview>` (lean iframe); asset-server lifecycle (one shared server vs per-plugin); CSP for plugin pages; how `asWebviewUri` maps to the localhost origin.

---

# Phase 1d — `workspace`/`storage`/`configuration` + reference plugin (OUTLINE)

**Deliverable:** Read-only context + persistence APIs, capability-gated, plus a polished reference plugin.

**Files / API:**
- `src/main/plugins/api/host-workspace.ts` → `manifold.workspace.activeProject`/`activeSession` + `onDidChange*` (delegates to `projectRegistry`/`sessionManager`; pushes change events over RPC). Capability `workspace:read`.
- `src/main/plugins/api/host-storage.ts` → `manifold.storage.global` get/update, backed by a per-plugin JSON file under `getUserPluginsDir()/<id>/storage.json` (no SQLite). Capability `storage`.
- `src/main/plugins/api/host-configuration.ts` → `manifold.configuration.get` + `onDidChange` over `contributes.configuration`, delegating to `SettingsStore`.
- **Capability gating:** the host only wires API namespaces a plugin declared in `capabilities`; undeclared access throws `CapabilityError`. Surface capabilities read-only in a small plugin list/details UI.
- **Reference plugin:** convert the `hello` sample into a real plugin (with `main` + a webview view) exercising commands + window + workspace + storage end-to-end. (A later phase ports **Watch**.)

**Verification:** integration tests per host service (gated allow/deny); reference-plugin dev smoke covering all v1 namespaces.

---

## Self-Review (this plan)

**Spec coverage (design spec §6, §13 Phase 1):** manifest+scanner+registry → 1a; ext host+RPC+activation+commands → 1b; webview panels+window API → 1c; workspace/storage/configuration+reference plugin → 1d. The reactive-launcher requirement (spec §6.10 / Phase-0 follow-up) → 1a Tasks 7–9.

**Placeholder scan:** Phase 1a contains full code per step. Phases 1b–1d are explicitly outlines (files/interfaces/sketches/verification + flagged decisions), to be expanded to full bite-sized plans when reached — this is intentional decomposition, not a gap.

**Type consistency:** `ManifoldPluginManifest`/`PluginDescriptor` (Task 1) flow through `parseManifest` (Task 2) → `scanPluginDir` (Task 3) → `viewContributionsOf`/`PluginManager` (Task 5) → `plugins:list-contributions` IPC (Task 6) → `useLoadPluginContributions` (Task 8) → `ModuleLauncher` (Task 9). `PluginPanelContribution extends PanelContribution` (Phase 0) so it registers cleanly. `subscribeContributions` (Task 7) is consumed by `useLauncherContributions` (Task 8).

**Scope:** Phase 1a is one coherent, shippable increment (discovery + listing, zero host). Phases 1b–1d are separate plan/implement cycles.
