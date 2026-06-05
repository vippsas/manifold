# Manifold Plugins — Phase 1d Plan (Capability gating + `storage`)

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Plugins declare `capabilities` in their manifest; the host gives each plugin a `manifold` API that exposes only its declared capability namespaces (undeclared access throws `CapabilityError`). Add the first gated, stateful API: `manifold.storage` (per-plugin JSON key/value). Prove it with the reference plugin.

**Scope decision (bounded + verifiable).** This phase delivers **capability gating** (the "first-party now, open later" keystone) and **`manifold.storage`**. It **defers** `manifold.workspace` (read) and `manifold.configuration`: "active project/session" is renderer state needing a renderer→main feed, and `configuration` couples to `SettingsStore` — both lower value and harder to verify than gating + storage. They become a documented Phase 1e.

**Low-risk gating design (no host rewrite).** Keep the shared `commands`/`window` namespaces from 1b/1c (command/view ids are globally unique, so shared routing is correct). Add a thin **per-plugin gating wrapper** that the require-interceptor returns per activating plugin: it exposes `commands`/`window` always, and `storage` only if the plugin declared the `storage` capability (else a throwing getter). The plugin's `capabilities` ride on the existing `ActivationTarget` (main already builds it from the manifest).

**Verification reality:** gating logic, the storage backend, and the gated storage round-trip are unit/in-memory-integration tested. The require-interceptor/activation glue + real `utilityProcess` are Electron-only → build + dev smoke. Gates: `typecheck:node` ≤ 16, `typecheck:web` ≤ 38 (currently 37), no error names a new file.

## File Structure
**Create:** `src/plugin-host/gated-api.ts` (`CapabilityError` + `buildGatedApi`), `src/plugin-host/storage-api.ts` (`createStorageApi`), `src/main/plugins/plugin-storage-store.ts` (+ test), `src/plugin-host/gated-api.test.ts`.
**Modify:** `src/shared/plugins/rpc.ts` (+`HOST_STORAGE`), `src/shared/plugins/api-types.ts` (+`storage` on `ManifoldApi`), `src/plugin-host/activator.ts` (`ActivationTarget` + `capabilities`), `src/plugin-host/require-interceptor.ts` (accept a getter), `src/plugin-host/index.ts` (per-activation gated api + storage), `src/main/plugins/extension-host.ts` (`HOST_STORAGE` service + pass capabilities on targets), `src/main/plugins/plugin-manager.ts` (construct store; pass capabilities), `src/main/plugins/extension-host-integration.test.ts` (gated storage round-trip + denial), `resources/plugins/hello/{package.json,out/plugin.js}`.

---

### Task 1 (G1): Capability gating + host storage API + per-activation wiring

- [ ] **Step 1:** `src/shared/plugins/rpc.ts` — add `export const HOST_STORAGE = 'HostStorage'`.
- [ ] **Step 2:** `src/shared/plugins/api-types.ts` — add to `ManifoldApi`:
```ts
  storage: {
    global: {
      get<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined>
      update(key: string, value: unknown): Promise<void>
    }
  }
```
- [ ] **Step 3:** `src/plugin-host/activator.ts` — extend `ActivationTarget`:
```ts
export interface ActivationTarget { id: string; root: string; main: string; capabilities?: string[] }
```
- [ ] **Step 4:** `src/plugin-host/storage-api.ts`:
```ts
// src/plugin-host/storage-api.ts
import { HOST_STORAGE, type RpcEndpoint } from '../shared/plugins/rpc'

interface HostStorageProxy {
  $get(pluginId: string, key: string): Promise<unknown>
  $update(pluginId: string, key: string, value: unknown): Promise<void>
}

/** Per-plugin storage namespace backed by the main-process HOST_STORAGE service. */
export function createStorageApi(endpoint: RpcEndpoint, pluginId: string): {
  global: {
    get<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined>
    update(key: string, value: unknown): Promise<void>
  }
} {
  const host = endpoint.getProxy<HostStorageProxy>(HOST_STORAGE)
  return {
    global: {
      async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        const value = (await host.$get(pluginId, key)) as T | undefined
        return value === undefined ? defaultValue : value
      },
      update(key: string, value: unknown): Promise<void> {
        return host.$update(pluginId, key, value)
      },
    },
  }
}
```
- [ ] **Step 5:** `src/plugin-host/gated-api.ts`:
```ts
// src/plugin-host/gated-api.ts
import type { ManifoldApi } from '../shared/plugins/api-types'

/** Thrown when a plugin accesses an API namespace it did not declare. */
export class CapabilityError extends Error {
  constructor(capability: string) {
    super(`Missing capability: "${capability}". Declare it in your plugin manifest's "capabilities".`)
    this.name = 'CapabilityError'
  }
}

type StorageApi = ManifoldApi['storage']

/** Wrap the shared commands/window namespaces with a per-plugin, capability-gated
 *  view. `commands` and `window` are always available; `storage` requires the
 *  "storage" capability (else accessing it throws CapabilityError). */
