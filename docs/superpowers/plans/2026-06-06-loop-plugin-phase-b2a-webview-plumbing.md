# Loop-as-a-Plugin — Phase B2a: Webview Plumbing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `manifold.loop` plugin a webview UI pipeline — a React bundle inlined into the sandboxed nonce-CSP iframe, themed by host-injected CSS vars, talking to the plugin over postMessage — proven by a minimal read-only status panel.

**Architecture:** Extend `build-plugins.mjs` to bundle `src/webview/index.tsx` → `out/webview.js` (browser IIFE). `PluginViewPanel` (generic plugin infra) injects live theme CSS vars into every plugin iframe. The loop plugin registers a `WebviewViewProvider` that inlines the bundle and bridges `LoopEngine` events to the webview. A minimal React app renders loop state live.

**Tech Stack:** TypeScript, React 18.3.1, esbuild (browser/iife), Vitest. Spec: `docs/superpowers/specs/2026-06-06-loop-plugin-phase-b2a-webview-plumbing-design.md`.

---

## Conventions (read once)

- Worktree: symlink `node_modules` from `~/git/manifold` if missing.
- Tests: `npx vitest run <path>`. Typecheck gates: `typecheck:node` (baseline 16), `typecheck:web` (baseline 36), `typecheck:plugins` (clean). No new errors in touched files.
- `out/` is gitignored — commit only `src/`, manifest, and the build/renderer source.
- Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- If `.gitignore` shows an uncommitted `docs/superpowers/` line, restore it: `git restore --source=HEAD .gitignore` (a stray hook re-adds it; it must not be committed).

## File Structure

- `scripts/build-plugins.mjs` — also bundle `src/webview/index.tsx` → `out/webview.js` when present.
- `scripts/build-plugins.test.ts` — add a webview-bundle case.
- `src/renderer/components/editor/plugin-theme-vars.ts` — token name list + `readThemeVars` (pure).
- `src/renderer/components/editor/plugin-theme-vars.test.ts`.
- `src/renderer/components/editor/PluginViewPanel.tsx` — inject theme vars into the iframe.
- `resources/plugins/manifold.loop/src/webview/protocol.ts` — typed host↔webview messages.
- `resources/plugins/manifold.loop/src/webview-host.ts` — `createWebviewHost` (provider + emit).
- `resources/plugins/manifold.loop/src/webview-host.test.ts`.
- `resources/plugins/manifold.loop/src/webview/index.tsx` — minimal React app.
- `resources/plugins/manifold.loop/src/engine.ts` — add `setEmit`.
- `resources/plugins/manifold.loop/src/plugin.ts` — register provider, bridge emit.
- `resources/plugins/manifold.loop/package.json` — add the `views` contribution.

---

## Task 1: Build step — bundle the webview entry

**Files:**
- Modify: `scripts/build-plugins.mjs`
- Test: `scripts/build-plugins.test.ts`

- [ ] **Step 1: Add the failing test case**

In `scripts/build-plugins.test.ts`, inside `beforeAll`, after the `alpha` `plugin.ts` write, add a webview entry to `alpha`:

```ts
  mkdirSync(join(a, 'src', 'webview'), { recursive: true })
  writeFileSync(join(a, 'src', 'webview', 'index.tsx'), `document.title = 'mf-webview-ok'`)
```

Add a new test inside `describe('buildPlugins', …)`:

```ts
  it('also bundles a webview entry to out/webview.js when present', async () => {
    await buildPlugins(root)
    const out = join(root, 'alpha', 'out', 'webview.js')
    expect(existsSync(out)).toBe(true)
    expect(readFileSync(out, 'utf8')).toContain('mf-webview-ok')
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/build-plugins.test.ts`
Expected: FAIL — `out/webview.js` does not exist.

- [ ] **Step 3: Implement the webview bundling**

In `scripts/build-plugins.mjs`, immediately after `built.push(entry)` (and before the loop continues), add a webview build:

