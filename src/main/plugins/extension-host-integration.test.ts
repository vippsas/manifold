import { describe, expect, it } from 'vitest'
import { RpcEndpoint, HOST_COMMANDS, PLUGIN_COMMANDS, HOST_WINDOW, PLUGIN_WEBVIEW, HOST_STORAGE, type RpcMessage } from '../../shared/plugins/rpc'
import { CommandRegistry } from './command-registry'
import { Activator } from '../../plugin-host/activator'
import { createApi } from '../../plugin-host/api-impl'
import { createWindowApi } from '../../plugin-host/window-api'
import { createStorageApi } from '../../plugin-host/storage-api'
import { buildGatedApi, CapabilityError } from '../../plugin-host/gated-api'
import type { PluginModule } from '../../shared/plugins/api-types'

/**
 * Wire a main-side and host-side RpcEndpoint to each other in-memory,
 * reproducing the glue in ExtensionHost (main) + plugin-host/index (host), to
 * prove the command round-trip LOGIC end-to-end without forking a real
 * utilityProcess (that boundary is Electron-only; see the Phase 1b dev smoke).
 */
function wireHostAndMain(): { api: ReturnType<typeof createApi>['api']; commands: CommandRegistry } {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  main = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => host.handleMessage(m)) })
  host = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => main.handleMessage(m)) })

  // Host side (as plugin-host/index.ts does): build the manifold API + PLUGIN_COMMANDS service.
  const { api, invokeLocalCommand } = createApi(host)
  host.registerService(PLUGIN_COMMANDS, {
    $invokeCommand: (id: string, args: unknown[]) => invokeLocalCommand(id, args),
  })

  // Main side (as ExtensionHost does): HOST_COMMANDS backed by a CommandRegistry.
  const commands = new CommandRegistry()
  const pluginCommands = main.getProxy<{ $invokeCommand(id: string, args: unknown[]): Promise<unknown> }>(PLUGIN_COMMANDS)
  main.registerService(HOST_COMMANDS, {
    $registerCommand: (id: string) => { commands.register(id, (cid, args) => pluginCommands.$invokeCommand(cid, args)) },
    $unregisterCommand: (id: string) => { commands.unregister(id) },
    $executeCommand: (id: string, args: unknown[]) => commands.execute(id, args),
  })

  return { api, commands }
}

/**
 * Wire a main-side and host-side RpcEndpoint for the window API round-trip,
 * mirroring the command wiring helper above.
 */
function wireWindowHostAndMain(): {
  windowApi: ReturnType<typeof createWindowApi>['windowApi']
  pluginWebview: { $resolveView(viewId: string): Promise<void>; $deliverMessage(viewId: string, message: unknown): Promise<void> }
  capturedHtml: () => string
  capturedPostToWebview: () => unknown[]
} {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  main = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => host.handleMessage(m)) })
  host = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => main.handleMessage(m)) })

  // Host side: build the window API + register PLUGIN_WEBVIEW service.
  const { windowApi, resolveView, deliverMessage } = createWindowApi(host)
  host.registerService(PLUGIN_WEBVIEW, {
    $resolveView: (viewId: string) => resolveView(viewId),
    $deliverMessage: (viewId: string, message: unknown) => deliverMessage(viewId, message),
  })

  // Main side: HOST_WINDOW service capturing $setHtml and $postToWebview calls.
  const htmlCaptures: string[] = []
  const postCaptures: unknown[] = []
  main.registerService(HOST_WINDOW, {
    $setHtml: (_viewId: string, html: string) => { htmlCaptures.push(html) },
    $postToWebview: (_viewId: string, message: unknown) => { postCaptures.push(message) },
  })

  // Main-side proxy to call PLUGIN_WEBVIEW methods.
  const pluginWebview = main.getProxy<{ $resolveView(viewId: string): Promise<void>; $deliverMessage(viewId: string, message: unknown): Promise<void> }>(PLUGIN_WEBVIEW)

  return {
    windowApi,
    pluginWebview,
    capturedHtml: () => htmlCaptures[htmlCaptures.length - 1] ?? '',
    capturedPostToWebview: () => postCaptures,
  }
}

