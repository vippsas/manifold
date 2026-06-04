import { afterEach, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { RpcEndpoint, HOST_COMMANDS, HOST_CONFIG, HOST_MESSAGES, HOST_STORAGE, PLUGIN_ACTIVATION, PLUGIN_COMMANDS, type RpcMessage } from '../../shared/plugins/rpc'
import { Activator, type ActivationTarget } from '../../plugin-host/activator'
import { createApi } from '../../plugin-host/api-impl'
import { installPluginRequire, registerPluginApis, unregisterPluginApis, resolvePluginModule } from '../../plugin-host/require-interceptor'
import { createVscodeShim } from '../../plugin-host/vscode-shim'
import { CommandRegistry } from './command-registry'
import type { PluginModule } from '../../shared/plugins/api-types'

const FIXTURE = resolve(__dirname, '../../../resources/plugins/hello-vscode')
const FIXTURE_MAIN = resolve(FIXTURE, 'out/extension.js')

// A real CommonJS `require` for this ESM test file. Loading the fixture through
// this goes through Node's native CJS loader — the SAME `Module._load` that
// installPluginRequire() patches — so the fixture's internal `require('vscode')`
// is intercepted and routed to the registered shim (see sanity assertion below).
const cjsRequire = createRequire(import.meta.url)

/**
 * Wire a main-side and host-side RpcEndpoint to each other in-memory, mirroring
 * the helper in extension-host-integration.test.ts. Delivery is async via
 * queueMicrotask, so `await` points (storage round-trips during activation,
 * the message round-trip during execute) resolve naturally.
 */
function wireHostAndMain(): { host: RpcEndpoint; main: RpcEndpoint } {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  main = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => host.handleMessage(m)) })
  host = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => main.handleMessage(m)) })
  return { host, main }
}

describe('vscode shim end-to-end (in-memory RPC)', () => {
  // installPluginRequire() patches Module._load process-wide and stays installed,
  // but it only intercepts when a frame is registered for the requester's root.
  // Unregistering the fixture root after each test scopes the behavior so the
  // global patch never affects other suites. Evicting the fixture from the
  // require cache forces watch-mode re-runs to re-execute its top-level
  // `require('vscode')` against a fresh shim instead of a stale cached one.
  afterEach(() => {
    unregisterPluginApis(FIXTURE)
    delete (cjsRequire as NodeRequire).cache[FIXTURE_MAIN]
  })

  it('activates an unmodified vscode extension and runs its command', async () => {
    const { host, main } = wireHostAndMain()
    const messages: Array<{ level: string; message: string; items: string[] }> = []
    const store = new Map<string, unknown>()
    const registry = new CommandRegistry()

    // --- Main side: HOST_* services (as ExtensionHost wires them). ---
    const pluginCommands = main.getProxy<{ $invokeCommand(id: string, args: unknown[]): Promise<unknown> }>(PLUGIN_COMMANDS)
    main.registerService(HOST_COMMANDS, {
      $registerCommand: (id: string) => { registry.register(id, 'manifold.hello-vscode', (cid, args) => pluginCommands.$invokeCommand(cid, args)) },
      $unregisterCommand: (id: string) => { registry.unregister(id, 'manifold.hello-vscode') },
      $executeCommand: (id: string, args: unknown[]) => registry.execute(id, args),
    })
    main.registerService(HOST_MESSAGES, {
      $showMessage: (level: string, message: string, items: string[]) => { messages.push({ level, message, items }); return undefined },
    })
    main.registerService(HOST_STORAGE, {
      $get: (_id: string, key: string) => store.get(key),
      $update: (_id: string, key: string, value: unknown) => { store.set(key, value) },
    })
    // The fixture doesn't read configuration, but give the shim a real (no-op)
    // HOST_CONFIG channel so a stray config read can't misroute to storage.
    main.registerService(HOST_CONFIG, {
      $get: () => undefined,
    })

    // --- Host side: shared command API + the shim, wired into the Activator. ---
    const { api: commandsApi, invokeLocalCommand } = createApi(host)
    // getProxy<never>: the concrete per-service proxy interfaces aren't exported from rpc.ts, so we structurally escape and rely on the shim's own typed deps.
    const messagesProxy = host.getProxy<never>(HOST_MESSAGES)
    const storageProxy = host.getProxy<never>(HOST_STORAGE)
    const configProxy = host.getProxy<never>(HOST_CONFIG)

    installPluginRequire()

    const activator = new Activator((t: ActivationTarget): PluginModule => {
      const { vscode, createContext } = createVscodeShim({
        commands: commandsApi.commands,
        messagesProxy: messagesProxy as never,
        configProxy: configProxy as never,
        storageProxy: storageProxy as never,
        pluginId: t.id,
        extensionPath: t.root,
      })
      registerPluginApis(t.root, { vscode })

      // Sanity check: the interceptor must route the fixture's `require('vscode')`
      // (resolved through the patched Module._load) to the registered shim. This
      // proves the real Module._load monkeypatch intercepts under the vitest runner.
      expect(resolvePluginModule('vscode', FIXTURE_MAIN)).toBe(vscode)

      // Load the REAL fixture file (unmodified). Its top-level `require('vscode')`
      // runs through the patched native CJS loader and returns `vscode` above.
      const mod = cjsRequire(FIXTURE_MAIN) as PluginModule
      const ctx = createContext()
      return {
        activate: () => mod.activate?.(ctx as never),
        deactivate: () => mod.deactivate?.(),
      }
    })

    host.registerService(PLUGIN_ACTIVATION, {
      $activate: (t: ActivationTarget) => activator.activate(t),
      $deactivate: (id: string) => activator.deactivate(id),
    })
    host.registerService(PLUGIN_COMMANDS, {
      $invokeCommand: (id: string, args: unknown[]) => invokeLocalCommand(id, args),
    })

    // --- Drive activation from the main side, as ExtensionHost does. ---
    const activationProxy = main.getProxy<{ $activate(t: ActivationTarget): Promise<void> }>(PLUGIN_ACTIVATION)
    await activationProxy.$activate({ id: 'manifold.hello-vscode', root: FIXTURE, main: './out/extension.js', kind: 'vscode' })

    // The fixture registered its command through the real CommandRegistry.
    expect(registry.has('helloVscode.hello')).toBe(true)

    // Executing routes main -> host -> fixture handler -> shim.window.showInformationMessage.
    const result = await registry.execute('helloVscode.hello', [])
    expect(result).toBe('greeted:1')

    // showInformationMessage reached HOST_MESSAGES.
    expect(messages).toEqual([{ level: 'info', message: 'Hello from a VS Code extension (greet #1)', items: [] }])

    // globalState.update persisted to HOST_STORAGE under the global-prefixed key.
    expect(store.get('global:greetCount')).toBe(1)
  })
})
