# Manifold Plugins — Phase 1b Implementation Plan (Extension Host + RPC + `commands`)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Run a plugin's JS in an isolated Electron `utilityProcess`, call its `activate(context)`, and have `manifold.commands.registerCommand`/`executeCommand` round-trip between the host and the main process.

**Architecture:** A transport-agnostic `RpcEndpoint` (request/reply over structured-clone messages) connects main ⇄ host. The host (`out/main/plugin-host.js`, forked via `utilityProcess`) intercepts `require('manifold')` and serves a native API; calls proxy over RPC to main-side `HostCommands`. Built on Phase 1a's `PluginManager`/manifest.

**Tech Stack:** Electron 39 `utilityProcess` + `process.parentPort`; electron-vite (host built as a 2nd `main` rollup input); TypeScript; Vitest (in-memory RPC/activator unit tests).

---

## Verification reality (READ FIRST)
- **Unit-testable in vitest:** `RpcEndpoint` (wire two endpoints in-memory), the command registry routing, the activator (against an injected fake module). These get real TDD.
- **NOT vitest-testable:** the real `utilityProcess` fork (Electron-only). Verified by **`npm run build`** producing `out/main/plugin-host.js` (bundle/type integrity) + a **dev smoke** (run the app; a built-in plugin activates; a command round-trips via `~/.manifold/debug.log`). The plan calls this out at each integration task — do not claim the runtime round-trip is proven by CI.
- Env/gates as in Phase 1a: branch `manifold/plugins`; `npx vitest run`; gate = `typecheck:node` ≤ 16, `typecheck:web` ≤ 38, no error names a new file; inline eslint-disable for `any`.

## File Structure (1b)

**Create (shared):**
- `src/shared/plugins/rpc.ts` — `RpcMessage`, `RpcTransport`, `RpcEndpoint`, context-id constants.
- `src/shared/plugins/api-types.ts` — `Disposable`, `ManifoldContext`, `ManifoldApi` (the `commands` namespace).

**Create (host → built as `out/main/plugin-host.js`):**
- `src/plugin-host/index.ts` — entry; `parentPort` transport + endpoint + service registration.
- `src/plugin-host/api-impl.ts` — builds the `manifold` API object; `PluginCommands` service.
- `src/plugin-host/activator.ts` — load plugin `main`, call `activate`/`deactivate`; `PluginActivation` service.
- `src/plugin-host/require-interceptor.ts` — patch `Module._load` for `'manifold'`.

**Create (main):**
- `src/main/plugins/extension-host.ts` — `ExtensionHost`: owns the `utilityProcess`, RPC endpoint, `HostCommands` service + command registry.

**Modify:**
- `electron.vite.config.ts` — add `'plugin-host'` to `main.build.rollupOptions.input`.
- `tsconfig.node.json` — add `"src/plugin-host/**/*.ts"` to `include`.
- `src/main/plugins/plugin-manager.ts` — own an `ExtensionHost`, expose `activate(pluginId)` + `executeContributedCommand(...)`.
- `src/main/ipc/plugin-handlers.ts` — add `plugins:execute-command` (lets the app/dev trigger a command); preload whitelist.
- `resources/plugins/hello/` — add `out/plugin.js` (real CJS plugin) + a `commands` contribution.

---

### Task 1: RPC envelope + endpoint (shared, fully unit-tested)

**Files:** Create `src/shared/plugins/rpc.ts` + `src/shared/plugins/rpc.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/plugins/rpc.test.ts
import { describe, expect, it, vi } from 'vitest'
import { RpcEndpoint, type RpcMessage } from './rpc'

/** Wire two endpoints directly to each other (in-memory transport). */
function pair() {
  let a!: RpcEndpoint, b!: RpcEndpoint
  a = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => b.handleMessage(m)) })
  b = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => a.handleMessage(m)) })
  return { a, b }
}

describe('RpcEndpoint', () => {
  it('round-trips a request to a registered service and returns its result', async () => {
    const { a, b } = pair()
    b.registerService('Svc', { $add: (x: number, y: number) => x + y })
    const proxy = a.getProxy<{ $add: (x: number, y: number) => Promise<number> }>('Svc')
    expect(await proxy.$add(2, 3)).toBe(5)
  })

  it('awaits async service methods', async () => {
    const { a, b } = pair()
    b.registerService('Svc', { $echo: async (v: string) => `${v}!` })
    const proxy = a.getProxy<{ $echo: (v: string) => Promise<string> }>('Svc')
    expect(await proxy.$echo('hi')).toBe('hi!')
  })

  it('rejects when the service method throws', async () => {
    const { a, b } = pair()
    b.registerService('Svc', { $boom: () => { throw new Error('nope') } })
    const proxy = a.getProxy<{ $boom: () => Promise<void> }>('Svc')
    await expect(proxy.$boom()).rejects.toThrow('nope')
  })

  it('rejects calls to an unknown service', async () => {
    const { a } = pair()
    const proxy = a.getProxy<{ $x: () => Promise<void> }>('Missing')
    await expect(proxy.$x()).rejects.toThrow(/Missing/)
  })
})
```

