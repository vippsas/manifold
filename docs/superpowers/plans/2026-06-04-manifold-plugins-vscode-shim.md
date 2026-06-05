# VS Code Compatibility Shim — Phase A (core) + Phase B (validation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run an *unmodified*, command-only VS Code extension inside Manifold by emulating the `vscode` API in the existing out-of-process plugin host — the "be Theia, not code-server" model.

**Architecture:** Manifold already has a VS-Code-shaped extension host (a `utilityProcess` reached over an `RpcEndpoint`, with `manifold`-namespaced APIs served to plugins via a `require()` interceptor). This plan *adds a parallel `vscode` module* served by that same interceptor, backed by the same RPC services. A VS Code extension does `require('vscode')` at load time and receives a Manifold-backed implementation of the small API subset a command-only extension touches: `commands`, `window.show*Message`, `workspace.getConfiguration` (read), `ExtensionContext` (`subscriptions` + `globalState`/`workspaceState`), plus the value types (`Disposable`, `EventEmitter`, `Uri`) and enums extensions reference at module-eval. Unimplemented surface throws a clear, named error rather than crashing or silently no-op'ing. Because this is the first step toward running *untrusted third-party code*, two latent issues from the review follow-ups are closed here: **I2** (per-module API resolution — no global `currentApi` race) and **M5** (command-id collision detection — a later extension can't silently hijack another's command).

**Tech Stack:** TypeScript, Electron `utilityProcess` + `process.parentPort`, the existing `RpcEndpoint` (structured-clone request/reply), electron-vite (`plugin-host` is a second `main` rollup input → `out/main/plugin-host.js`), Vitest (in-memory RPC integration tests; the `extension-host-integration.test.ts` pattern).

---

## Context for the implementer (read once)

You are extending an existing, working plugin system. Do **not** rewrite it. The relevant seams:

- **`src/plugin-host/require-interceptor.ts`** — patches Node's `Module._load` so `require('manifold')` returns the gated API. Today it resolves a **single module-global** `getApi()`. You will change it to resolve **per requesting module** (by the requiring file's path), which serves `manifold` *and* `vscode` and closes the I2 race.
- **`src/plugin-host/index.ts`** — the host bootstrap. Builds the RPC endpoint over `parentPort`, builds the `manifold` API, installs the require interceptor, and constructs the `Activator`. You will register each activating plugin's API frame here.
- **`src/plugin-host/activator.ts`** — loads a plugin's entry module and runs `activate`/`deactivate`. `loadModule(target)` is where the `require()` happens; you register the API frame just before it.
- **`src/plugin-host/api-impl.ts`** — `createApi(endpoint)` returns `{ api: { commands }, invokeLocalCommand }`. The local handler `Map` it owns is shared by **both** the `manifold` and `vscode` command surfaces, so command routing already works for either.
- **`src/main/plugins/extension-host.ts`** — the **main-process** side. Owns the `utilityProcess` and registers `HOST_*` services. You add one new service (`HOST_MESSAGES`).
- **`src/main/plugins/scanner.ts` + `manifest.ts`** — discovery. The scanner reads each plugin's `package.json` and calls `parseManifest`. You add `parseVscodeManifest` and route by which `engines` key is present.
- **`src/shared/plugins/{manifest,rpc,api-types}.ts`** — shared type/constant definitions used by both processes.

**Verification gate (unchanged from prior phases):** runtime tests must be green, and `npm run typecheck:node` / `npm run typecheck:web` must introduce **no new errors vs the established baseline** (node = 16 errors, web = 37 errors — these are pre-existing branch errors, not yours). Electron-only behavior (real `utilityProcess`, the renderer) is covered by the Phase B dev smoke, not CI.

**Out of scope for this plan (deferred to Phase C/D, do not build):** TreeView/`TreeDataProvider`, Webview panels for vscode extensions, QuickPick/InputBox/StatusBar, `vscode.authentication` (Entra/Microsoft OAuth), `FileSystemProvider`, the Open VSX registry/updater, the Azure Resources host-extension API (`x-azResources`), and a per-`vscode`-API capability/permission model. `vscode-azurestorage` itself depends on all of these and is the *last* target, not this one.

---

## File Structure

**New files**
- `src/plugin-host/vscode-shim/index.ts` — `createVscodeShim(deps)` assembles the `vscode` namespace object.
- `src/plugin-host/vscode-shim/types.ts` — `Disposable`, `EventEmitter`, `Uri`, the referenced enums, and `notImplemented(name)` / `VscodeShimError`.
- `src/plugin-host/vscode-shim/window.ts` — `showInformationMessage`/`showWarningMessage`/`showErrorMessage` over `HOST_MESSAGES`.
- `src/plugin-host/vscode-shim/workspace.ts` — `getConfiguration(section)` (read) over `HOST_CONFIG`.
- `src/plugin-host/vscode-shim/extension-context.ts` — builds `ExtensionContext` (`subscriptions`, `globalState`/`workspaceState` Mementos over `HOST_STORAGE`, `extensionPath`/`extensionUri`, `extensionMode`, `secrets` stub).
- `src/main/plugins/vscode-manifest.ts` — `parseVscodeManifest(raw)`.
- Tests colocated: `*.test.ts` next to each new file; one end-to-end test `src/main/plugins/vscode-shim-integration.test.ts`.
- `resources/plugins/hello-vscode/package.json` + `resources/plugins/hello-vscode/out/extension.js` — the unmodified-style validation extension.

**Modified files**
- `src/plugin-host/require-interceptor.ts` — per-module resolution; rename export to `installPluginRequire` + add `registerPluginApis`/`unregisterPluginApis`.
- `src/plugin-host/index.ts` — register API frames; build the shim for `kind: 'vscode'` targets.
- `src/plugin-host/activator.ts` — thread `kind`; register the frame in `loadModule`.
- `src/shared/plugins/rpc.ts` — add `HOST_MESSAGES`.
- `src/shared/plugins/manifest.ts` — relax `engines` to `{ manifold?: string; vscode?: string }`; add `kind` to `PluginDescriptor`.
- `src/main/plugins/scanner.ts` — route to `parseVscodeManifest` when `engines.vscode` present; set `descriptor.kind`.
- `src/main/plugins/extension-host.ts` — register `HOST_MESSAGES`; thread `kind` through `ActivationTarget`.
- `src/main/plugins/command-registry.ts` — track owner + collision detection (M5).
- `src/main/plugins/plugin-manager.ts` — pass `kind` into activation targets.
- `src/preload/index.ts` — whitelist `plugins:notification` in `ALLOWED_LISTEN_CHANNELS`.

---

# Phase A — VS Code shim core + I2/M5 hardening

## Task A1: Recognize VS Code manifests in discovery

**Files:**
- Modify: `src/shared/plugins/manifest.ts`
- Create: `src/main/plugins/vscode-manifest.ts`
- Test: `src/main/plugins/vscode-manifest.test.ts`
- Modify: `src/main/plugins/scanner.ts`

- [ ] **Step 1: Relax shared manifest types and add `kind`**

In `src/shared/plugins/manifest.ts`, change the `engines` field and add `kind` to the descriptor:

```typescript
export interface ManifoldPluginManifest {
  name: string
  publisher: string
  version: string
  displayName?: string
  description?: string
  /** Manifold-native plugins set `manifold`; VS Code extensions set `vscode`. */
  engines: { manifold?: string; vscode?: string }
  /** Extension-host entry (relative to the plugin root). */
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
  /** Which API surface the entry module is authored against. */
  kind: 'manifold' | 'vscode'
}
```

- [ ] **Step 2: Write the failing test for `parseVscodeManifest`**

