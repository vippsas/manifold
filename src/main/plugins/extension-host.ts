// src/main/plugins/extension-host.ts
import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import { RpcEndpoint, HOST_COMMANDS, HOST_WINDOW, HOST_STORAGE, PLUGIN_ACTIVATION, PLUGIN_COMMANDS, PLUGIN_WEBVIEW, PLUGIN_WORKSPACE, type RpcMessage } from '../../shared/plugins/rpc'
import { CommandRegistry } from './command-registry'
import { debugLog } from '../app/debug-log'
import type { ActivationTarget } from '../../plugin-host/activator'
import type { PluginStorageStore } from './plugin-storage-store'

interface PluginActivationProxy { $activate(t: ActivationTarget): Promise<void>; $deactivate(id: string): Promise<void> }
interface PluginCommandsProxy { $invokeCommand(id: string, args: unknown[]): Promise<unknown> }

/** Owns the plugin extension-host utilityProcess and the main-side RPC services. */
export class ExtensionHost {
  private child: UtilityProcess | null = null
  private endpoint: RpcEndpoint | null = null
  private readonly commands = new CommandRegistry()
  private send: ((channel: string, ...args: unknown[]) => void) | null = null

  constructor(private readonly storage: PluginStorageStore) {}

  setSend(fn: (channel: string, ...args: unknown[]) => void): void { this.send = fn }

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
    endpoint.registerService(HOST_WINDOW, {
      $setHtml: (viewId: string, html: string) => { this.send?.('plugins:webview-html', viewId, html) },
      $postToWebview: (viewId: string, message: unknown) => { this.send?.('plugins:webview-message', viewId, message) },
    })
    endpoint.registerService(HOST_STORAGE, {
      $get: (pluginId: string, key: string) => this.storage.get(pluginId, key),
      $update: (pluginId: string, key: string, value: unknown) => { this.storage.update(pluginId, key, value) },
    })
    this.child = child
    this.endpoint = endpoint
    return { endpoint }
  }

  async activate(target: ActivationTarget): Promise<void> {
    const { endpoint } = this.ensure()
    await endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$activate(target)
  }

  async resolveView(target: ActivationTarget, viewId: string): Promise<void> {
    const { endpoint } = this.ensure()
    await endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$activate(target)
    await endpoint.getProxy<{ $resolveView(viewId: string): Promise<void> }>(PLUGIN_WEBVIEW).$resolveView(viewId)
  }

  deliverWebviewMessage(viewId: string, message: unknown): void {
    const { endpoint } = this.ensure()
    void endpoint.getProxy<{ $deliverMessage(viewId: string, message: unknown): Promise<void> }>(PLUGIN_WEBVIEW).$deliverMessage(viewId, message)
  }

  setActiveContext(context: { project?: unknown; session?: unknown }): void {
    const { endpoint } = this.ensure()
    void endpoint.getProxy<{ $setActiveContext(ctx: unknown): Promise<void> }>(PLUGIN_WORKSPACE).$setActiveContext(context)
  }

  /** Execute a contributed command (app/dev entry point). */
  executeContributedCommand(id: string, args: unknown[]): Promise<unknown> {
    this.ensure()
    return this.commands.execute(id, args)
  }

  dispose(): void { this.child?.kill(); this.child = null; this.endpoint = null }
}
