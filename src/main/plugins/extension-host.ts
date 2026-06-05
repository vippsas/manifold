// src/main/plugins/extension-host.ts
import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import { RpcEndpoint, HOST_COMMANDS, HOST_WINDOW, HOST_STORAGE, HOST_CONFIG, HOST_MESSAGES, HOST_TREE, PLUGIN_ACTIVATION, PLUGIN_COMMANDS, PLUGIN_WEBVIEW, PLUGIN_WORKSPACE, PLUGIN_CONFIG, PLUGIN_TREE, type RpcMessage } from '../../shared/plugins/rpc'
import { CommandRegistry } from './command-registry'
import { debugLog } from '../app/debug-log'
import type { ActivationTarget } from '../../plugin-host/activator'
import type { PluginStorageStore } from './plugin-storage-store'
import { webviewContentStore } from './webview-content-store'

interface PluginActivationProxy { $activate(t: ActivationTarget): Promise<void>; $deactivate(id: string): Promise<void> }
interface PluginCommandsProxy { $invokeCommand(id: string, args: unknown[]): Promise<unknown> }

/** Owns the plugin extension-host utilityProcess and the main-side RPC services. */
export class ExtensionHost {
  private child: UtilityProcess | null = null
  private endpoint: RpcEndpoint | null = null
  private readonly commands = new CommandRegistry()
  private send: ((channel: string, ...args: unknown[]) => void) | null = null
  private getConfig: ((pluginId: string, key: string) => unknown) | null = null
  private activatingPluginId: string | null = null

  constructor(private readonly storage: PluginStorageStore) {}

  setConfigResolver(fn: (pluginId: string, key: string) => unknown): void { this.getConfig = fn }

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
    this.commands.onCollision((msg) => debugLog(`[plugins] ${msg}`))
    endpoint.registerService(HOST_COMMANDS, {
      $registerCommand: (id: string) => { this.commands.register(id, this.activatingPluginId ?? 'unknown', (cid, args) => pluginCommands.$invokeCommand(cid, args)) },
      $unregisterCommand: (id: string) => { this.commands.unregister(id, this.commands.ownerOf(id) ?? 'unknown') },
      $executeCommand: (id: string, args: unknown[]) => this.commands.execute(id, args),
    })
    endpoint.registerService(HOST_WINDOW, {
      $setHtml: (viewId: string, html: string) => {
        const version = webviewContentStore.set(viewId, html)
        this.send?.('plugins:webview-html', viewId, version)
      },
      $postToWebview: (viewId: string, message: unknown) => { this.send?.('plugins:webview-message', viewId, message) },
    })
    endpoint.registerService(HOST_STORAGE, {
      $get: (pluginId: string, key: string) => this.storage.get(pluginId, key),
      $update: (pluginId: string, key: string, value: unknown) => { this.storage.update(pluginId, key, value) },
    })
    endpoint.registerService(HOST_CONFIG, {
      $get: (pluginId: string, key: string) => this.getConfig?.(pluginId, key),
    })
    endpoint.registerService(HOST_MESSAGES, {
      // Phase B: _items (button labels) deferred — no selection UI yet, so this always resolves undefined.
      $showMessage: (level: string, message: string, _items: string[]) => {
        debugLog(`[plugins] message(${level}): ${message}`)
        if (this.send) this.send('plugins:notification', level, message)
        else debugLog('[plugins] notification dropped: main window not ready')
      },
    })
    endpoint.registerService(HOST_TREE, {
      $refresh: (viewId: string) => { this.send?.('plugins:tree-refresh', viewId) },
    })
    this.child = child
    this.endpoint = endpoint
    return { endpoint }
  }

  async activate(target: ActivationTarget): Promise<void> {
    const { endpoint } = this.ensure()
    this.activatingPluginId = target.id
    try {
      await endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$activate(target)
    } finally {
      this.activatingPluginId = null
    }
  }

  async resolveView(target: ActivationTarget, viewId: string): Promise<void> {
    const { endpoint } = this.ensure()
    this.activatingPluginId = target.id
    try {
      await endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$activate(target)
    } finally {
      this.activatingPluginId = null
    }
    await endpoint.getProxy<{ $resolveView(viewId: string): Promise<void> }>(PLUGIN_WEBVIEW).$resolveView(viewId)
  }

  async treeGetChildren(target: ActivationTarget, viewId: string, parentNodeId: string | undefined): Promise<unknown> {
    const { endpoint } = this.ensure()
    this.activatingPluginId = target.id
    try {
      await endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$activate(target)
    } finally {
      this.activatingPluginId = null
    }
    return endpoint.getProxy<{ $getChildren(viewId: string, parentNodeId: string | undefined): Promise<unknown> }>(PLUGIN_TREE).$getChildren(viewId, parentNodeId)
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

  notifyConfigChanged(pluginId: string): void {
    const { endpoint } = this.ensure()
    void endpoint.getProxy<{ $onDidChange(id: string): Promise<void> }>(PLUGIN_CONFIG).$onDidChange(pluginId)
  }

  dispose(): void { this.child?.kill(); this.child = null; this.endpoint = null }
}