```js
    // Optional webview UI: bundle src/webview/index.tsx → out/webview.js (browser IIFE).
    const webviewEntry = join(srcDir, 'webview', 'index.tsx')
    if (existsSync(webviewEntry)) {
      await build({
        entryPoints: [webviewEntry],
        outfile: resolve(root, 'out', 'webview.js'),
        bundle: true,
        platform: 'browser',
        format: 'iife',
        target: 'es2020',
        jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'warning',
      })
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/build-plugins.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-plugins.mjs scripts/build-plugins.test.ts
git commit -m "feat(plugins): build step bundles src/webview/index.tsx → out/webview.js

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Webview message protocol (types)

**Files:**
- Create: `resources/plugins/manifold.loop/src/webview/protocol.ts`

- [ ] **Step 1: Write the protocol types**

Create `resources/plugins/manifold.loop/src/webview/protocol.ts`:

```ts
// resources/plugins/manifold.loop/src/webview/protocol.ts
// Typed messages between the loop webview and the plugin host. Shared by both sides
// (type-only on the webview side; bundling drops it). B2a exercises `ready` → `init` and
// live `status`/`iteration`; the action variants are wired in B2b.
import type { LoopConfig, LoopIteration, LoopStatus } from '../types'

export type HostMsg =
  | { type: 'init'; sessionId: string | null; status: LoopStatus | null; iterations: LoopIteration[]; config: LoopConfig | null }
  | { type: 'status'; status: LoopStatus }
  | { type: 'iteration'; iteration: LoopIteration }
  | { type: 'aiResult'; ok: boolean; text?: string; error?: string }
  | { type: 'actionError'; message: string }

export type WebviewMsg =
  | { type: 'ready' }
  | { type: 'start'; config: LoopConfig }
  | { type: 'stop' }
  | { type: 'saveConfig'; config: LoopConfig }
  | { type: 'restoreBest' }
  | { type: 'clearRequest' }
  | { type: 'improveWithAi'; draft: string; evalCommand: string; targetGlobs: string }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:plugins`
Expected: exit 0 (no errors).

- [ ] **Step 3: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/protocol.ts
git commit -m "feat(loop-plugin): webview message protocol types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Generic theme-var injection in PluginViewPanel

**Files:**
- Create: `src/renderer/components/editor/plugin-theme-vars.ts`
- Test: `src/renderer/components/editor/plugin-theme-vars.test.ts`
- Modify: `src/renderer/components/editor/PluginViewPanel.tsx`

- [ ] **Step 1: Write the failing test for the pure helper**

Create `src/renderer/components/editor/plugin-theme-vars.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readThemeVars, PLUGIN_WEBVIEW_THEME_VARS } from './plugin-theme-vars'

