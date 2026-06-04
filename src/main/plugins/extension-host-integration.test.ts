import { describe, expect, it } from 'vitest'
import { RpcEndpoint, HOST_COMMANDS, PLUGIN_COMMANDS, type RpcMessage } from '../../shared/plugins/rpc'
import { CommandRegistry } from './command-registry'
import { Activator } from '../../plugin-host/activator'
import { createApi } from '../../plugin-host/api-impl'
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