describe('extension host window round-trip (in-memory, no process)', () => {
  it('resolving a registered provider sets html on the HOST_WINDOW service', async () => {
    const { windowApi, pluginWebview, capturedHtml } = wireWindowHostAndMain()

    windowApi.registerWebviewViewProvider('test.view', {
      resolveWebviewView(view) {
        view.webview.html = 'X'
      },
    })

    await pluginWebview.$resolveView('test.view')
    await new Promise((resolve) => setTimeout(resolve, 0)) // let the $setHtml RPC settle

    expect(capturedHtml()).toBe('X')
  })

  it('deliverMessage fires the provider onDidReceiveMessage listener, and postMessage reaches $postToWebview', async () => {
    const { windowApi, pluginWebview, capturedPostToWebview } = wireWindowHostAndMain()

    windowApi.registerWebviewViewProvider('test.view2', {
      resolveWebviewView(view) {
        view.webview.html = 'Y'
        view.webview.onDidReceiveMessage((msg) => {
          view.webview.postMessage({ pong: true, echo: msg })
        })
      },
    })

    await pluginWebview.$resolveView('test.view2')
    await new Promise((resolve) => setTimeout(resolve, 0))

    await pluginWebview.$deliverMessage('test.view2', { hi: 1 })
    await new Promise((resolve) => setTimeout(resolve, 0)) // let the $postToWebview RPC settle

    expect(capturedPostToWebview()).toEqual([{ pong: true, echo: { hi: 1 } }])
  })
})

/**
 * Wire a host endpoint and a fake main HOST_STORAGE service backed by an in-memory Map.
 */
function wireStorageHostAndMain(): {
  host: RpcEndpoint
  shared: Pick<ReturnType<typeof createApi>['api'], 'commands'> & { window: ReturnType<typeof createWindowApi>['windowApi'] }
} {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  main = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => host.handleMessage(m)) })
  host = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => main.handleMessage(m)) })

  // Fake HOST_STORAGE service on the main side backed by an in-memory Map.
  const store = new Map<string, unknown>()
  main.registerService(HOST_STORAGE, {
    $get: (pluginId: string, key: string) => store.get(`${pluginId}::${key}`),
    $update: (pluginId: string, key: string, value: unknown) => { store.set(`${pluginId}::${key}`, value) },
  })

  // Build shared namespaces from the host side (commands + window).
  const { api: commandsApi } = createApi(host)
  const { windowApi } = createWindowApi(host)
  const shared = { commands: commandsApi.commands, window: windowApi }

  return { host, shared }
}

describe('extension host gated-storage round-trip (in-memory, no process)', () => {
  it('storage.global.update then get returns the stored value', async () => {
    const { host, shared } = wireStorageHostAndMain()
    const api = buildGatedApi(['storage'], shared as never, () => createStorageApi(host, 'p.x'))
    await api.storage.global.update('n', 7)
    await new Promise((resolve) => setTimeout(resolve, 0)) // let RPC settle
    expect(await api.storage.global.get('n')).toBe(7)
  })

  it('accessing storage without the capability throws CapabilityError', () => {
    const { host, shared } = wireStorageHostAndMain()
    const gatedNoCap = buildGatedApi([], shared as never, () => createStorageApi(host, 'p.x'))
    expect(() => gatedNoCap.storage).toThrow(CapabilityError)
  })
})

describe('extension host command round-trip (in-memory, no process)', () => {
  it('activate → registerCommand → execute returns the handler result across the boundary', async () => {
    const { api, commands } = wireHostAndMain()
    const mod: PluginModule = {
      activate: (ctx) => {
        ctx.subscriptions.push(api.commands.registerCommand('x.ping', (name) => `pong:${name ?? 'world'}`))
      },
    }
    const activator = new Activator(() => mod, () => api)
    await activator.activate({ id: 'p.x', root: '/x', main: './out/p.js' })
    await new Promise((resolve) => setTimeout(resolve, 0)) // let the $registerCommand RPC settle

    expect(commands.has('x.ping')).toBe(true)
    expect(await commands.execute('x.ping', ['manifold'])).toBe('pong:manifold')
  })

  it('a plugin can executeCommand its own command through the host boundary', async () => {
    const { api } = wireHostAndMain()
    const mod: PluginModule = {
      activate: (ctx) => {
        ctx.subscriptions.push(api.commands.registerCommand('x.greet', (who) => `hi ${who}`))
      },
    }
    const activator = new Activator(() => mod, () => api)
    await activator.activate({ id: 'p.y', root: '/y', main: './out/p.js' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(await api.commands.executeCommand<string>('x.greet', 'there')).toBe('hi there')
  })
})