Create `src/main/plugins/vscode-manifest.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { parseVscodeManifest } from './vscode-manifest'

const valid = {
  name: 'vscode-demo', publisher: 'ms-azuretools', version: '1.2.3',
  displayName: 'Demo', engines: { vscode: '^1.104.0' },
  main: './out/extension.js',
  activationEvents: ['onCommand:demo.hello'],
  contributes: { commands: [{ command: 'demo.hello', title: 'Demo: Hello' }] },
}

describe('parseVscodeManifest', () => {
  it('accepts a valid VS Code manifest and maps it to the Manifold shape', () => {
    const r = parseVscodeManifest(valid)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest.engines.vscode).toBe('^1.104.0')
      expect(r.manifest.main).toBe('./out/extension.js')
      expect(r.manifest.contributes?.commands?.[0]).toEqual({ command: 'demo.hello', title: 'Demo: Hello' })
    }
  })
  it('requires name/publisher/version and engines.vscode', () => {
    expect(parseVscodeManifest({ ...valid, name: undefined }).ok).toBe(false)
    expect(parseVscodeManifest({ ...valid, engines: {} }).ok).toBe(false)
  })
  it('accepts mixed-case publisher/name (VS Code allows it) but rejects path-unsafe ids', () => {
    expect(parseVscodeManifest({ ...valid, publisher: 'GitHub', name: 'copilot' }).ok).toBe(true)
    expect(parseVscodeManifest({ ...valid, name: '../escape' }).ok).toBe(false)
    expect(parseVscodeManifest({ ...valid, publisher: '..' }).ok).toBe(false)
    expect(parseVscodeManifest({ ...valid, name: 'has space' }).ok).toBe(false)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/main/plugins/vscode-manifest.test.ts`
Expected: FAIL — `parseVscodeManifest` is not exported / module not found.

- [ ] **Step 4: Implement `parseVscodeManifest`**

Create `src/main/plugins/vscode-manifest.ts`:

```typescript
// src/main/plugins/vscode-manifest.ts
import type { ManifoldPluginManifest, PluginCommandContribution } from '../../shared/plugins/manifest'

export type VscodeManifestParseResult =
  | { ok: true; manifest: ManifoldPluginManifest }
  | { ok: false; error: string }

// VS Code permits mixed case + hyphens in name/publisher. We keep the id path-safe
// (no separators, no `..`); PluginStorageStore is the backstop. Phase A maps only
// the subset a command-only extension needs (main, activationEvents, commands).
const ID_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/

export function parseVscodeManifest(raw: unknown): VscodeManifestParseResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'manifest is not an object' }
  const m = raw as Record<string, unknown>
  for (const field of ['name', 'publisher', 'version'] as const) {
    if (typeof m[field] !== 'string' || (m[field] as string).length === 0) {
      return { ok: false, error: `missing or invalid "${field}"` }
    }
  }
  for (const field of ['name', 'publisher'] as const) {
    if (!ID_SEGMENT.test(m[field] as string)) {
      return { ok: false, error: `"${field}" must match ${ID_SEGMENT} (path-safe id segment)` }
    }
  }
  const engines = m.engines as Record<string, unknown> | undefined
  if (!engines || typeof engines.vscode !== 'string') {
    return { ok: false, error: 'missing "engines.vscode"' }
  }

  const rawCommands = (m.contributes as Record<string, unknown> | undefined)?.commands
  const commands: PluginCommandContribution[] = []
  if (Array.isArray(rawCommands)) {
    for (const c of rawCommands) {
      if (typeof c === 'object' && c !== null) {
        const cmd = c as Record<string, unknown>
        if (typeof cmd.command === 'string' && typeof cmd.title === 'string') {
          commands.push({ command: cmd.command, title: cmd.title })
        }
      }
    }
  }

  const manifest: ManifoldPluginManifest = {
    name: m.name as string,
    publisher: m.publisher as string,
    version: m.version as string,
    displayName: typeof m.displayName === 'string' ? m.displayName : undefined,
    description: typeof m.description === 'string' ? m.description : undefined,
    engines: { vscode: engines.vscode },
    main: typeof m.main === 'string' ? m.main : undefined,
    activationEvents: Array.isArray(m.activationEvents)
      ? (m.activationEvents.filter((e) => typeof e === 'string') as string[])
      : undefined,
    contributes: commands.length > 0 ? { commands } : undefined,
  }
  return { ok: true, manifest }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/main/plugins/vscode-manifest.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Route the scanner by engines key + set `kind`**

In `src/main/plugins/scanner.ts`, import the new parser and branch on the raw manifest. Replace the parse-and-push block (the `const result = parseManifest(raw)` section) with:

```typescript
import { parseManifest } from './manifest'
import { parseVscodeManifest } from './vscode-manifest'
// ...
    const enginesKey = (raw as { engines?: Record<string, unknown> } | null)?.engines
    const isVscode = !!enginesKey && typeof enginesKey.vscode === 'string'
    const result = isVscode ? parseVscodeManifest(raw) : parseManifest(raw)
    if (!result.ok) {
      errors.push({ path: manifestPath, error: result.error })
      continue
    }
    plugins.push({
      id: `${result.manifest.publisher}.${result.manifest.name}`,
      manifest: result.manifest,
      root,
      origin,
      kind: isVscode ? 'vscode' : 'manifold',
    })
```

- [ ] **Step 7: Update the scanner test for the new `kind` field**

In `src/main/plugins/scanner.test.ts`, add an assertion that a manifold plugin gets `kind: 'manifold'`. Read the file first, then add to the existing "scans a valid plugin" assertions:

```typescript
expect(result.plugins[0].kind).toBe('manifold')
```

(If the test fixture differs, match its existing variable names — read before editing.)

- [ ] **Step 8: Run scanner + manifest tests**

Run: `npx vitest run src/main/plugins/scanner.test.ts src/main/plugins/vscode-manifest.test.ts src/main/plugins/manifest.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/shared/plugins/manifest.ts src/main/plugins/vscode-manifest.ts src/main/plugins/vscode-manifest.test.ts src/main/plugins/scanner.ts src/main/plugins/scanner.test.ts
git commit -m "feat(plugins): recognize VS Code manifests in discovery (kind: vscode)"
```

---

## Task A2: Shim value types — `Disposable`, `EventEmitter`, `Uri`, enums, `notImplemented`

**Files:**
- Create: `src/plugin-host/vscode-shim/types.ts`
- Test: `src/plugin-host/vscode-shim/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugin-host/vscode-shim/types.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { Disposable, EventEmitter, Uri, enums, notImplemented, VscodeShimError } from './types'