export function buildGatedApi(
  capabilities: string[],
  shared: Pick<ManifoldApi, 'commands' | 'window'>,
  makeStorage: () => StorageApi,
): ManifoldApi {
  const caps = new Set(capabilities)
  return {
    commands: shared.commands,
    window: shared.window,
    get storage(): StorageApi {
      if (!caps.has('storage')) throw new CapabilityError('storage')
      return makeStorage()
    },
  }
}
```
- [ ] **Step 6:** `src/plugin-host/require-interceptor.ts` — accept a getter so the returned api can vary per plugin:
```ts
export function installManifoldRequire(getApi: () => unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
  const Module = require('module') as any
  const originalLoad = Module._load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Module._load = function (request: string, ...rest: any[]): unknown {
    if (request === 'manifold') return getApi()
    return originalLoad.call(this, request, ...rest)
  }
}
```
- [ ] **Step 7:** `src/plugin-host/index.ts` — build a per-plugin gated api around activation. Replace the fixed-api wiring with:
```ts
import { buildGatedApi } from './gated-api'
import { createStorageApi } from './storage-api'
// ... after creating endpoint, commandsApi, windowApi:
const sharedNamespaces = { commands: commandsApi.commands, window: windowApi }
let currentApi: unknown = buildGatedApi([], sharedNamespaces, () => createStorageApi(endpoint, ''))
installManifoldRequire(() => currentApi)

const activator = new Activator(
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
  (t) => {
    currentApi = buildGatedApi(t.capabilities ?? [], sharedNamespaces, () => createStorageApi(endpoint, t.id))
    return require(join(t.root, t.main))
  },
  // makeApi (used by future per-call needs); harmless to return currentApi
  () => currentApi as never,
)
```
  (Remove the previous `installManifoldRequire(api)` and `const api = {...}` lines; `commandsApi`/`windowApi`/`invokeLocalCommand`/`resolveView`/`deliverMessage` remain. The `PLUGIN_ACTIVATION`/`PLUGIN_COMMANDS`/`PLUGIN_WEBVIEW` service registrations are unchanged.)
- [ ] **Step 8:** `gated-api.test.ts`:
```ts
// src/plugin-host/gated-api.test.ts
import { describe, expect, it, vi } from 'vitest'
import { buildGatedApi, CapabilityError } from './gated-api'

const shared = { commands: { registerCommand: vi.fn(), executeCommand: vi.fn() } as never, window: { registerWebviewViewProvider: vi.fn() } as never }

describe('buildGatedApi', () => {
  it('always exposes commands and window', () => {
    const api = buildGatedApi([], shared, () => ({ global: {} as never }))
    expect(api.commands).toBe(shared.commands)
    expect(api.window).toBe(shared.window)
  })
  it('throws CapabilityError when storage is used without the capability', () => {
    const api = buildGatedApi([], shared, () => ({ global: {} as never }))
    expect(() => api.storage).toThrow(CapabilityError)
  })
  it('exposes storage when the capability is declared', () => {
    const storage = { global: {} as never }
    const api = buildGatedApi(['storage'], shared, () => storage)
    expect(api.storage).toBe(storage)
  })
})
```
- [ ] **Step 9:** Extend `src/main/plugins/extension-host-integration.test.ts` with a gated-storage round-trip (mirror the existing helpers): wire a host endpoint + a fake main `HOST_STORAGE` service backed by an in-memory `Map`; build a gated api with `['storage']` via `buildGatedApi(... createStorageApi(host, 'p.x'))`; assert `await api.storage.global.update('n', 7)` then `await api.storage.global.get('n')` === 7; and assert `buildGatedApi([], ...)` → accessing `.storage` throws `CapabilityError`.
- [ ] **Step 10:** `npx vitest run src/plugin-host/gated-api.test.ts src/main/plugins/extension-host-integration.test.ts src/shared/plugins` → pass. `typecheck:node` ≤ 16. Commit `feat(plugins): capability-gated per-plugin API + storage namespace`.

---

### Task 2 (G2): Main storage store + HOST_STORAGE + capability passing

- [ ] **Step 1:** `src/main/plugins/plugin-storage-store.ts` (per-plugin JSON; fs):
```ts
// src/main/plugins/plugin-storage-store.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Per-plugin key/value JSON storage under <storageRoot>/plugin-storage/<id>.json. */
export class PluginStorageStore {
  constructor(private readonly storageRoot: string) {}

  private fileFor(pluginId: string): string {
    return join(this.storageRoot, 'plugin-storage', `${pluginId}.json`)
  }

  private read(pluginId: string): Record<string, unknown> {
    const file = this.fileFor(pluginId)
    if (!existsSync(file)) return {}
    try { return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> } catch { return {} }
  }

  get(pluginId: string, key: string): unknown {
    return this.read(pluginId)[key]
  }