- [ ] **Step 2:** Run → FAIL. `npx vitest run src/shared/plugins/rpc.test.ts`
- [ ] **Step 3: Implement**

```ts
// src/shared/plugins/rpc.ts
/** Bidirectional request/reply over a structured-clone message channel. */

export type RpcMessage =
  | { t: 'req'; id: number; ctx: string; method: string; args: unknown[] }
  | { t: 'rep'; id: number; ok: true; value: unknown }
  | { t: 'rep'; id: number; ok: false; error: string }

export interface RpcTransport {
  post(message: RpcMessage): void
}

/** Context ids for the services exposed across the boundary. */
export const HOST_COMMANDS = 'HostCommands'        // main, called by host
export const PLUGIN_ACTIVATION = 'PluginActivation' // host, called by main
export const PLUGIN_COMMANDS = 'PluginCommands'     // host, called by main

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceImpl = Record<string, (...args: any[]) => unknown>

export class RpcEndpoint {
  private seq = 0
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private readonly services = new Map<string, ServiceImpl>()

  constructor(private readonly transport: RpcTransport) {}

  registerService(ctx: string, impl: ServiceImpl): void {
    this.services.set(ctx, impl)
  }

  getProxy<T>(ctx: string): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy({}, {
      get: (_t, method: string) => (...args: unknown[]) => this.call(ctx, method, args),
    }) as T
  }

  private call(ctx: string, method: string, args: unknown[]): Promise<unknown> {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.transport.post({ t: 'req', id, ctx, method, args })
    })
  }

  async handleMessage(message: RpcMessage): Promise<void> {
    if (message.t === 'req') {
      const service = this.services.get(message.ctx)
      try {
        if (!service || typeof service[message.method] !== 'function') {
          throw new Error(`no such method ${message.ctx}.${message.method}`)
        }
        const value = await service[message.method](...message.args)
        this.transport.post({ t: 'rep', id: message.id, ok: true, value })
      } catch (err) {
        this.transport.post({ t: 'rep', id: message.id, ok: false, error: err instanceof Error ? err.message : String(err) })
      }
      return
    }
    const waiter = this.pending.get(message.id)
    if (!waiter) return
    this.pending.delete(message.id)
    if (message.ok) waiter.resolve(message.value)
    else waiter.reject(new Error(message.error))
  }
}
```

- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(plugins): add RPC endpoint for the extension host`.

---

### Task 2: Shared API types

**Files:** Create `src/shared/plugins/api-types.ts`. Types only.

- [ ] **Step 1: Create**

```ts
// src/shared/plugins/api-types.ts
export interface Disposable { dispose(): void }

export interface ManifoldContext {
  subscriptions: Disposable[]
  /** Absolute path to the plugin's folder. */
  pluginUri: string
}

/** The `manifold` module surface (Phase 1b: commands only). */
export interface ManifoldApi {
  commands: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCommand(id: string, handler: (...args: any[]) => unknown): Disposable
    executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>
  }
}

/** Shape a plugin's entry module must export. */
export interface PluginModule {
  activate?: (context: ManifoldContext) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}
```

- [ ] **Step 2:** `npm run typecheck:node` ≤ 16. **Step 3:** Commit `feat(plugins): add manifold API types`.

---

### Task 3: Activator (host-side, unit-tested against an injected module)

**Files:** Create `src/plugin-host/activator.ts` + `src/plugin-host/activator.test.ts`.

The activator is parameterized by a `loadModule(root, main)` function so tests can inject a fake module instead of touching disk/`require`.

- [ ] **Step 1: Write the failing test**

```ts
// src/plugin-host/activator.test.ts
import { describe, expect, it, vi } from 'vitest'
import { Activator } from './activator'
import type { PluginModule } from '../shared/plugins/api-types'

