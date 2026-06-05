import { describe, expect, it } from 'vitest'
import { RpcEndpoint, HOST_COMMANDS, PLUGIN_COMMANDS, HOST_WINDOW, PLUGIN_WEBVIEW, type RpcMessage } from '../../shared/plugins/rpc'
import { CommandRegistry } from './command-registry'
import { createHostCommandsService } from './host-commands-service'
import { Activator } from '../../plugin-host/activator'
import { createApi } from '../../plugin-host/api-impl'
import { createWindowApi } from '../../plugin-host/window-api'
import type { PluginModule } from '../../shared/plugins/api-types'

/**
 * Wire a main-side and host-side RpcEndpoint to each other in-memory,
 * reproducing the glue in ExtensionHost (main) + plugin-host/index (host), to
 * prove the command round-trip LOGIC end-to-end without forking a real
 * utilityProcess (that boundary is Electron-only; see the Phase 1b dev smoke).
 *
 * Uses the REAL production HOST_COMMANDS service (createHostCommandsService) and
 * per-plugin command APIs (makeCommandsApi), so plugin-id ownership is threaded
 * end-to-end exactly as in production — no hardcoded owner.
 */
function wireHostAndMain(): {
  makeCommandsApi: ReturnType<typeof createApi>['makeCommandsApi']
  commands: CommandRegistry
  hostCommands: { $registerCommand(pluginId: string, id: string): Promise<void>; $unregisterCommand(pluginId: string, id: string): Promise<void> }
} {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  main = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => host.handleMessage(m)) })
  host = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => main.handleMessage(m)) })

  // Host side (as plugin-host/index.ts does): per-plugin command APIs + PLUGIN_COMMANDS service.
  const { makeCommandsApi, invokeLocalCommand } = createApi(host)
  host.registerService(PLUGIN_COMMANDS, {
    $invokeCommand: (id: string, args: unknown[]) => invokeLocalCommand(id, args),
  })

  // Main side (as ExtensionHost does): the real HOST_COMMANDS service over a CommandRegistry.
  const commands = new CommandRegistry()
  const pluginCommands = main.getProxy<{ $invokeCommand(id: string, args: unknown[]): Promise<unknown> }>(PLUGIN_COMMANDS)
  main.registerService(HOST_COMMANDS, createHostCommandsService(commands, (id, args) => pluginCommands.$invokeCommand(id, args)))

  // Host-side proxy to HOST_COMMANDS, used to simulate a forged call from a non-owner plugin.
  const hostCommands = host.getProxy<{ $registerCommand(pluginId: string, id: string): Promise<void>; $unregisterCommand(pluginId: string, id: string): Promise<void> }>(HOST_COMMANDS)

  return { makeCommandsApi, commands, hostCommands }
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

describe('extension host command round-trip (in-memory, no process)', () => {
  it('activate → registerCommand → execute returns the handler result across the boundary', async () => {
    const { makeCommandsApi, commands } = wireHostAndMain()
    const pluginCommands = makeCommandsApi('p.x')
    const mod: PluginModule = {
      activate: (ctx) => {
        ctx.subscriptions.push(pluginCommands.registerCommand('x.ping', (name) => `pong:${name ?? 'world'}`))
      },
    }
    const activator = new Activator(() => mod)
    await activator.activate({ id: 'p.x', root: '/x', main: './out/p.js', kind: 'manifold' })
    await new Promise((resolve) => setTimeout(resolve, 0)) // let the $registerCommand RPC settle

    expect(commands.has('x.ping')).toBe(true)
    expect(commands.ownerOf('x.ping')).toBe('p.x') // owner threaded from the registering plugin
    expect(await commands.execute('x.ping', ['manifold'])).toBe('pong:manifold')
  })

  it('a plugin can executeCommand its own command through the host boundary', async () => {
    const { makeCommandsApi } = wireHostAndMain()
    const pluginCommands = makeCommandsApi('p.y')
    const mod: PluginModule = {
      activate: (ctx) => {
        ctx.subscriptions.push(pluginCommands.registerCommand('x.greet', (who) => `hi ${who}`))
      },
    }
    const activator = new Activator(() => mod)
    await activator.activate({ id: 'p.y', root: '/y', main: './out/p.js', kind: 'manifold' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(await pluginCommands.executeCommand<string>('x.greet', 'there')).toBe('hi there')
  })

  // C1 regression: command ownership is threaded end-to-end so one plugin cannot
  // hijack or unregister another plugin's command id.
  it('rejects a second plugin trying to claim another plugin\'s command id (no silent hijack)', async () => {
    const { makeCommandsApi, commands } = wireHostAndMain()
    const a = makeCommandsApi('plugin.a')
    const b = makeCommandsApi('plugin.b')
    a.registerCommand('shared.cmd', () => 'A')
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The host-side registry refuses to overwrite A's handler, so registering throws loudly.
    expect(() => b.registerCommand('shared.cmd', () => 'B')).toThrow(/already registered/)
    expect(commands.ownerOf('shared.cmd')).toBe('plugin.a')
    expect(await commands.execute('shared.cmd', [])).toBe('A')
  })

  it('ignores a forged unregister from a non-owner plugin, but lets the real owner unregister', async () => {
    const { makeCommandsApi, commands, hostCommands } = wireHostAndMain()
    makeCommandsApi('plugin.a').registerCommand('a.cmd', () => 'A')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(commands.has('a.cmd')).toBe(true)

    // Forge an unregister as if it came from a different plugin — must be a no-op.
    await hostCommands.$unregisterCommand('plugin.b', 'a.cmd')
    expect(commands.has('a.cmd')).toBe(true)

    // The actual owner can unregister.
    await hostCommands.$unregisterCommand('plugin.a', 'a.cmd')
    expect(commands.has('a.cmd')).toBe(false)
  })

  it('lets the same plugin re-register its own command id (idempotent reactivation)', async () => {
    const { makeCommandsApi, commands } = wireHostAndMain()
    const a = makeCommandsApi('plugin.a')
    a.registerCommand('a.cmd', () => 'first')
    a.registerCommand('a.cmd', () => 'second')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(commands.ownerOf('a.cmd')).toBe('plugin.a')
    expect(await commands.execute('a.cmd', [])).toBe('second')
  })
})