  update(pluginId: string, key: string, value: unknown): void {
    const data = this.read(pluginId)
    if (value === undefined) delete data[key]
    else data[key] = value
    const file = this.fileFor(pluginId)
    mkdirSync(join(this.storageRoot, 'plugin-storage'), { recursive: true })
    writeFileSync(file, JSON.stringify(data, null, 2))
  }
}
```
- [ ] **Step 2:** `plugin-storage-store.test.ts` (temp dir): update+get round-trips; get of missing key → undefined; update with `undefined` deletes; persists across new instances (same root).
- [ ] **Step 3:** `src/main/plugins/extension-host.ts` — import `HOST_STORAGE`; accept a `PluginStorageStore` (constructor param or setter); in `ensure()` register:
```ts
endpoint.registerService(HOST_STORAGE, {
  $get: (pluginId: string, key: string) => this.storage.get(pluginId, key),
  $update: (pluginId: string, key: string, value: unknown) => { this.storage.update(pluginId, key, value) },
})
```
  Give `ExtensionHost` a `storage` (e.g. `constructor(private readonly storage: PluginStorageStore)`), and update `PluginManager` to construct it.
- [ ] **Step 4:** `src/main/plugins/plugin-manager.ts` — construct `new ExtensionHost(new PluginStorageStore(this.storagePath))`; in `activate` and `openView`, include `capabilities: plugin.manifest.capabilities ?? []` in the `ActivationTarget` passed to the host (so the host can gate). Update `ExtensionHost.activate`/`resolveView` target type to include `capabilities` (it already uses `ActivationTarget`, now extended in G1).
- [ ] **Step 5:** `npx vitest run src/main/plugins/plugin-storage-store.test.ts` → pass. `typecheck:node` ≤ 16; `npm run build` OK; `out/main/plugin-host.js` exists. Commit `feat(plugins): per-plugin storage store + HOST_STORAGE service`.

---

### Task 3 (G3): Reference plugin uses storage + build + smoke

- [ ] **Step 1:** `resources/plugins/hello/package.json` — add `"capabilities": ["storage"]` (top-level, alongside `contributes`).
- [ ] **Step 2:** `resources/plugins/hello/out/plugin.js` — persist a click counter via `manifold.storage` and show it; keep ping + the webview provider. The webview posts `{type:'inc'}`; the provider reads `count` from storage, increments, `update`s, and posts the new count back:
```js
const manifold = require('manifold')

exports.activate = (context) => {
  context.subscriptions.push(
    manifold.commands.registerCommand('manifold.hello.ping', (name) => `pong:${name ?? 'world'}`),
  )
  context.subscriptions.push(
    manifold.window.registerWebviewViewProvider('manifold.hello.panel', {
      async resolveWebviewView(view) {
        const initial = (await manifold.storage.global.get('count', 0))
        view.webview.html = `<!doctype html><html><body style="font-family:system-ui;padding:14px;color:#ddd;background:#1e1e1e">
          <h3 style="margin-top:0">Hello from a Manifold plugin 👋</h3>
          <p>Clicks (persisted): <b id="count">${initial}</b></p>
          <button id="inc">+1</button>
          <script>
            document.getElementById('inc').addEventListener('click', () => parent.postMessage({ type: 'inc' }, '*'))
            window.addEventListener('message', (e) => { if (e.data && e.data.type === 'count') document.getElementById('count').textContent = e.data.value })
          </script></body></html>`
        view.webview.onDidReceiveMessage(async (msg) => {
          if (msg && msg.type === 'inc') {
            const next = (await manifold.storage.global.get('count', 0)) + 1
            await manifold.storage.global.update('count', next)
            view.webview.postMessage({ type: 'count', value: next })
          }
        })
      },
    }),
  )
}
exports.deactivate = () => {}
```
  (`git add -f resources/plugins/hello/out/plugin.js`.)
- [ ] **Step 3:** `npm run build` OK; typechecks at baseline. Commit `feat(plugins): Hello plugin persists a counter via manifold.storage`.
- [ ] **Step 4 (dev smoke — NOT CI):** `npm run dev` → "+ Apps" → Hello (plugin); click **+1** several times; reload the app (Cmd-R) and reopen the panel — the count should persist (proves storage write→disk→read). Record the result.

---

## Self-Review (this plan)
- **Spec coverage (design spec §6.7 storage, §6.9 capabilities):** gating + CapabilityError (Task 1), per-plugin storage (Tasks 1–2), reference plugin (Task 3). `workspace`/`configuration` explicitly deferred to Phase 1e with rationale.
- **Verifiability:** `buildGatedApi` unit-tested; `PluginStorageStore` fs-tested; gated storage round-trip + denial in the in-memory integration test. Require-interceptor/process glue is build + dev-smoke.
- **Type consistency:** `HOST_STORAGE` (Task 1) used by `storage-api`, `extension-host`; `ActivationTarget.capabilities` (Task 1) set by `PluginManager` (Task 2) and read in `index.ts` (Task 1); `ManifoldApi.storage` (Task 1) implemented by `createStorageApi` + consumed by the reference plugin (Task 3); `buildGatedApi` consumes shared `commands`/`window` (unchanged from 1b/1c).
- **Low-risk:** shared command/window routing is untouched; only the require-interceptor signature changes + a per-activation gated wrapper is added.
- **Deferred (noted):** `workspace`(read), `configuration`, a plugin-management/capabilities UI, sync `storage.get` (it's async over RPC, unlike VS Code's sync globalState).