describe('readThemeVars', () => {
  it('collects non-empty values for the requested names', () => {
    const values: Record<string, string> = { '--bg-primary': '#282a36', '--text-primary': ' #fff ', '--accent': '' }
    const out = readThemeVars((n) => values[n] ?? '', ['--bg-primary', '--text-primary', '--accent'])
    expect(out).toEqual({ '--bg-primary': '#282a36', '--text-primary': '#fff' })
  })

  it('exposes a non-empty token name list including loop tokens', () => {
    expect(PLUGIN_WEBVIEW_THEME_VARS).toContain('--text-muted')
    expect(PLUGIN_WEBVIEW_THEME_VARS).toContain('--status-running')
    expect(PLUGIN_WEBVIEW_THEME_VARS.length).toBeGreaterThan(20)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/renderer/components/editor/plugin-theme-vars.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/renderer/components/editor/plugin-theme-vars.ts`:

```ts
// src/renderer/components/editor/plugin-theme-vars.ts
// The set of theme CSS variables the host injects into plugin webviews (which cannot read
// the parent's computed styles across the sandbox). Read live from the document and posted
// to each iframe so plugin UIs match the active Manifold theme.
export const PLUGIN_WEBVIEW_THEME_VARS: readonly string[] = [
  '--font-sans', '--font-mono',
  '--radius-xs', '--radius-sm', '--radius-md',
  '--space-xs', '--space-sm', '--space-md', '--space-lg',
  '--type-ui', '--type-ui-small', '--type-ui-caption',
  '--control-height',
  '--bg-primary', '--bg-secondary', '--bg-input', '--bg-elevated', '--bg-chrome',
  '--text-primary', '--text-secondary', '--text-muted',
  '--accent', '--accent-text', '--accent-subtle',
  '--border', '--divider',
  '--btn-bg', '--btn-hover', '--btn-text',
  '--control-bg', '--control-border',
  '--status-done', '--status-error', '--status-running', '--status-waiting',
]

/** Collect trimmed, non-empty values for `names` using `read` (e.g. getPropertyValue). */
export function readThemeVars(read: (name: string) => string, names: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of names) {
    const value = read(name).trim()
    if (value) out[name] = value
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/components/editor/plugin-theme-vars.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire injection into `PluginViewPanel`**

Edit `src/renderer/components/editor/PluginViewPanel.tsx`. Add imports:

```ts
import { useDockState } from './dock-panel-types'
import { PLUGIN_WEBVIEW_THEME_VARS, readThemeVars } from './plugin-theme-vars'
```

Inside the component, read the theme and define a `postTheme` helper that uses the existing
`post()`:

```ts
  const { theme } = useDockState()

  const postTheme = (): void => {
    const root = document.documentElement
    const styles = getComputedStyle(root)
    post({ type: '__manifold_theme', vars: readThemeVars((n) => styles.getPropertyValue(n), PLUGIN_WEBVIEW_THEME_VARS) })
  }
```

Re-post whenever the theme changes (buffered until the iframe loads):

```ts
  useEffect(() => { postTheme() }, [theme]) // eslint-disable-line react-hooks/exhaustive-deps
```

And in `onLoad`, after the pending-message flush (`pendingRef.current = []`), inject the
current theme:

```ts
    postTheme()
```

(Place the `useEffect([theme])` next to the other effects; `postTheme` is declared above
`onLoad` so both can call it.)

- [ ] **Step 6: Typecheck the renderer**

Run: `npm run typecheck:web 2>&1 | grep -cE "error TS"`
Expected: `36` (baseline unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/editor/plugin-theme-vars.ts src/renderer/components/editor/plugin-theme-vars.test.ts src/renderer/components/editor/PluginViewPanel.tsx
git commit -m "feat(plugins): inject live theme CSS vars into plugin webviews

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Engine `setEmit` + webview host

**Files:**
- Modify: `resources/plugins/manifold.loop/src/engine.ts`
- Create: `resources/plugins/manifold.loop/src/webview-host.ts`
- Test: `resources/plugins/manifold.loop/src/webview-host.test.ts`

- [ ] **Step 1: Add `setEmit` to the engine**

In `resources/plugins/manifold.loop/src/engine.ts`, replace the constructor's reliance on
`this.deps.emit` with a settable field. Change the class fields + constructor:

Find:
```ts
  private runs = new Map<string, RunState>()
  private readonly deps: LoopEngineDeps
  private readonly now: () => number

  constructor(deps: LoopEngineDeps) {
    this.deps = deps
    this.now = deps.now ?? ((): number => Date.now())
  }
```
Replace with:
```ts
  private runs = new Map<string, RunState>()
  private readonly deps: LoopEngineDeps
  private readonly now: () => number
  private emit?: (event: 'status' | 'iteration', payload: unknown) => void

  constructor(deps: LoopEngineDeps) {
    this.deps = deps
    this.now = deps.now ?? ((): number => Date.now())
    this.emit = deps.emit
  }

  /** Override the event sink after construction (used to bridge to the webview). */
  setEmit(fn: (event: 'status' | 'iteration', payload: unknown) => void): void {
    this.emit = fn
  }
```
Then replace the three `this.deps.emit?.(` call sites with `this.emit?.(`:
- in `drive`: `this.deps.emit?.('iteration', iter)` → `this.emit?.('iteration', iter)`
- in `clear`: `this.deps.emit?.('status', cleared)` → `this.emit?.('status', cleared)`
- in `publish`: `this.deps.emit?.('status', { ...run.status })` → `this.emit?.('status', { ...run.status })`

- [ ] **Step 2: Confirm the engine tests still pass**

Run: `npx vitest run resources/plugins/manifold.loop/src/engine.test.ts`
Expected: PASS (12 tests — `deps.emit` still wired via the constructor).

- [ ] **Step 3: Write the failing webview-host test**

Create `resources/plugins/manifold.loop/src/webview-host.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createWebviewHost, type EngineFacade } from './webview-host'

function fakeView() {
  const posted: unknown[] = []
  let onMsg: ((m: unknown) => void) | undefined
  return {
    posted,
    fire: (m: unknown) => onMsg?.(m),
    webview: {
      html: '',
      postMessage: (m: unknown) => { posted.push(m) },
      onDidReceiveMessage: (l: (m: unknown) => void) => { onMsg = l; return { dispose() {} } },
    },
  }
}

const engine: EngineFacade = {
  getStatus: async () => ({ sessionId: 's1', state: 'running', currentIteration: 2 }),
  getIterations: async () => [{ index: 1, startedAt: 0, outcome: 'improved' }],
  getConfig: async () => null,
}

describe('createWebviewHost', () => {
  it('serves HTML with the inlined bundle and a root node', async () => {
    const host = createWebviewHost({ engine, readBundle: () => 'console.log(1)', getActiveSessionId: () => 's1' })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    expect(v.webview.html).toContain('id="root"')
    expect(v.webview.html).toContain('console.log(1)')
  })

  it('escapes </script> sequences in the bundle', async () => {
    const host = createWebviewHost({ engine, readBundle: () => 'var x = "</script>"', getActiveSessionId: () => 's1' })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    expect(v.webview.html).not.toContain('</script>"')
    expect(v.webview.html).toContain('<\\/script>')
  })

  it('replies to ready with an init snapshot', async () => {
    const host = createWebviewHost({ engine, readBundle: () => '', getActiveSessionId: () => 's1' })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'ready' })
    await new Promise((r) => setTimeout(r, 0))
    const init = v.posted.find((m) => (m as { type?: string }).type === 'init') as { sessionId: string; status: { state: string }; iterations: unknown[] }
    expect(init.sessionId).toBe('s1')
    expect(init.status.state).toBe('running')
    expect(init.iterations.length).toBe(1)
  })

  it('forwards engine emit events to the resolved view', async () => {
    const host = createWebviewHost({ engine, readBundle: () => '', getActiveSessionId: () => 's1' })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    host.emit('status', { sessionId: 's1', state: 'finished', currentIteration: 3 })
    host.emit('iteration', { index: 2, startedAt: 0, outcome: 'regressed' })
    const types = v.posted.map((m) => (m as { type?: string }).type)
    expect(types).toContain('status')
    expect(types).toContain('iteration')
  })

  it('emit before a view resolves is a no-op (does not throw)', () => {
    const host = createWebviewHost({ engine, readBundle: () => '', getActiveSessionId: () => null })
    expect(() => host.emit('status', { sessionId: 's', state: 'idle', currentIteration: 0 })).not.toThrow()
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run resources/plugins/manifold.loop/src/webview-host.test.ts`
Expected: FAIL — `./webview-host` not found.

- [ ] **Step 5: Implement the webview host**

Create `resources/plugins/manifold.loop/src/webview-host.ts`:

```ts
// resources/plugins/manifold.loop/src/webview-host.ts
// Builds the loop plugin's WebviewViewProvider: inlines the bundle into nonce-CSP-safe HTML,
// answers `ready` with an init snapshot, and exposes an `emit` that forwards engine events to
// the resolved view. No `manifold` import — the WebviewView is passed in (testable).
import type { WebviewViewProvider, WebviewView } from 'manifold'
import type { HostMsg } from './webview/protocol'

export interface EngineFacade {
  getStatus(sessionId: string): Promise<HostMsg extends { type: 'init'; status: infer S } ? S : never>
  getIterations(): Promise<unknown[]>
  getConfig(sessionId: string): Promise<unknown>
}

export interface WebviewHostOptions {
  engine: { getStatus(sessionId: string): Promise<unknown>; getIterations(): Promise<unknown[]>; getConfig(sessionId: string): Promise<unknown> }
  readBundle: () => string
  getActiveSessionId: () => string | null
}

/** Inline a JS bundle into HTML safely (neutralize `</script>` for the HTML parser). */
export function buildWebviewHtml(bundle: string): string {
  const safe = bundle.replace(/<\/(script)/gi, '<\\/$1')
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{margin:0;padding:0;background:var(--bg-primary,#282a36);color:var(--text-primary,#f8f8f2);font-family:var(--font-sans,system-ui)}</style>',
    '</head><body><div id="root"></div>',
    `<script>${safe}</script>`,
    '</body></html>',
  ].join('')
}

export function createWebviewHost(opts: WebviewHostOptions): {
  provider: WebviewViewProvider
  emit: (event: 'status' | 'iteration', payload: unknown) => void
} {
  let view: WebviewView | undefined

  const emit = (event: 'status' | 'iteration', payload: unknown): void => {
    if (!view) return
    if (event === 'status') view.webview.postMessage({ type: 'status', status: payload })
    else view.webview.postMessage({ type: 'iteration', iteration: payload })
  }

  const provider: WebviewViewProvider = {
    resolveWebviewView(v: WebviewView): void {
      view = v
      v.webview.html = buildWebviewHtml(opts.readBundle())
      v.webview.onDidReceiveMessage(async (raw: unknown) => {
        const msg = raw as { type?: string }
        if (msg.type === 'ready') {
          const sessionId = opts.getActiveSessionId()
          v.webview.postMessage({
            type: 'init',
            sessionId,
            status: sessionId ? await opts.engine.getStatus(sessionId) : null,
            iterations: await opts.engine.getIterations(),
            config: sessionId ? await opts.engine.getConfig(sessionId) : null,
          })
        }
      })
    },
  }

  return { provider, emit }
}
```

(The `EngineFacade` interface above is only an illustrative export for the test import; the
runtime contract is `WebviewHostOptions.engine`. Keep `EngineFacade` as a simple alias to
avoid the conditional-type complexity:)

Replace the `EngineFacade` declaration with:

```ts
export interface EngineFacade {
  getStatus(sessionId: string): Promise<unknown>
  getIterations(): Promise<unknown[]>
  getConfig(sessionId: string): Promise<unknown>
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run resources/plugins/manifold.loop/src/webview-host.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add resources/plugins/manifold.loop/src/engine.ts resources/plugins/manifold.loop/src/webview-host.ts resources/plugins/manifold.loop/src/webview-host.test.ts
git commit -m "feat(loop-plugin): webview host (provider + engine-event bridge) + engine.setEmit

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Minimal webview app

**Files:**
- Create: `resources/plugins/manifold.loop/src/webview/index.tsx`

- [ ] **Step 1: Write the minimal React app**

Create `resources/plugins/manifold.loop/src/webview/index.tsx`:

```tsx
// resources/plugins/manifold.loop/src/webview/index.tsx
// Minimal read-only loop panel (B2a): applies host-injected theme vars, requests init, and
// renders loop state live. Controls + config form arrive in B2b. Talks to the plugin via
// parent.postMessage / window message events only (CSP: connect-src 'none').
import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { HostMsg } from './protocol'
import type { LoopStatus } from '../types'

interface ThemeMsg { type: '__manifold_theme'; vars: Record<string, string> }

interface UiState { sessionId: string | null; status: LoopStatus | null; iterations: number }

function App(): React.JSX.Element {
  const [ui, setUi] = useState<UiState>({ sessionId: null, status: null, iterations: 0 })

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const m = e.data as HostMsg | ThemeMsg | null
      if (!m || typeof m !== 'object') return
      if (m.type === '__manifold_theme') {
        for (const [k, v] of Object.entries(m.vars)) document.documentElement.style.setProperty(k, v)
        return
      }
      if (m.type === 'init') setUi({ sessionId: m.sessionId, status: m.status, iterations: m.iterations.length })
      else if (m.type === 'status') setUi((s) => ({ ...s, status: m.status }))
      else if (m.type === 'iteration') setUi((s) => ({ ...s, iterations: s.iterations + 1 }))
    }
    window.addEventListener('message', onMessage)
    parent.postMessage({ type: 'ready' }, '*')
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const pad = { padding: 'var(--space-md, 14px)', fontSize: 'var(--type-ui-small, 12px)' }
  if (!ui.sessionId) {
    return <div style={{ ...pad, color: 'var(--text-muted, #888)' }}>Select a session to use the autoresearch loop.</div>
  }
  const state = ui.status?.state ?? 'idle'
  return (
    <div style={pad}>
      <div style={{ fontWeight: 600, marginBottom: 'var(--space-sm, 8px)' }}>Autoresearch Loop</div>
      <div style={{ display: 'flex', gap: 'var(--space-sm, 8px)', alignItems: 'center', color: 'var(--text-secondary, #ccc)' }}>
        <span style={{ color: 'var(--status-running, #4ea1ff)' }}>{state}</span>
        <span>iter {ui.status?.currentIteration ?? 0}</span>
        {ui.status?.bestScore !== undefined && <span>best {ui.status.bestScore}</span>}
        <span style={{ color: 'var(--text-muted, #888)' }}>{ui.iterations} logged</span>
      </div>
    </div>
  )
}

const rootEl = document.getElementById('root')
if (rootEl) createRoot(rootEl).render(<App />)
```

- [ ] **Step 2: Typecheck the plugin sources**

Run: `npm run typecheck:plugins`
Expected: exit 0. (If `react-dom/client` types are missing under `tsconfig.plugins.json`,
that config has `skipLibCheck: true`; react/react-dom types resolve from `node_modules`. Fix
any real type errors; do not change the tsconfig.)

- [ ] **Step 3: Build to confirm the bundle compiles**

Run: `npm run build:plugins`
Expected: includes `manifold.loop`; `resources/plugins/manifold.loop/out/webview.js` exists.

Run: `test -f resources/plugins/manifold.loop/out/webview.js && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/index.tsx
git commit -m "feat(loop-plugin): minimal read-only webview (theme + live status)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wire the provider + view contribution

**Files:**
- Modify: `resources/plugins/manifold.loop/src/plugin.ts`
- Modify: `resources/plugins/manifold.loop/package.json`

- [ ] **Step 1: Register the webview provider and bridge emit**

In `resources/plugins/manifold.loop/src/plugin.ts`, add imports:

```ts
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createWebviewHost } from './webview-host'
```

Inside `activate(context)`, after the `engine` is constructed, wire the webview host and
register the provider (the engine no longer needs `emit` in its deps — `setEmit` bridges it):

```ts
  const host = createWebviewHost({
    engine,
    readBundle: () => readFileSync(join(context.pluginUri, 'out', 'webview.js'), 'utf8'),
    getActiveSessionId: () => manifold.agents.activeAgent?.sessionId ?? null,
  })
  engine.setEmit(host.emit)
  context.subscriptions.push(manifold.window.registerWebviewViewProvider('manifold.loop.panel', host.provider))
```

(`engine` already exists from B1; `manifold.window.registerWebviewViewProvider` returns a
`Disposable`. Leave the existing command registrations unchanged.)

- [ ] **Step 2: Add the view contribution to the manifest**

In `resources/plugins/manifold.loop/package.json`, change `contributes` to include `views`
(keep all existing `commands`), and add the view activation event:

```jsonc
  "activationEvents": ["onCommand:manifold.loop.start", "onCommand:manifold.loop.status", "onView:manifold.loop.panel"],
  "contributes": {
    "views": [
      { "id": "manifold.loop.panel", "title": "Loop (plugin)", "description": "Autoresearch loop (plugin).", "launcher": true }
    ],
    "commands": [
      { "command": "manifold.loop.start", "title": "Loop: Start" },
      { "command": "manifold.loop.stop", "title": "Loop: Stop" },
      { "command": "manifold.loop.status", "title": "Loop: Status" },
      { "command": "manifold.loop.iterations", "title": "Loop: Iterations" },
      { "command": "manifold.loop.clear", "title": "Loop: Clear" },
      { "command": "manifold.loop.restoreBest", "title": "Loop: Restore Best" },
      { "command": "manifold.loop.setConfig", "title": "Loop: Set Config" }
    ]
  }
```

(If `onView:` is not a recognized activation event in this codebase, opening the view still
activates the plugin via the host's `resolveView` path — harmless either way.)

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck:plugins`
Expected: exit 0.

Run: `npm run build:plugins`
Expected: `manifold.loop` builds; both `out/plugin.js` and `out/webview.js` present.

- [ ] **Step 4: Run the plugin suite (nothing regressed)**

Run: `npx vitest run resources/plugins/manifold.loop`
Expected: all green (engine 12, webview-host 5, plus eval/iteration-log/git/eval-runner/judge/store).

- [ ] **Step 5: Commit**

```bash
git add resources/plugins/manifold.loop/src/plugin.ts resources/plugins/manifold.loop/package.json
git commit -m "feat(loop-plugin): register webview view + bridge engine events

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Whole-feature verification

**Files:** none (verification only)

- [ ] **Step 1: Build + suites**

Run: `npm run build:plugins` → `manifold.loop` emits `out/plugin.js` + `out/webview.js`.
Run: `npx vitest run scripts/build-plugins.test.ts resources/plugins/manifold.loop src/renderer/components/editor/plugin-theme-vars.test.ts` → green.
Run: `npx vitest run` → full suite green.

- [ ] **Step 2: Typechecks**

Run: `npm run typecheck:node 2>&1 | grep -cE "error TS"` → `16`.
Run: `npm run typecheck:web 2>&1 | grep -cE "error TS"` → `36`.
Run: `npm run typecheck:plugins` → exit 0.

- [ ] **Step 3: Built-in loop untouched + file sizes**

Run: `git diff --name-only main...HEAD -- src/main/loop src/renderer/components/loop src/main/ipc/loop-handlers.ts`
Expected: **empty** (only plugin infra + the new plugin changed; `PluginViewPanel` is not loop).

Run: `wc -l resources/plugins/manifold.loop/src/*.ts resources/plugins/manifold.loop/src/webview/*.ts* src/renderer/components/editor/plugin-theme-vars.ts | sort -n | tail -6`
Expected: all touched files < 300 LOC.

- [ ] **Step 4: Record owed dev smoke**

Append to this plan a note: owed manual verification is `npm run dev` → open the **"Loop
(plugin)"** panel from the "+ Apps" launcher → confirm it renders themed text and "Select a
session…"/state; run a loop via `manifold.loop.start` (command) on an active session and watch
state/iteration count update live; toggle the app theme and confirm the panel's colors follow.

- [ ] **Step 5: Commit the note**

```bash
git add docs/superpowers/plans/2026-06-06-loop-plugin-phase-b2a-webview-plumbing.md
git commit -m "docs(loop-plugin): record owed B2a dev smoke

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** build step → Task 1. theme injection (generic, live) → Task 3. message
protocol → Task 2. webview host (inline bundle, init, emit bridge) → Task 4. minimal webview
→ Task 5. provider registration + `views` contribution → Task 6. verification + owed smoke →
Task 7. ✓

**Placeholder scan:** none. The `EngineFacade` illustrative-type wrinkle in Task 4 is resolved
inline (the step explicitly replaces it with the simple interface). The `onView:` activation
caveat states the exact fallback behavior, not a vague "handle it."

**Type consistency:** `HostMsg`/`WebviewMsg` (Task 2) consumed by `webview-host.ts` (Task 4)
and `index.tsx` (Task 5). `createWebviewHost`/`buildWebviewHtml`/`EngineFacade`/`emit`
signatures match between Task 4's impl, its test, and Task 6's wiring. `setEmit` added in Task
4 and called in Task 6. `PLUGIN_WEBVIEW_THEME_VARS`/`readThemeVars` defined in Task 3 and used
only there. View id `manifold.loop.panel` matches manifest (Task 6), provider registration
(Task 6), and the iframe view id resolved by `PluginViewPanel`.

**Scope:** plumbing + minimal webview; interactive UI deferred to B2b. The one core change
(`PluginViewPanel` theme injection) is generic plugin infra and additive; built-in loop is
untouched (asserted Task 7).