describe('Activator', () => {
  it('calls activate with a context and tracks the plugin as active', async () => {
    const activate = vi.fn()
    const mod: PluginModule = { activate }
    const act = new Activator(() => mod, () => ({ commands: {} as never }))
    await act.activate({ id: 'p.a', root: '/x', main: './out/p.js' })
    expect(activate).toHaveBeenCalledTimes(1)
    expect(act.isActive('p.a')).toBe(true)
  })

  it('is idempotent — activating twice runs activate once', async () => {
    const activate = vi.fn()
    const act = new Activator(() => ({ activate }), () => ({ commands: {} as never }))
    await act.activate({ id: 'p.a', root: '/x', main: './out/p.js' })
    await act.activate({ id: 'p.a', root: '/x', main: './out/p.js' })
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('runs deactivate and disposes subscriptions', async () => {
    const dispose = vi.fn()
    const deactivate = vi.fn()
    const act = new Activator(
      () => ({ activate: (ctx) => { ctx.subscriptions.push({ dispose }) }, deactivate }),
      () => ({ commands: {} as never }),
    )
    await act.activate({ id: 'p.a', root: '/x', main: './out/p.js' })
    await act.deactivate('p.a')
    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(act.isActive('p.a')).toBe(false)
  })
})
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**

```ts
// src/plugin-host/activator.ts
import type { ManifoldApi, ManifoldContext, PluginModule } from '../shared/plugins/api-types'

export interface ActivationTarget { id: string; root: string; main: string }

type LoadModule = (target: ActivationTarget) => PluginModule
type MakeApi = (target: ActivationTarget) => ManifoldApi

interface ActivePlugin { module: PluginModule; context: ManifoldContext }

/** Loads plugin entry modules and runs their activate/deactivate lifecycle. */
export class Activator {
  private readonly active = new Map<string, ActivePlugin>()

  constructor(private readonly loadModule: LoadModule, private readonly makeApi: MakeApi) {}

  isActive(id: string): boolean {
    return this.active.has(id)
  }

  async activate(target: ActivationTarget): Promise<void> {
    if (this.active.has(target.id)) return
    const module = this.loadModule(target)
    const context: ManifoldContext = { subscriptions: [], pluginUri: target.root }
    // makeApi is consumed via the require interceptor in production; passing it
    // here keeps the activator testable and the API wired per target.
    void this.makeApi
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

- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(plugins): add plugin activator`.

---

### Task 4: Command registry routing (main-side, unit-tested)

**Files:** Create `src/main/plugins/command-registry.ts` + test. Pure logic that records which "owner" registered a command and routes execution.

- [ ] **Step 1: Failing test**

```ts
// src/main/plugins/command-registry.test.ts
import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from './command-registry'

describe('CommandRegistry', () => {
  it('routes execution to the registered owner invoker', async () => {
    const reg = new CommandRegistry()
    const invoke = vi.fn(async (id: string, args: unknown[]) => `${id}:${args.join(',')}`)
    reg.register('cmd.a', invoke)
    expect(await reg.execute('cmd.a', [1, 2])).toBe('cmd.a:1,2')
    expect(invoke).toHaveBeenCalledWith('cmd.a', [1, 2])
  })
  it('throws for an unknown command', async () => {
    const reg = new CommandRegistry()
    await expect(reg.execute('nope', [])).rejects.toThrow(/nope/)
  })
  it('unregister removes a command', () => {
    const reg = new CommandRegistry()
    reg.register('cmd.a', async () => 'x')
    reg.unregister('cmd.a')
    expect(reg.has('cmd.a')).toBe(false)
  })
})
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement**

```ts
// src/main/plugins/command-registry.ts
type Invoker = (id: string, args: unknown[]) => Promise<unknown>

/** Records command ownership and routes execution to the owning invoker. */
export class CommandRegistry {
  private readonly invokers = new Map<string, Invoker>()

  register(id: string, invoke: Invoker): void { this.invokers.set(id, invoke) }
  unregister(id: string): void { this.invokers.delete(id) }
  has(id: string): boolean { return this.invokers.has(id) }

  async execute(id: string, args: unknown[]): Promise<unknown> {
    const invoke = this.invokers.get(id)
    if (!invoke) throw new Error(`command not found: ${id}`)
    return invoke(id, args)
  }
}
```

- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(plugins): add command registry`.

---

### Task 5: Host API impl + require interceptor + host entry (integration; typecheck + build verified)

**Files:** Create `src/plugin-host/api-impl.ts`, `src/plugin-host/require-interceptor.ts`, `src/plugin-host/index.ts`. No vitest (process-only); verified by typecheck + the build in Task 7.

- [ ] **Step 1: `api-impl.ts`** — builds the `manifold` API + the `PluginCommands` service:

```ts
// src/plugin-host/api-impl.ts
import { HOST_COMMANDS, RpcEndpoint } from '../shared/plugins/rpc'
import type { Disposable, ManifoldApi } from '../shared/plugins/api-types'

interface HostCommandsProxy {
  $registerCommand(id: string): Promise<void>
  $unregisterCommand(id: string): Promise<void>
  $executeCommand(id: string, args: unknown[]): Promise<unknown>
}

/** Builds the shared `manifold` API and the PluginCommands service backed by
 *  locally-registered handlers. (Phase 1b: a single shared API for all plugins.) */
export function createApi(endpoint: RpcEndpoint): {
  api: ManifoldApi
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invokeLocalCommand(id: string, args: unknown[]): unknown
} {
  const host = endpoint.getProxy<HostCommandsProxy>(HOST_COMMANDS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, (...args: any[]) => unknown>()

  const api: ManifoldApi = {
    commands: {
      registerCommand(id, handler): Disposable {
        handlers.set(id, handler)
        void host.$registerCommand(id)
        return { dispose: () => { handlers.delete(id); void host.$unregisterCommand(id) } }
      },
      executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
        return host.$executeCommand(id, args) as Promise<T>
      },
    },
  }

  function invokeLocalCommand(id: string, args: unknown[]): unknown {
    const handler = handlers.get(id)
    if (!handler) throw new Error(`command not found in host: ${id}`)
    return handler(...args)
  }

  return { api, invokeLocalCommand }
}
```

- [ ] **Step 2: `require-interceptor.ts`** — return the `manifold` module for `require('manifold')`:

```ts
// src/plugin-host/require-interceptor.ts
import type { ManifoldApi } from '../shared/plugins/api-types'

/** Patch Node's module loader so `require('manifold')` returns our API. */
export function installManifoldRequire(api: ManifoldApi): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
  const Module = require('module') as any
  const originalLoad = Module._load
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Module._load = function (request: string, ...rest: any[]): unknown {
    if (request === 'manifold') return api
    return originalLoad.call(this, request, ...rest)
  }
}
```

- [ ] **Step 3: `index.ts`** — host entry: wire `parentPort` transport, endpoint, services:

```ts
// src/plugin-host/index.ts
import { join } from 'node:path'
import { RpcEndpoint, PLUGIN_ACTIVATION, PLUGIN_COMMANDS, type RpcMessage } from '../shared/plugins/rpc'
import { Activator, type ActivationTarget } from './activator'
import { createApi } from './api-impl'
import { installManifoldRequire } from './require-interceptor'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parentPort = (process as any).parentPort as {
  on(event: 'message', cb: (e: { data: RpcMessage }) => void): void
  postMessage(message: RpcMessage): void
}

const endpoint = new RpcEndpoint({ post: (m) => parentPort.postMessage(m) })
parentPort.on('message', (e) => { void endpoint.handleMessage(e.data) })

const { api, invokeLocalCommand } = createApi(endpoint)
installManifoldRequire(api)

const activator = new Activator(
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
  (t: ActivationTarget) => require(join(t.root, t.main)),
  () => api,
)

endpoint.registerService(PLUGIN_ACTIVATION, {
  $activate: (t: ActivationTarget) => activator.activate(t),
  $deactivate: (id: string) => activator.deactivate(id),
})
endpoint.registerService(PLUGIN_COMMANDS, {
  $invokeCommand: (id: string, args: unknown[]) => invokeLocalCommand(id, args),
})
```

- [ ] **Step 4:** `npm run typecheck:node` ≤ 16 (after Task 7 adds `src/plugin-host/**` to the tsconfig include; if doing Task 5 first, temporarily verify with `npx tsc --noEmit src/plugin-host/*.ts` is not reliable — prefer ordering Task 7's tsconfig change before this verification). **Step 5:** Commit `feat(plugins): add extension-host runtime (api, require interceptor, entry)`.

---

### Task 6: ExtensionHost owner (main) + wire into PluginManager

**Files:** Create `src/main/plugins/extension-host.ts`; modify `src/main/plugins/plugin-manager.ts`. Process-only; typecheck + dev-smoke verified.

- [ ] **Step 1: `extension-host.ts`**

```ts
// src/main/plugins/extension-host.ts
import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import { RpcEndpoint, HOST_COMMANDS, PLUGIN_ACTIVATION, PLUGIN_COMMANDS, type RpcMessage } from '../../shared/plugins/rpc'
import { CommandRegistry } from './command-registry'
import { debugLog } from '../app/debug-log'
import type { ActivationTarget } from '../../../src/plugin-host/activator'

interface PluginActivationProxy { $activate(t: ActivationTarget): Promise<void>; $deactivate(id: string): Promise<void> }
interface PluginCommandsProxy { $invokeCommand(id: string, args: unknown[]): Promise<unknown> }

/** Owns the plugin extension-host utilityProcess and the main-side RPC services. */
export class ExtensionHost {
  private child: UtilityProcess | null = null
  private endpoint: RpcEndpoint | null = null
  private readonly commands = new CommandRegistry()

  /** Lazily fork the host process and wire RPC. */
  private ensure(): { endpoint: RpcEndpoint } {
    if (this.endpoint) return { endpoint: this.endpoint }
    const modulePath = join(__dirname, 'plugin-host.js') // out/main/plugin-host.js (sibling of out/main/index.js)
    const child = utilityProcess.fork(modulePath, [], { serviceName: 'manifold-plugin-host' })
    const endpoint = new RpcEndpoint({ post: (m) => child.postMessage(m) })
    child.on('message', (m: RpcMessage) => { void endpoint.handleMessage(m) })
    child.on('exit', (code) => { debugLog(`[plugins] host exited (${code})`); this.child = null; this.endpoint = null })
    // HostCommands: host registers command ids here; execution routes back to the host.
    const pluginCommands = endpoint.getProxy<PluginCommandsProxy>(PLUGIN_COMMANDS)
    endpoint.registerService(HOST_COMMANDS, {
      $registerCommand: (id: string) => { this.commands.register(id, (cid, args) => pluginCommands.$invokeCommand(cid, args)) },
      $unregisterCommand: (id: string) => { this.commands.unregister(id) },
      $executeCommand: (id: string, args: unknown[]) => this.commands.execute(id, args),
    })
    this.child = child
    this.endpoint = endpoint
    return { endpoint }
  }

  async activate(target: ActivationTarget): Promise<void> {
    const { endpoint } = this.ensure()
    await endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$activate(target)
  }

  /** Execute a contributed command (app/dev entry point). */
  executeContributedCommand(id: string, args: unknown[]): Promise<unknown> {
    this.ensure()
    return this.commands.execute(id, args)
  }

  dispose(): void { this.child?.kill(); this.child = null; this.endpoint = null }
}
```

> Confirm the relative import path to `ActivationTarget` compiles under `tsconfig.node.json` (both `src/main` and `src/plugin-host` are in its `include` after Task 7). Prefer importing the *type* only.

- [ ] **Step 2: Wire into `PluginManager`** — add an `ExtensionHost` instance and methods:
```ts
// in plugin-manager.ts
import { ExtensionHost } from './extension-host'
// in the class:
private readonly host = new ExtensionHost()
async activate(pluginId: string): Promise<void> {
  const p = this.plugins.find((x) => x.id === pluginId)
  if (!p || !p.manifest.main) return
  await this.host.activate({ id: p.id, root: p.root, main: p.manifest.main })
}
executeContributedCommand(id: string, args: unknown[]): Promise<unknown> {
  return this.host.executeContributedCommand(id, args)
}
```

- [ ] **Step 3:** `npm run typecheck:node` ≤ 16 (requires Task 7's tsconfig include first). **Step 4:** Commit `feat(plugins): add ExtensionHost utilityProcess owner`.

---

### Task 7: Build target + tsconfig (config change — proceed; required to build 1b)

**Files:** Modify `electron.vite.config.ts`, `tsconfig.node.json`.

- [ ] **Step 1:** In `electron.vite.config.ts`, change `main.build.rollupOptions.input` to:
```ts
input: {
  index: resolve(__dirname, 'src/main/app/index.ts'),
  'plugin-host': resolve(__dirname, 'src/plugin-host/index.ts'),
},
```
- [ ] **Step 2:** In `tsconfig.node.json` `include`, add `"src/plugin-host/**/*.ts"`.
- [ ] **Step 3: Verify build** — `npm run build` succeeds and produces `out/main/plugin-host.js` and `out/main/index.js` (`ls out/main/plugin-host.js`). `npm run typecheck:node` ≤ 16, no error names a new file.
- [ ] **Step 4:** Commit `build(plugins): build the extension host as a main rollup input`.

> Order note for execution: do Task 7's tsconfig change **before** verifying Tasks 5/6 typecheck, since `src/plugin-host/**` must be in the program. (Implementer may interleave: create files, then add includes, then typecheck.)

---

### Task 8: Make the sample plugin real + IPC to execute a command

**Files:** Create `resources/plugins/hello/out/plugin.js`; modify `resources/plugins/hello/package.json`, `src/main/ipc/plugin-handlers.ts`, `src/preload/index.ts`.

- [ ] **Step 1: Real plugin entry** `resources/plugins/hello/out/plugin.js` (hand-written CJS — a real plugin would compile TS, but the sample ships JS):
```js
const manifold = require('manifold')

exports.activate = (context) => {
  context.subscriptions.push(
    manifold.commands.registerCommand('manifold.hello.ping', (name) => `pong:${name ?? 'world'}`),
  )
}
exports.deactivate = () => {}
```
- [ ] **Step 2:** Update `resources/plugins/hello/package.json` — add a command contribution + a startup activation event:
```json
  "activationEvents": ["onStartupFinished", "onCommand:manifold.hello.ping"],
  "contributes": {
    "views": [ { "id": "manifold.hello.panel", "title": "Hello (plugin)", "description": "Example plugin panel.", "launcher": true } ],
    "commands": [ { "command": "manifold.hello.ping", "title": "Hello: Ping" } ]
  }
```
- [ ] **Step 3: IPC** — in `src/main/ipc/plugin-handlers.ts` add:
```ts
  ipcMain.handle('plugins:activate', (_e, id: string) => deps.pluginManager.activate(id))
  ipcMain.handle('plugins:execute-command', (_e, id: string, args: unknown[] = []) =>
    deps.pluginManager.executeContributedCommand(id, args))
```
and whitelist `'plugins:activate'`, `'plugins:execute-command'` in `src/preload/index.ts`.
- [ ] **Step 4: Verify** typecheck:node ≤ 16; `npm run build` still produces the bundles. Commit `feat(plugins): make Hello a runnable plugin with a ping command`.

---

### Task 9: Integration verification (dev smoke — NOT CI)

**Files:** none.

- [ ] **Step 1:** `npm run build` succeeds; `out/main/plugin-host.js` exists.
- [ ] **Step 2: Dev smoke** — `npm run dev`; from the renderer devtools console run:
```js
await window.electronAPI.invoke('plugins:activate', 'manifold.hello')
await window.electronAPI.invoke('plugins:execute-command', 'manifold.hello.ping', ['manifold'])
// expect: "pong:manifold"
```
Confirm `~/.manifold/debug.log` shows `[plugins] discovered N plugin(s)` and no host crash. This is the only proof of the real `utilityProcess` round-trip — record the observed output.
- [ ] **Step 3:** (No commit unless tweaks needed.)

---

## Self-Review (this plan)
- **Spec coverage (design spec §6.5–6.7 / Phase 1b):** RPC (Task 1), API types (Task 2), activation (Task 3), command registry + routing (Tasks 4,6), host runtime/require-interception (Task 5), utilityProcess owner (Task 6), build target (Task 7), runnable plugin + IPC (Task 8), integration smoke (Task 9).
- **Verifiability honesty:** unit tests cover RPC/activator/command-registry; the real process round-trip is build + dev-smoke only (stated up front and per task).
- **Type consistency:** `RpcMessage`/`RpcEndpoint`/context-id constants (Task 1) used by host entry (Task 5) and `ExtensionHost` (Task 6); `ActivationTarget` defined in activator (Task 3) consumed by host entry + ExtensionHost; `ManifoldApi`/`PluginModule` (Task 2) used by activator/api-impl.
- **Decisions used (from Phase 1 plan forks):** utilityProcess + parentPort; CJS plugin entry; single shared `manifold` API in 1b; host built as a 2nd main rollup input.