describe('vscode-shim types', () => {
  it('Disposable.from disposes all, and instances run their callback once', () => {
    const a = vi.fn(); const b = vi.fn()
    Disposable.from({ dispose: a }, { dispose: b }).dispose()
    expect(a).toHaveBeenCalledOnce(); expect(b).toHaveBeenCalledOnce()
    const cb = vi.fn(); const d = new Disposable(cb)
    d.dispose(); d.dispose()
    expect(cb).toHaveBeenCalledOnce()
  })

  it('EventEmitter fires listeners and stops after dispose of the subscription', () => {
    const e = new EventEmitter<number>(); const seen: number[] = []
    const sub = e.event((n) => seen.push(n))
    e.fire(1); sub.dispose(); e.fire(2)
    expect(seen).toEqual([1])
  })

  it('Uri.file exposes fsPath/path/scheme and round-trips toString', () => {
    const u = Uri.file('/tmp/x.txt')
    expect(u.scheme).toBe('file'); expect(u.fsPath).toBe('/tmp/x.txt')
    expect(Uri.joinPath(u, '..', 'y.txt').fsPath).toBe('/tmp/y.txt')
  })

  it('enums expose the constants extensions reference at module-eval', () => {
    expect(enums.ViewColumn.One).toBe(1)
    expect(enums.ConfigurationTarget.Global).toBe(1)
    expect(enums.TreeItemCollapsibleState.Collapsed).toBe(1)
  })

  it('notImplemented throws a named, descriptive error', () => {
    expect(() => notImplemented('window.createTreeView')()).toThrow(VscodeShimError)
    expect(() => notImplemented('window.createTreeView')()).toThrow(/createTreeView/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/plugin-host/vscode-shim/types.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the types**

Create `src/plugin-host/vscode-shim/types.ts`:

```typescript
// src/plugin-host/vscode-shim/types.ts
import { posix } from 'node:path'

/** Thrown when an extension calls a `vscode` API the shim does not yet implement. */
export class VscodeShimError extends Error {
  constructor(api: string) {
    super(`vscode.${api} is not yet implemented in Manifold's compatibility shim.`)
    this.name = 'VscodeShimError'
  }
}

/** Returns a function that throws a VscodeShimError when called. Use for the long tail. */
export function notImplemented(api: string): (...args: unknown[]) => never {
  return () => { throw new VscodeShimError(api) }
}

export class Disposable {
  private disposed = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly callOnDispose: (...args: any[]) => any) {}
  static from(...items: { dispose(): unknown }[]): Disposable {
    return new Disposable(() => { for (const i of items) { try { i.dispose() } catch { /* ignore */ } } })
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.callOnDispose()
  }
}

export class EventEmitter<T> {
  private readonly listeners = new Set<(e: T) => unknown>()
  readonly event = (listener: (e: T) => unknown): Disposable => {
    this.listeners.add(listener)
    return new Disposable(() => this.listeners.delete(listener))
  }
  fire(data: T): void { for (const l of [...this.listeners]) { try { l(data) } catch { /* ignore */ } } }
  dispose(): void { this.listeners.clear() }
}

/** Minimal Uri compatible with the members command-only extensions read. */
export class Uri {
  private constructor(
    readonly scheme: string,
    readonly authority: string,
    readonly path: string,
    readonly query: string,
    readonly fragment: string,
  ) {}
  get fsPath(): string { return this.path }
  static file(path: string): Uri { return new Uri('file', '', path, '', '') }
  static parse(value: string): Uri {
    const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(value)
    if (!m) return new Uri('file', '', value, '', '')
    return new Uri(m[1], m[2] ?? '', m[3] ?? '', m[4] ?? '', m[5] ?? '')
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, base.authority, posix.join(base.path, ...segments), base.query, base.fragment)
  }
  with(change: { scheme?: string; path?: string }): Uri {
    return new Uri(change.scheme ?? this.scheme, this.authority, change.path ?? this.path, this.query, this.fragment)
  }
  toString(): string {
    const a = this.authority || this.scheme === 'file' ? '//' + this.authority : ''
    return `${this.scheme}:${a}${this.path}${this.query ? '?' + this.query : ''}${this.fragment ? '#' + this.fragment : ''}`
  }
}

/** Enum-like constants extensions reference at module load. Calling unsupported
 *  *behavior* still throws via notImplemented; these just prevent eval-time crashes. */
export const enums = {
  ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  ExtensionKind: { UI: 1, Workspace: 2 },
  UIKind: { Desktop: 1, Web: 2 },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  QuickPickItemKind: { Separator: -1, Default: 0 },
  ProgressLocation: { SourceControl: 1, Window: 10, Notification: 15 },
} as const
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/plugin-host/vscode-shim/types.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/plugin-host/vscode-shim/types.ts src/plugin-host/vscode-shim/types.test.ts
git commit -m "feat(plugins): vscode-shim value types (Disposable, EventEmitter, Uri, enums)"
```

---

## Task A3: `HOST_MESSAGES` RPC service (main side) for `window.show*Message`

**Files:**
- Modify: `src/shared/plugins/rpc.ts`
- Modify: `src/main/plugins/extension-host.ts`
- Modify: `src/preload/index.ts`
- Test: `src/main/plugins/extension-host-messages.test.ts`

- [ ] **Step 1: Add the RPC context constant**

In `src/shared/plugins/rpc.ts`, add alongside the other context ids:

```typescript
export const HOST_MESSAGES = 'HostMessages'         // main, called by host
```

- [ ] **Step 2: Write the failing test (in-memory RPC round-trip)**

Create `src/main/plugins/extension-host-messages.test.ts`. This mirrors the existing `extension-host-integration.test.ts` style: drive the `HOST_MESSAGES` service through an in-memory endpoint pair and assert it forwards to `send` and the debug log.

```typescript
import { describe, expect, it, vi } from 'vitest'
import { RpcEndpoint, HOST_MESSAGES, type RpcMessage } from '../../shared/plugins/rpc'

// A minimal in-memory transport pair, as used in extension-host-integration.test.ts.
function pair(): [RpcEndpoint, RpcEndpoint] {
  const a = new RpcEndpoint({ post: (m: RpcMessage) => void b.handleMessage(m) })
  const b = new RpcEndpoint({ post: (m: RpcMessage) => void a.handleMessage(m) })
  return [a, b]
}

describe('HOST_MESSAGES service contract', () => {
  it('forwards showMessage to the renderer channel and returns undefined (no buttons)', async () => {
    const [host, main] = pair()
    const sent: unknown[] = []
    main.registerService(HOST_MESSAGES, {
      $showMessage: (level: string, message: string, items: string[]) => {
        sent.push({ level, message, items })
        return undefined
      },
    })
    const proxy = host.getProxy<{ $showMessage(l: string, m: string, i: string[]): Promise<string | undefined> }>(HOST_MESSAGES)
    const result = await proxy.$showMessage('info', 'Hello World', [])
    expect(result).toBeUndefined()
    expect(sent).toEqual([{ level: 'info', message: 'Hello World', items: [] }])
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/main/plugins/extension-host-messages.test.ts`
Expected: FAIL — `HOST_MESSAGES` is not exported yet.

- [ ] **Step 4: Register `HOST_MESSAGES` in the real ExtensionHost**

In `src/main/plugins/extension-host.ts`: add `HOST_MESSAGES` to the rpc import, and register the service inside `ensure()` (next to `HOST_CONFIG`). It logs and forwards to the renderer; Phase A returns `undefined` (no buttons rendered yet):

```typescript
    endpoint.registerService(HOST_MESSAGES, {
      $showMessage: (level: string, message: string, _items: string[]) => {
        debugLog(`[plugins] message(${level}): ${message}`)
        this.send?.('plugins:notification', level, message)
        return undefined
      },
    })
```

- [ ] **Step 5: Whitelist the renderer channel in preload**

In `src/preload/index.ts`, add `'plugins:notification'` to `ALLOWED_LISTEN_CHANNELS` (the array that already contains `plugins:webview-html` / `plugins:webview-message`). Read the file first to match its exact formatting. (The renderer toast UI is Phase C; for now the channel is simply listenable.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/main/plugins/extension-host-messages.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/plugins/rpc.ts src/main/plugins/extension-host.ts src/main/plugins/extension-host-messages.test.ts src/preload/index.ts
git commit -m "feat(plugins): HOST_MESSAGES service for vscode window.show*Message"
```

---

## Task A4: Shim `window`, `workspace`, and `ExtensionContext`

**Files:**
- Create: `src/plugin-host/vscode-shim/window.ts`
- Create: `src/plugin-host/vscode-shim/workspace.ts`
- Create: `src/plugin-host/vscode-shim/extension-context.ts`
- Test: `src/plugin-host/vscode-shim/window.test.ts`
- Test: `src/plugin-host/vscode-shim/extension-context.test.ts`

- [ ] **Step 1: Write the failing test for `window`**

Create `src/plugin-host/vscode-shim/window.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { createShimWindow } from './window'

describe('shim window', () => {
  it('routes show*Message to HOST_MESSAGES with the right level', async () => {
    const $showMessage = vi.fn().mockResolvedValue(undefined)
    const w = createShimWindow({ $showMessage } as never)
    await w.showInformationMessage('hi')
    await w.showWarningMessage('careful')
    await w.showErrorMessage('boom', 'Retry')
    expect($showMessage.mock.calls).toEqual([
      ['info', 'hi', []],
      ['warning', 'careful', []],
      ['error', 'boom', ['Retry']],
    ])
  })

  it('createTreeView throws a VscodeShimError (deferred to Phase C)', () => {
    const w = createShimWindow({ $showMessage: vi.fn() } as never)
    expect(() => (w as { createTreeView: () => unknown }).createTreeView()).toThrow(/createTreeView/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/plugin-host/vscode-shim/window.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `window`**

Create `src/plugin-host/vscode-shim/window.ts`:

```typescript
// src/plugin-host/vscode-shim/window.ts
import { notImplemented } from './types'

interface HostMessagesProxy {
  $showMessage(level: 'info' | 'warning' | 'error', message: string, items: string[]): Promise<string | undefined>
}

export function createShimWindow(host: HostMessagesProxy): Record<string, unknown> {
  const show = (level: 'info' | 'warning' | 'error') =>
    (message: string, ...items: unknown[]): Promise<string | undefined> =>
      host.$showMessage(level, message, items.filter((i): i is string => typeof i === 'string'))
  return {
    showInformationMessage: show('info'),
    showWarningMessage: show('warning'),
    showErrorMessage: show('error'),
    // Deferred surface — present so references resolve, but throws when called.
    createTreeView: notImplemented('window.createTreeView'),
    registerTreeDataProvider: notImplemented('window.registerTreeDataProvider'),
    createWebviewPanel: notImplemented('window.createWebviewPanel'),
    registerWebviewViewProvider: notImplemented('window.registerWebviewViewProvider'),
    showQuickPick: notImplemented('window.showQuickPick'),
    showInputBox: notImplemented('window.showInputBox'),
    createStatusBarItem: notImplemented('window.createStatusBarItem'),
    withProgress: notImplemented('window.withProgress'),
    createOutputChannel: notImplemented('window.createOutputChannel'),
  }
}
```

- [ ] **Step 4: Run the window test to verify it passes**

Run: `npx vitest run src/plugin-host/vscode-shim/window.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement `workspace` (read-only config)**

Create `src/plugin-host/vscode-shim/workspace.ts`. `getConfiguration(section)` reads via `HOST_CONFIG.$get(pluginId, key)`; `update` is unsupported in Phase A and logs+throws so misuse is loud:

```typescript
// src/plugin-host/vscode-shim/workspace.ts
import { notImplemented } from './types'

interface HostConfigProxy { $get(pluginId: string, key: string): Promise<unknown> }

export function createShimWorkspace(host: HostConfigProxy, pluginId: string): Record<string, unknown> {
  function getConfiguration(section?: string): Record<string, unknown> {
    const full = (key: string) => (section ? `${section}.${key}` : key)
    return {
      get: <T>(key: string, defaultValue?: T): Promise<T | undefined> =>
        host.$get(pluginId, full(key)).then((v) => (v === undefined ? defaultValue : (v as T))),
      has: (key: string): Promise<boolean> => host.$get(pluginId, full(key)).then((v) => v !== undefined),
      update: notImplemented('workspace.getConfiguration().update'),
      inspect: notImplemented('workspace.getConfiguration().inspect'),
    }
  }
  return {
    getConfiguration,
    workspaceFolders: undefined,
    name: undefined,
    fs: undefined,
    registerFileSystemProvider: notImplemented('workspace.registerFileSystemProvider'),
    onDidChangeConfiguration: notImplemented('workspace.onDidChangeConfiguration'),
  }
}
```

- [ ] **Step 6: Write the failing test for `ExtensionContext`**

Create `src/plugin-host/vscode-shim/extension-context.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { createExtensionContext } from './extension-context'

describe('extension context', () => {
  it('globalState reads/writes through HOST_STORAGE', async () => {
    const store = new Map<string, unknown>()
    const host = {
      $get: vi.fn((_id: string, key: string) => Promise.resolve(store.get(key))),
      $update: vi.fn((_id: string, key: string, value: unknown) => { store.set(key, value); return Promise.resolve() }),
    }
    const ctx = createExtensionContext({ host: host as never, pluginId: 'pub.ext', extensionPath: '/x' })
    expect(ctx.subscriptions).toEqual([])
    await ctx.globalState.update('count', 1)
    expect(await ctx.globalState.get('count')).toBe(1)
    expect(await ctx.globalState.get('missing', 'fallback')).toBe('fallback')
    expect(ctx.extensionPath).toBe('/x')
    expect(ctx.extensionUri.fsPath).toBe('/x')
  })

  it('namespaces workspaceState separately from globalState', async () => {
    const store = new Map<string, unknown>()
    const host = {
      $get: vi.fn((_id: string, key: string) => Promise.resolve(store.get(key))),
      $update: vi.fn((_id: string, key: string, value: unknown) => { store.set(key, value); return Promise.resolve() }),
    }
    const ctx = createExtensionContext({ host: host as never, pluginId: 'pub.ext', extensionPath: '/x' })
    await ctx.globalState.update('k', 'g')
    await ctx.workspaceState.update('k', 'w')
    expect(await ctx.globalState.get('k')).toBe('g')
    expect(await ctx.workspaceState.get('k')).toBe('w')
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/plugin-host/vscode-shim/extension-context.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `ExtensionContext`**

Create `src/plugin-host/vscode-shim/extension-context.ts`:

```typescript
// src/plugin-host/vscode-shim/extension-context.ts
import { Disposable, Uri, enums, notImplemented } from './types'

interface HostStorageProxy {
  $get(pluginId: string, key: string): Promise<unknown>
  $update(pluginId: string, key: string, value: unknown): Promise<void>
}

/** A vscode.Memento backed by HOST_STORAGE. `prefix` separates global vs workspace state. */
function makeMemento(host: HostStorageProxy, pluginId: string, prefix: string): Record<string, unknown> {
  const k = (key: string) => `${prefix}:${key}`
  return {
    get: <T>(key: string, defaultValue?: T): Promise<T | undefined> =>
      host.$get(pluginId, k(key)).then((v) => (v === undefined ? defaultValue : (v as T))),
    update: (key: string, value: unknown): Promise<void> => host.$update(pluginId, k(key), value),
    keys: notImplemented('Memento.keys'),
  }
}

export function createExtensionContext(deps: {
  host: HostStorageProxy
  pluginId: string
  extensionPath: string
}): {
  subscriptions: { dispose(): unknown }[]
  globalState: Record<string, unknown>
  workspaceState: Record<string, unknown>
  secrets: Record<string, unknown>
  extensionPath: string
  extensionUri: Uri
  extensionMode: number
  asAbsolutePath: (p: string) => string
} {
  const { host, pluginId, extensionPath } = deps
  return {
    subscriptions: [],
    globalState: makeMemento(host, pluginId, 'global'),
    workspaceState: makeMemento(host, pluginId, 'workspace'),
    secrets: {
      get: notImplemented('SecretStorage.get'),
      store: notImplemented('SecretStorage.store'),
      delete: notImplemented('SecretStorage.delete'),
      onDidChange: notImplemented('SecretStorage.onDidChange'),
    },
    extensionPath,
    extensionUri: Uri.file(extensionPath),
    extensionMode: enums.ExtensionMode.Production,
    asAbsolutePath: (p: string): string => `${extensionPath}/${p}`,
  }
}

export { Disposable }
```

- [ ] **Step 9: Run window + context tests**

Run: `npx vitest run src/plugin-host/vscode-shim/window.test.ts src/plugin-host/vscode-shim/extension-context.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/plugin-host/vscode-shim/window.ts src/plugin-host/vscode-shim/window.test.ts src/plugin-host/vscode-shim/workspace.ts src/plugin-host/vscode-shim/extension-context.ts src/plugin-host/vscode-shim/extension-context.test.ts
git commit -m "feat(plugins): vscode-shim window, workspace(config read), ExtensionContext"
```

---

## Task A5: Assemble the `vscode` namespace (`createVscodeShim`)

**Files:**
- Create: `src/plugin-host/vscode-shim/index.ts`
- Test: `src/plugin-host/vscode-shim/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugin-host/vscode-shim/index.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { createVscodeShim } from './index'
import { Disposable, EventEmitter, Uri } from './types'

function deps() {
  return {
    commands: {
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
      executeCommand: vi.fn().mockResolvedValue(undefined),
    },
    messagesProxy: { $showMessage: vi.fn().mockResolvedValue(undefined) },
    configProxy: { $get: vi.fn().mockResolvedValue(undefined) },
    storageProxy: { $get: vi.fn().mockResolvedValue(undefined), $update: vi.fn().mockResolvedValue(undefined) },
    pluginId: 'pub.ext',
    extensionPath: '/ext',
  }
}

describe('createVscodeShim', () => {
  it('exposes commands, window, workspace, the value types, and a context factory', () => {
    const { vscode } = createVscodeShim(deps() as never)
    expect(typeof (vscode.commands as { registerCommand: unknown }).registerCommand).toBe('function')
    expect(typeof (vscode.window as { showInformationMessage: unknown }).showInformationMessage).toBe('function')
    expect(typeof (vscode.workspace as { getConfiguration: unknown }).getConfiguration).toBe('function')
    expect(vscode.Disposable).toBe(Disposable)
    expect(vscode.EventEmitter).toBe(EventEmitter)
    expect(vscode.Uri).toBe(Uri)
    expect((vscode.ViewColumn as { One: number }).One).toBe(1)
  })

  it('createContext builds an ExtensionContext bound to the plugin id', async () => {
    const d = deps()
    const { createContext } = createVscodeShim(d as never)
    const ctx = createContext()
    await ctx.globalState.update('k', 1)
    expect(d.storageProxy.$update).toHaveBeenCalledWith('pub.ext', 'global:k', 1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/plugin-host/vscode-shim/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `createVscodeShim`**

Create `src/plugin-host/vscode-shim/index.ts`:

```typescript
// src/plugin-host/vscode-shim/index.ts
import { Disposable, EventEmitter, Uri, enums, VscodeShimError } from './types'
import { createShimWindow } from './window'
import { createShimWorkspace } from './workspace'
import { createExtensionContext } from './extension-context'

/** A subset of ManifoldApi['commands'] — the shared local command layer. */
interface CommandsLayer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerCommand(id: string, handler: (...args: any[]) => unknown): { dispose(): void }
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>
}

export interface VscodeShimDeps {
  commands: CommandsLayer
  messagesProxy: { $showMessage(level: 'info' | 'warning' | 'error', message: string, items: string[]): Promise<string | undefined> }
  configProxy: { $get(pluginId: string, key: string): Promise<unknown> }
  storageProxy: { $get(pluginId: string, key: string): Promise<unknown>; $update(pluginId: string, key: string, value: unknown): Promise<void> }
  pluginId: string
  extensionPath: string
}

export function createVscodeShim(deps: VscodeShimDeps): {
  vscode: Record<string, unknown>
  createContext: () => ReturnType<typeof createExtensionContext>
} {
  const vscode: Record<string, unknown> = {
    commands: {
      registerCommand: deps.commands.registerCommand,
      executeCommand: deps.commands.executeCommand,
      // VS Code's registerTextEditorCommand etc. are not supported yet.
      getCommands: () => Promise.resolve([] as string[]),
    },
    window: createShimWindow(deps.messagesProxy),
    workspace: createShimWorkspace(deps.configProxy, deps.pluginId),
    env: {
      openExternal: (uri: unknown) => Promise.resolve(false),
      clipboard: { readText: () => Promise.resolve(''), writeText: () => Promise.resolve() },
      appName: 'Manifold',
      uriScheme: 'manifold',
    },
    // Value types + constructors.
    Disposable,
    EventEmitter,
    Uri,
    VscodeShimError,
    // Enums spread at the top level (vscode.ViewColumn.One, etc.).
    ...enums,
  }

  const createContext = (): ReturnType<typeof createExtensionContext> =>
    createExtensionContext({ host: deps.storageProxy, pluginId: deps.pluginId, extensionPath: deps.extensionPath })

  return { vscode, createContext }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/plugin-host/vscode-shim/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/plugin-host/vscode-shim/index.ts src/plugin-host/vscode-shim/index.test.ts
git commit -m "feat(plugins): assemble the vscode namespace (createVscodeShim)"
```

---

## Task A6: Per-module `require` resolution (closes I2)

**Files:**
- Modify: `src/plugin-host/require-interceptor.ts`
- Test: `src/plugin-host/require-interceptor.test.ts`

**Why:** Today `installManifoldRequire(getApi)` resolves a single module-global API. Two plugins activating concurrently (or a lazy `require('manifold')` after an `await`) could observe the wrong plugin's API (capability confusion). The fix resolves the API from the **requiring module's file path**: each plugin's files live under its root, so we map `parent.filename` → that plugin's frame. This is robust for top-level *and* lazy requires, needs no global, and serves both `manifold` and `vscode`.

- [ ] **Step 1: Write the failing test**

Create `src/plugin-host/require-interceptor.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { resolvePluginModule, registerPluginApis, unregisterPluginApis } from './require-interceptor'

describe('per-module plugin require resolution', () => {
  it('resolves manifold/vscode for files under a registered plugin root', () => {
    const manifold = { tag: 'manifold-A' }
    const vscode = { tag: 'vscode-A' }
    registerPluginApis('/plugins/a', { manifold, vscode })
    expect(resolvePluginModule('manifold', '/plugins/a/out/main.js')).toBe(manifold)
    expect(resolvePluginModule('vscode', '/plugins/a/out/main.js')).toBe(vscode)
    unregisterPluginApis('/plugins/a')
    expect(resolvePluginModule('manifold', '/plugins/a/out/main.js')).toBeUndefined()
  })

  it('does not cross-resolve between two plugins', () => {
    registerPluginApis('/plugins/a', { vscode: { tag: 'A' } })
    registerPluginApis('/plugins/b', { vscode: { tag: 'B' } })
    expect((resolvePluginModule('vscode', '/plugins/a/x.js') as { tag: string }).tag).toBe('A')
    expect((resolvePluginModule('vscode', '/plugins/b/x.js') as { tag: string }).tag).toBe('B')
    expect(resolvePluginModule('vscode', '/elsewhere/x.js')).toBeUndefined()
    unregisterPluginApis('/plugins/a'); unregisterPluginApis('/plugins/b')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/plugin-host/require-interceptor.test.ts`
Expected: FAIL — these exports don't exist.

- [ ] **Step 3: Rewrite the interceptor**

Replace the contents of `src/plugin-host/require-interceptor.ts`:

```typescript
// src/plugin-host/require-interceptor.ts
import { sep } from 'node:path'

export interface PluginApiFrame { manifold?: unknown; vscode?: unknown }

const frames = new Map<string, PluginApiFrame>()

/** Register the API bundle for a plugin, keyed by its root folder. */
export function registerPluginApis(root: string, frame: PluginApiFrame): void {
  frames.set(root, frame)
}
export function unregisterPluginApis(root: string): void {
  frames.delete(root)
}

/** Resolve `manifold`/`vscode` for a module by the requiring file's path. */
export function resolvePluginModule(request: 'manifold' | 'vscode', requesterPath: string | undefined): unknown {
  if (!requesterPath) return undefined
  for (const [root, frame] of frames) {
    if (requesterPath === root || requesterPath.startsWith(root + sep)) {
      return request === 'manifold' ? frame.manifold : frame.vscode
    }
  }
  return undefined
}

/** Patch Node's module loader so plugin files get Manifold-backed `manifold`/`vscode`. */
export function installPluginRequire(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
  const Module = require('module') as any
  const originalLoad = Module._load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Module._load = function (request: string, parent: any, ...rest: any[]): unknown {
    if (request === 'manifold' || request === 'vscode') {
      const api = resolvePluginModule(request, parent?.filename)
      if (api !== undefined) return api
    }
    return originalLoad.call(this, request, parent, ...rest)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/plugin-host/require-interceptor.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/plugin-host/require-interceptor.ts src/plugin-host/require-interceptor.test.ts
git commit -m "fix(plugins): per-module require resolution for manifold/vscode (closes I2 race)"
```

---

## Task A7: Command-id collision detection (closes M5)

**Files:**
- Modify: `src/main/plugins/command-registry.ts`
- Modify: `src/main/plugins/extension-host.ts` (pass owner to `register`)
- Test: `src/main/plugins/command-registry.test.ts`

**Why:** Command ids are global. A later plugin currently overwrites an earlier registrant silently — once third-party code runs, that's a hijack vector. VS Code command ids can't be forced to namespace, so instead we record the owning plugin and **reject** a cross-owner duplicate (first writer wins, logged).

- [ ] **Step 1: Write/extend the failing test**

Read `src/main/plugins/command-registry.test.ts`, then add:

```typescript
it('keeps the first registrant on cross-owner id collision and reports it', () => {
  const reg = new CommandRegistry()
  const warnings: string[] = []
  reg.onCollision((msg) => warnings.push(msg))
  reg.register('shared.cmd', 'pub.a', async () => 'A')
  reg.register('shared.cmd', 'pub.b', async () => 'B') // collision — ignored
  expect(reg.ownerOf('shared.cmd')).toBe('pub.a')
  expect(warnings).toHaveLength(1)
  expect(warnings[0]).toMatch(/shared\.cmd/)
})

it('lets the same owner re-register (idempotent reactivation)', () => {
  const reg = new CommandRegistry()
  reg.register('c', 'pub.a', async () => 1)
  reg.register('c', 'pub.a', async () => 2)
  expect(reg.has('c')).toBe(true)
  expect(reg.ownerOf('c')).toBe('pub.a')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/main/plugins/command-registry.test.ts`
Expected: FAIL — `register` arity, `ownerOf`, `onCollision` don't exist.

- [ ] **Step 3: Implement collision-aware registry**

Replace `src/main/plugins/command-registry.ts`:

```typescript
// src/main/plugins/command-registry.ts
type Invoker = (id: string, args: unknown[]) => Promise<unknown>

/** Records command ownership and routes execution to the owning invoker.
 *  First-writer-wins on cross-owner id collision (prevents silent hijack). */
export class CommandRegistry {
  private readonly invokers = new Map<string, Invoker>()
  private readonly owners = new Map<string, string>()
  private onCollisionCb: ((message: string) => void) | null = null

  onCollision(cb: (message: string) => void): void { this.onCollisionCb = cb }

  register(id: string, owner: string, invoke: Invoker): void {
    const existing = this.owners.get(id)
    if (existing !== undefined && existing !== owner) {
      this.onCollisionCb?.(`command id "${id}" already registered by "${existing}"; ignoring registration from "${owner}"`)
      return
    }
    this.owners.set(id, owner)
    this.invokers.set(id, invoke)
  }

  unregister(id: string, owner: string): void {
    if (this.owners.get(id) !== owner) return
    this.owners.delete(id)
    this.invokers.delete(id)
  }

  has(id: string): boolean { return this.invokers.has(id) }
  ownerOf(id: string): string | undefined { return this.owners.get(id) }

  async execute(id: string, args: unknown[]): Promise<unknown> {
    const invoke = this.invokers.get(id)
    if (!invoke) throw new Error(`command not found: ${id}`)
    return invoke(id, args)
  }
}
```

- [ ] **Step 4: Update ExtensionHost to pass the owner**

In `src/main/plugins/extension-host.ts`, the `HOST_COMMANDS` service currently calls `this.commands.register(id, ...)` / `unregister(id)` with no owner. The owner is the currently-activating plugin id. Thread it: store the most recent activation target id on the host and use it. In `ensure()`, change the `HOST_COMMANDS` registration:

```typescript
    endpoint.registerService(HOST_COMMANDS, {
      $registerCommand: (id: string) => { this.commands.register(id, this.activatingPluginId ?? 'unknown', (cid, args) => pluginCommands.$invokeCommand(cid, args)) },
      $unregisterCommand: (id: string) => { this.commands.unregister(id, this.activatingPluginId ?? 'unknown') },
      $executeCommand: (id: string, args: unknown[]) => this.commands.execute(id, args),
    })
```

Add the field and set it in `activate`/`resolveView` (which already receive the `ActivationTarget`). Near the top of the class:

```typescript
  private activatingPluginId: string | null = null
```

And wire collision logging once, in `ensure()` after `const pluginCommands = ...`:

```typescript
    this.commands.onCollision((msg) => debugLog(`[plugins] ${msg}`))
```

In `activate(target)` and `resolveView(target, ...)`, set `this.activatingPluginId = target.id` *before* the `$activate` call. (Command registration happens synchronously inside `activate`, so the id is correct.)

- [ ] **Step 5: Run command-registry tests**

Run: `npx vitest run src/main/plugins/command-registry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/plugins/command-registry.ts src/main/plugins/command-registry.test.ts src/main/plugins/extension-host.ts
git commit -m "fix(plugins): command-id collision detection, first-writer-wins (closes M5)"
```

---

## Task A8: Wire `kind` → shim through activation

**Files:**
- Modify: `src/plugin-host/activator.ts`
- Modify: `src/plugin-host/index.ts`
- Modify: `src/main/plugins/extension-host.ts` (`ActivationTarget` already imported here)
- Modify: `src/main/plugins/plugin-manager.ts`
- Test: `src/plugin-host/activator.test.ts` (update for new signature)

- [ ] **Step 1: Add `kind` to `ActivationTarget` and register frames in the loader**

In `src/plugin-host/activator.ts`, extend the target and drop the dead `makeApi` param (M6 cleanup — it's unused). The activator now takes a single `loadModule`:

```typescript
// src/plugin-host/activator.ts
import type { ManifoldContext, PluginModule } from '../shared/plugins/api-types'

export interface ActivationTarget { id: string; root: string; main: string; kind: 'manifold' | 'vscode'; capabilities?: string[] }

type LoadModule = (target: ActivationTarget) => PluginModule

interface ActivePlugin { module: PluginModule; context: ManifoldContext }

/** Loads plugin entry modules and runs their activate/deactivate lifecycle. */
export class Activator {
  private readonly active = new Map<string, ActivePlugin>()

  constructor(private readonly loadModule: LoadModule) {}

  isActive(id: string): boolean { return this.active.has(id) }

  async activate(target: ActivationTarget): Promise<void> {
    if (this.active.has(target.id)) return
    const module = this.loadModule(target)
    const context: ManifoldContext = { subscriptions: [], pluginUri: target.root }
    this.active.set(target.id, { module, context })
    await module.activate?.(context)
  }

  async deactivate(id: string): Promise<void> {
    const entry = this.active.get(id)
    if (!entry) return
    this.active.delete(id)
    await entry.module.deactivate?.()
    for (const sub of entry.context.subscriptions) {
      try { sub.dispose() } catch { /* ignore disposal errors */ }
    }
  }
}
```

Note: for `kind: 'vscode'` the context passed to `activate` must be the VS Code `ExtensionContext`, not `ManifoldContext`. That swap happens in `index.ts` (Step 2) where the loader knows the kind; the Activator stays kind-agnostic by having `loadModule` return a module whose `activate` is already bound — see Step 2's wrapper.

- [ ] **Step 2: Build the right API frame per kind in `index.ts`**

Rewrite the relevant section of `src/plugin-host/index.ts`. Import the shim and the new interceptor exports, build the proxies once, and in the loader register the frame and (for vscode) wrap the module so it receives a vscode `ExtensionContext`:

```typescript
// src/plugin-host/index.ts (key changes)
import { RpcEndpoint, PLUGIN_ACTIVATION, PLUGIN_COMMANDS, PLUGIN_WEBVIEW, PLUGIN_WORKSPACE, PLUGIN_CONFIG, HOST_MESSAGES, HOST_CONFIG, HOST_STORAGE, type RpcMessage } from '../shared/plugins/rpc'
import { Activator, type ActivationTarget } from './activator'
import { createApi } from './api-impl'
import { createWindowApi } from './window-api'
import { installPluginRequire, registerPluginApis } from './require-interceptor'
import { buildGatedApi } from './gated-api'
import { createStorageApi } from './storage-api'
import { WorkspaceContext } from './workspace-api'
import { ConfigContext } from './config-api'
import { createVscodeShim } from './vscode-shim'
import type { PluginModule } from '../shared/plugins/api-types'

// ... parentPort + endpoint as before ...

const { api: commandsApi, invokeLocalCommand } = createApi(endpoint)
const { windowApi, resolveView, deliverMessage } = createWindowApi(endpoint)
const sharedNamespaces = { commands: commandsApi.commands, window: windowApi }
const workspaceContext = new WorkspaceContext()
const configContext = new ConfigContext()

// Proxies the vscode shim needs.
const messagesProxy = endpoint.getProxy<{ $showMessage(l: 'info' | 'warning' | 'error', m: string, i: string[]): Promise<string | undefined> }>(HOST_MESSAGES)
const configProxy = endpoint.getProxy<{ $get(id: string, key: string): Promise<unknown> }>(HOST_CONFIG)
const storageProxy = endpoint.getProxy<{ $get(id: string, key: string): Promise<unknown>; $update(id: string, key: string, v: unknown): Promise<void> }>(HOST_STORAGE)

installPluginRequire()

const activator = new Activator((t: ActivationTarget): PluginModule => {
  if (t.kind === 'vscode') {
    const { vscode, createContext } = createVscodeShim({
      commands: commandsApi.commands,
      messagesProxy, configProxy, storageProxy,
      pluginId: t.id, extensionPath: t.root,
    })
    registerPluginApis(t.root, { vscode })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(join(t.root, t.main)) as PluginModule
    const ctx = createContext()
    // Adapt: VS Code's activate(context) gets the vscode ExtensionContext.
    return {
      activate: () => mod.activate?.(ctx as never),
      deactivate: () => mod.deactivate?.(),
    }
  }
  const manifold = buildGatedApi(t.capabilities ?? [], sharedNamespaces, {
    storage: () => createStorageApi(endpoint, t.id),
    workspace: () => workspaceContext.makeApi(),
    configuration: () => configContext.makeApi(endpoint, t.id),
  })
  registerPluginApis(t.root, { manifold })
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(join(t.root, t.main)) as PluginModule
})

// ... registerService blocks unchanged ...
```

Remove the old `let currentApi = ...` block and the `installManifoldRequire(() => currentApi)` call entirely (replaced above).

- [ ] **Step 3: Thread `kind` from PluginManager**

In `src/main/plugins/plugin-manager.ts`, every place that builds an activation target (`activate`, `openView`) must include `kind`. Update both:

```typescript
  async activate(pluginId: string): Promise<void> {
    const p = this.plugins.find((x) => x.id === pluginId)
    if (!p || !p.manifest.main) return
    await this.host.activate({ id: p.id, root: p.root, main: p.manifest.main, kind: p.kind, capabilities: p.manifest.capabilities ?? [] })
  }
```

```typescript
  async openView(viewId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.manifest.contributes?.views?.some((v) => v.id === viewId))
    if (!plugin || !plugin.manifest.main) return
    await this.host.resolveView({ id: plugin.id, root: plugin.root, main: plugin.manifest.main, kind: plugin.kind, capabilities: plugin.manifest.capabilities ?? [] }, viewId)
  }
```

- [ ] **Step 4: Set `activatingPluginId` in ExtensionHost.activate/resolveView**

In `src/main/plugins/extension-host.ts` (continuing A7 Step 4), set the field before the RPC call:

```typescript
  async activate(target: ActivationTarget): Promise<void> {
    const { endpoint } = this.ensure()
    this.activatingPluginId = target.id
    await endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$activate(target)
  }

  async resolveView(target: ActivationTarget, viewId: string): Promise<void> {
    const { endpoint } = this.ensure()
    this.activatingPluginId = target.id
    await endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$activate(target)
    await endpoint.getProxy<{ $resolveView(viewId: string): Promise<void> }>(PLUGIN_WEBVIEW).$resolveView(viewId)
  }
```

- [ ] **Step 5: Update the activator test for the new constructor**

In `src/plugin-host/activator.test.ts`, remove the second constructor argument and add `kind` to any `ActivationTarget` literals. Read the file first; change `new Activator(loadFn, makeApiFn)` → `new Activator(loadFn)` and add `kind: 'manifold'` to targets.

- [ ] **Step 6: Run host-side unit tests**

Run: `npx vitest run src/plugin-host/activator.test.ts src/plugin-host/gated-api.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck — confirm no new errors vs baseline**

Run: `npm run typecheck:node`
Expected: ≤ 16 errors, none referencing files you created/edited (`vscode-shim/*`, `require-interceptor.ts`, `activator.ts`, `index.ts`, `command-registry.ts`, `extension-host.ts`, `vscode-manifest.ts`, `scanner.ts`). If a new error points at your files, fix it before committing.

- [ ] **Step 8: Commit**

```bash
git add src/plugin-host/activator.ts src/plugin-host/activator.test.ts src/plugin-host/index.ts src/main/plugins/plugin-manager.ts src/main/plugins/extension-host.ts
git commit -m "feat(plugins): activate vscode-kind plugins via the shim (kind-routed loader)"
```

---

# Phase B — Validate with an unmodified command-only extension

## Task B1: The validation extension fixture

**Files:**
- Create: `resources/plugins/hello-vscode/package.json`
- Create: `resources/plugins/hello-vscode/out/extension.js`

**Why:** Proof that an extension authored *purely* against the `vscode` API — not Manifold's — activates and runs in Manifold. This file does **not** import `manifold`; it is what a real VS Code "hello world" extension looks like.

- [ ] **Step 1: Create the VS Code manifest**

Create `resources/plugins/hello-vscode/package.json`:

```json
{
  "name": "hello-vscode",
  "publisher": "manifold",
  "version": "0.0.1",
  "displayName": "Hello (VS Code shim)",
  "description": "Unmodified-style VS Code extension validating the compatibility shim.",
  "engines": { "vscode": "^1.104.0" },
  "main": "./out/extension.js",
  "activationEvents": ["onCommand:helloVscode.hello"],
  "contributes": {
    "commands": [{ "command": "helloVscode.hello", "title": "Hello (VS Code): Greet" }]
  }
}
```

- [ ] **Step 2: Create the extension entry**

Create `resources/plugins/hello-vscode/out/extension.js`. Plain CommonJS, exactly as a compiled VS Code extension ships:

```javascript
// resources/plugins/hello-vscode/out/extension.js
const vscode = require('vscode')

async function activate(context) {
  // globalState round-trip proves ExtensionContext is backed by Manifold storage.
  const count = (await context.globalState.get('greetCount', 0)) + 1
  await context.globalState.update('greetCount', count)

  const disposable = vscode.commands.registerCommand('helloVscode.hello', async () => {
    await vscode.window.showInformationMessage(`Hello from a VS Code extension (greet #${count})`)
    return `greeted:${count}`
  })
  context.subscriptions.push(disposable)
}

function deactivate() {}

module.exports = { activate, deactivate }
```

- [ ] **Step 3: Force-add the built entry (gitignore ignores `out/`)**

```bash
git add resources/plugins/hello-vscode/package.json
git add -f resources/plugins/hello-vscode/out/extension.js
git commit -m "test(plugins): unmodified-style VS Code validation extension"
```

---

## Task B2: End-to-end in-memory integration test

**Files:**
- Create: `src/main/plugins/vscode-shim-integration.test.ts`

**Why:** Exercises the whole loop without Electron — scanner → host activation (via the real `Activator` + interceptor + shim) → command execution → `HOST_MESSAGES` capture — using the in-memory RPC pair pattern from `extension-host-integration.test.ts`.

- [ ] **Step 1: Read the existing integration test for the exact harness**

Run: `sed -n '1,60p' src/main/plugins/extension-host-integration.test.ts`
Note how it constructs the two `RpcEndpoint`s, registers the host-side `PLUGIN_*` services against an `Activator`, and pumps messages. Reuse that harness shape.

- [ ] **Step 2: Write the integration test**

Create `src/main/plugins/vscode-shim-integration.test.ts`. (Mirror the harness from Step 1; the key assertions are below. Build the host endpoint with the real `Activator` whose loader builds the shim, register `HOST_MESSAGES`/`HOST_STORAGE`/`HOST_COMMANDS` on the main endpoint, then activate the fixture and execute its command.)

```typescript
import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { RpcEndpoint, HOST_COMMANDS, HOST_MESSAGES, HOST_STORAGE, PLUGIN_ACTIVATION, PLUGIN_COMMANDS, type RpcMessage } from '../../shared/plugins/rpc'
import { Activator, type ActivationTarget } from '../../plugin-host/activator'
import { createApi } from '../../plugin-host/api-impl'
import { installPluginRequire, registerPluginApis } from '../../plugin-host/require-interceptor'
import { createVscodeShim } from '../../plugin-host/vscode-shim'
import { CommandRegistry } from './command-registry'

const FIXTURE = resolve(__dirname, '../../../resources/plugins/hello-vscode')

function connect(): { host: RpcEndpoint; main: RpcEndpoint } {
  const host = new RpcEndpoint({ post: (m: RpcMessage) => void main.handleMessage(m) })
  const main = new RpcEndpoint({ post: (m: RpcMessage) => void host.handleMessage(m) })
  return { host, main }
}

describe('vscode shim end-to-end (in-memory RPC)', () => {
  it('activates an unmodified vscode extension and runs its command', async () => {
    const { host, main } = connect()
    const messages: Array<{ level: string; message: string }> = []
    const store = new Map<string, unknown>()
    const registry = new CommandRegistry()

    // --- main side services ---
    const pluginCommands = host.getProxy<{ $invokeCommand(id: string, args: unknown[]): Promise<unknown> }>(PLUGIN_COMMANDS)
    main.registerService(HOST_COMMANDS, {
      $registerCommand: (id: string) => registry.register(id, 'manifold.hello-vscode', (cid, args) => pluginCommands.$invokeCommand(cid, args)),
      $unregisterCommand: (id: string) => registry.unregister(id, 'manifold.hello-vscode'),
      $executeCommand: (id: string, args: unknown[]) => registry.execute(id, args),
    })
    main.registerService(HOST_MESSAGES, {
      $showMessage: (level: string, message: string) => { messages.push({ level, message }); return undefined },
    })
    main.registerService(HOST_STORAGE, {
      $get: (_id: string, key: string) => store.get(key),
      $update: (_id: string, key: string, value: unknown) => { store.set(key, value) },
    })

    // --- host side: real Activator + shim wiring ---
    const { api: commandsApi, invokeLocalCommand } = createApi(host)
    const messagesProxy = host.getProxy<never>(HOST_MESSAGES)
    const configProxy = host.getProxy<never>(HOST_STORAGE) // not used by the fixture
    const storageProxy = host.getProxy<never>(HOST_STORAGE)
    installPluginRequire()
    const activator = new Activator((t: ActivationTarget) => {
      const { vscode, createContext } = createVscodeShim({
        commands: commandsApi.commands,
        messagesProxy: messagesProxy as never,
        configProxy: configProxy as never,
        storageProxy: storageProxy as never,
        pluginId: t.id, extensionPath: t.root,
      })
      registerPluginApis(t.root, { vscode })
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(`${t.root}/out/extension.js`)
      const ctx = createContext()
      return { activate: () => mod.activate(ctx), deactivate: () => mod.deactivate?.() }
    })
    host.registerService(PLUGIN_ACTIVATION, { $activate: (t: ActivationTarget) => activator.activate(t), $deactivate: (id: string) => activator.deactivate(id) })
    host.registerService(PLUGIN_COMMANDS, { $invokeCommand: (id: string, args: unknown[]) => invokeLocalCommand(id, args) })

    // --- act ---
    const activationProxy = main.getProxy<{ $activate(t: ActivationTarget): Promise<void> }>(PLUGIN_ACTIVATION)
    await activationProxy.$activate({ id: 'manifold.hello-vscode', root: FIXTURE, main: './out/extension.js', kind: 'vscode' })

    expect(registry.has('helloVscode.hello')).toBe(true)
    const result = await registry.execute('helloVscode.hello', [])

    // --- assert ---
    expect(result).toBe('greeted:1')
    expect(messages).toEqual([{ level: 'info', message: 'Hello from a VS Code extension (greet #1)' }])
    expect(store.get('global:greetCount')).toBe(1)
  })
})
```

- [ ] **Step 3: Run the integration test**

Run: `npx vitest run src/main/plugins/vscode-shim-integration.test.ts`
Expected: PASS. If `require('vscode')` fails inside the fixture, confirm `installPluginRequire()` ran and `registerPluginApis(t.root, ...)` used the same absolute `t.root` the fixture file resolves under.

- [ ] **Step 4: Run the full plugin test suite + typecheck**

Run: `npx vitest run src/main/plugins src/plugin-host src/shared/plugins`
Expected: all green.
Run: `npm run typecheck:node && npm run typecheck:web`
Expected: no new errors vs baseline (node ≤ 16, web ≤ 37).

- [ ] **Step 5: Commit**

```bash
git add src/main/plugins/vscode-shim-integration.test.ts
git commit -m "test(plugins): end-to-end vscode shim activation + command execution"
```

---

## Task B3: Build + dev smoke

**Files:** none (verification only)

- [ ] **Step 1: Build the host bundle**

Run: `npm run build`
Expected: success; `out/main/plugin-host.js` exists and includes the shim (it's imported by `index.ts`, so it's bundled — no `electron.vite.config.ts` change needed).

Verify: `test -f out/main/plugin-host.js && echo OK`

- [ ] **Step 2: Dev smoke (Electron-only — run manually, record results)**

Run: `npm run dev`

Confirm in `~/.manifold/debug.log`:
- `[plugins] discovered N plugin(s)` with N including **both** `hello` and `hello-vscode`.
- No host crash / no `VscodeShimError` during activation.

Then trigger the command. Two options depending on what dev affordance exists:
- If a command palette / dev trigger can invoke `helloVscode.hello`, run it.
- Otherwise, temporarily call `pluginManager.executeContributedCommand('helloVscode.hello', [])` from the dev IPC path you used in earlier phase smokes.

Confirm:
- The log shows `[plugins] message(info): Hello from a VS Code extension (greet #1)`.
- Re-running the command (or relaunching) increments the greet count — proving `globalState` persists through `HOST_STORAGE`.

- [ ] **Step 3: Record the dev-smoke outcome in the follow-ups doc**

Append the result (pass/fail + any `VscodeShimError`s observed, which reveal the next API to implement) to `docs/superpowers/plans/2026-06-04-manifold-plugins-followups.md` under a new "VS Code shim — Phase A/B dev smoke" heading.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-06-04-manifold-plugins-followups.md
git commit -m "docs(plugins): record vscode shim Phase A/B dev-smoke results"
```

---

## What this unlocks, and what's next

After Phase A/B, an **unmodified command-only VS Code extension** runs in Manifold, and the two security issues that block third-party code (I2, M5) are closed. This is the foundation for the climb toward `vscode-azurestorage`:

- **Phase C — UI primitives** (separate plan): `createWebviewPanel`/`WebviewView` first (maps onto Manifold's existing sandboxed-iframe panels), then `createTreeView`/`TreeDataProvider` (new Manifold tree panel), then `showQuickPick`/`showInputBox`, `StatusBarItem`, `withProgress`. Each is currently a `notImplemented` stub, so the gaps are already enumerated and will surface as `VscodeShimError`s naming exactly what to build.
- **Phase D — azurestorage's hard dependencies** (separate plan): `vscode.authentication` (Entra/Microsoft OAuth in main), `registerFileSystemProvider`, the Azure Resources host-extension API (`x-azResources`), and a per-`vscode`-API capability/permission model for untrusted code.
- **Distribution** (separate plan): pull/update extensions from **Open VSX**, version-gated against the shim's implemented API level so a community update that needs unimplemented API is *held with a clear message* rather than crashing.

---

## Self-Review

**Spec coverage** (against the agreed direction "many extensions, ride upstream"):
- Run an unmodified VS Code extension → A1 (discovery) + A2–A5 (shim) + A8 (wiring) + B1–B2 (proof). ✓
- "Be Theia not code-server" (emulate `vscode`, don't ship VS Code) → the shim is a Manifold-backed module; no VS Code runtime. ✓
- Future updates safe → I2/M5 closed (A6/A7); `notImplemented` makes missing API loud, not silent; Open VSX + version-gating noted for the distribution plan. ✓
- Scope discipline → tree/webview/auth/fs explicitly deferred and stubbed, not half-built. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step shows complete code. B2's harness references the existing integration test (Step 1 reads it) but the assertions and wiring are spelled out in full.

**Type consistency:** `parseVscodeManifest` → `{ ok, manifest }` matches the scanner's `parseManifest` branch. `PluginDescriptor.kind` and `ActivationTarget.kind` are both `'manifold' | 'vscode'`. `createVscodeShim` deps (`commands`, `messagesProxy`, `configProxy`, `storageProxy`, `pluginId`, `extensionPath`) match the call site in `index.ts` (A8) and the test (A5). `CommandRegistry.register(id, owner, invoke)` arity matches the ExtensionHost call (A7 Step 4) and the integration test (B2). `installPluginRequire()` / `registerPluginApis(root, frame)` / `resolvePluginModule(request, path)` names match across A6, A8, and B2. `HOST_MESSAGES` `$showMessage(level, message, items)` signature matches window.ts (A4), the service (A3), and both tests.

**Known Phase-A limitations (intentional, documented in-code via `notImplemented`):** `getConfiguration().update` (read-only config), `secrets`, `Memento.keys`, `env.openExternal` (returns false), and all UI/tree/webview/auth/fs surface throw `VscodeShimError`. These are the Phase C/D backlog and are surfaced loudly rather than failing silently.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-04-manifold-plugins-vscode-shim.md`.**
