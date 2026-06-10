// src/main/plugins/extension-host.ts
import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import { RpcEndpoint, HOST_COMMANDS, HOST_WINDOW, HOST_STORAGE, HOST_CONFIG, HOST_TREE, HOST_UI, HOST_AGENTS, HOST_LM, PLUGIN_ACTIVATION, PLUGIN_COMMANDS, PLUGIN_WEBVIEW, PLUGIN_WORKSPACE, PLUGIN_CONFIG, PLUGIN_TREE, type RpcMessage } from '../../shared/plugins/rpc'
import { CommandRegistry } from './command-registry'
import { createHostCommandsService } from './host-commands-service'
import { debugLog } from '../app/debug-log'
import type { ActivationTarget } from '../../plugin-host/activator'
import type { PluginStorageStore } from './plugin-storage-store'
import { webviewContentStore } from './webview-content-store'
import { UiRequestBroker } from './ui-broker'
import type { MessageLevel, UiRequest } from '../../shared/plugins/ui'
import type { AgentControlService } from './agent-control-service'
import type { LmService } from './lm-service'

interface PluginActivationProxy { $activate(t: ActivationTarget): Promise<void>; $deactivate(id: string): Promise<void> }
interface PluginCommandsProxy { $invokeCommand(id: string, args: unknown[]): Promise<unknown> }

const MAIN_TO_HOST_RPC_TIMEOUT_MS = 5 * 60_000

function rpcErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Owns the plugin extension-host utilityProcess and the main-side RPC services. */
export class ExtensionHost {
  private child: UtilityProcess | null = null
  private endpoint: RpcEndpoint | null = null
  private readonly commands = new CommandRegistry()
  private send: ((channel: string, ...args: unknown[]) => void) | null = null
  private getConfig: ((pluginId: string, key: string) => unknown) | null = null
  private isPluginEnabled: ((pluginId: string) => boolean) | null = null
  private readonly ui = new UiRequestBroker(() => this.send)

  constructor(
    private readonly storage: PluginStorageStore,
    private readonly agentControl: AgentControlService,
    private readonly lm: LmService,
  ) {}

  setConfigResolver(fn: (pluginId: string, key: string) => unknown): void { this.getConfig = fn }

  setEnabledResolver(fn: (pluginId: string) => boolean): void { this.isPluginEnabled = fn }

  setSend(fn: (channel: string, ...args: unknown[]) => void): void { this.send = fn }

  /** Lazily fork the host process and wire RPC. */
  private ensure(): { endpoint: RpcEndpoint } {
    if (this.endpoint) return { endpoint: this.endpoint }
    const modulePath = join(__dirname, 'plugin-host.js') // out/main/plugin-host.js (sibling of out/main/index.js)
    const child = utilityProcess.fork(modulePath, [], { serviceName: 'manifold-plugin-host' })
    // Time out main→host calls so a plugin whose activate()/resolveView/getChildren never
    // resolves can't hang the IPC caller forever. 5 min clears the slowest legit call (a
    // command handler that drives a 300s agent turn) while bounding a truly stuck one. The
    // host→main direction is not timed out (its endpoint defaults to 0): agent turns, LM
    // requests, and UI prompts there are intentionally long-lived.
    const endpoint = new RpcEndpoint({ post: (m) => child.postMessage(m) }, MAIN_TO_HOST_RPC_TIMEOUT_MS)
    child.on('message', (m: RpcMessage) => { void endpoint.handleMessage(m) })
    // When the host process dies (clean exit or a fatal error), reject every in-flight RPC
    // so awaiting callers fail loudly instead of hanging forever (C2), and clear the command
    // registry so a re-forked host starts clean instead of inheriting dead-plugin ids (C4).
    const onHostDown = (reason: string): void => {
      endpoint.rejectAllPending(reason)
      this.commands.clear()
      this.child = null
      this.endpoint = null
    }
    child.on('exit', (code) => { debugLog(`[plugins] host exited (${code})`); onHostDown(`plugin host exited (code ${code ?? 'unknown'})`) })
    // C3: a fatal error in the host process (e.g. a plugin crashing it) — surface it and recover like an exit.
    child.on('error', (type, location) => { debugLog(`[plugins] host process error: ${type} @ ${location}`); onHostDown(`plugin host error: ${type}`) })
    // HostCommands: host registers command ids here; execution routes back to the host.
    // pluginId is threaded so ownership is enforced (no cross-plugin hijack/unregister) — see host-commands-service.
    const pluginCommands = endpoint.getProxy<PluginCommandsProxy>(PLUGIN_COMMANDS)
    this.commands.onCollision((msg) => debugLog(`[plugins] ${msg}`))
    endpoint.registerService(HOST_COMMANDS, createHostCommandsService(this.commands, (id, args) => pluginCommands.$invokeCommand(id, args)))
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
    endpoint.registerService(HOST_UI, {
      $showMessage: (level: MessageLevel, message: string, actions: string[]) => this.ui.request({ kind: 'message', level, message, actions } as Omit<UiRequest, 'requestId'>),
      $showQuickPick: (items: unknown, options: unknown) => this.ui.request({ kind: 'quickPick', items, options } as Omit<UiRequest, 'requestId'>),
      $showInputBox: (options: unknown) => this.ui.request({ kind: 'inputBox', options } as Omit<UiRequest, 'requestId'>),
    })
    endpoint.registerService(HOST_TREE, {
      $refresh: (viewId: string) => { this.send?.('plugins:tree-refresh', viewId) },
    })
    endpoint.registerService(HOST_AGENTS, {
      $runTurn: (sessionId: string, prompt: string, opts: { budgetSeconds?: number; clearContext?: boolean } | undefined) => this.agentControl.runTurn(sessionId, prompt, opts),
      $cancelTurn: (sessionId: string) => { this.agentControl.cancelTurn(sessionId) },
    })
    endpoint.registerService(HOST_LM, {
      $selectChatModels: (sessionId: string | undefined) => this.lm.selectChatModels(sessionId),
      $sendRequest: (sessionId: string | undefined, prompt: string, opts: { timeoutMs?: number } | undefined) => this.lm.sendRequest(sessionId, prompt, opts),
    })
    this.child = child
    this.endpoint = endpoint
    return { endpoint }
  }

  async activate(target: ActivationTarget): Promise<void> {
    const { endpoint } = this.ensure()
    await endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$activate(target)
  }

  /** Deactivate a plugin: run its deactivate() and dispose its subscriptions in the host
   *  (which unregisters its commands + tree/workspace listeners and its require('manifold')
   *  API frame). No-op if the host hasn't been forked — nothing is active to tear down. */
  async deactivate(id: string): Promise<void> {
    if (!this.endpoint) return
    await this.endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$deactivate(id)
  }

  async resolveView(target: ActivationTarget, viewId: string): Promise<void> {
    const { endpoint } = this.ensure()
    await endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$activate(target)
    await endpoint.getProxy<{ $resolveView(viewId: string): Promise<void> }>(PLUGIN_WEBVIEW).$resolveView(viewId)
  }

  async treeGetChildren(target: ActivationTarget, viewId: string, parentNodeId: string | undefined): Promise<unknown> {
    const { endpoint } = this.ensure()
    await endpoint.getProxy<PluginActivationProxy>(PLUGIN_ACTIVATION).$activate(target)
    return endpoint.getProxy<{ $getChildren(viewId: string, parentNodeId: string | undefined): Promise<unknown> }>(PLUGIN_TREE).$getChildren(viewId, parentNodeId)
  }

  private observeNotification(label: string, promise: Promise<unknown>): void {
    void promise.catch((err) => {
      const message = rpcErrorMessage(err)
      if (message === 'extension host disposed' || message.startsWith('plugin host exited')) return
      debugLog(`[plugins] ${label} failed: ${message}`)
    })
  }

  deliverWebviewMessage(viewId: string, message: unknown): void {
    const { endpoint } = this.ensure()
    this.observeNotification('deliverWebviewMessage', endpoint.getProxy<{ $deliverMessage(viewId: string, message: unknown): Promise<void> }>(PLUGIN_WEBVIEW).$deliverMessage(viewId, message))
  }

  setActiveContext(context: { project?: unknown; session?: unknown }): void {
    const { endpoint } = this.ensure()
    this.observeNotification('setActiveContext', endpoint.getProxy<{ $setActiveContext(ctx: unknown): Promise<void> }>(PLUGIN_WORKSPACE).$setActiveContext(context))
  }

  /** Execute a contributed command (app/dev entry point). Refuses commands owned by a
   *  disabled plugin so a 'disabled' plugin's commands no longer run (its registrations
   *  also tear down on disable; this guards the window before that round-trips). */
  executeContributedCommand(id: string, args: unknown[]): Promise<unknown> {
    this.ensure()
    const owner = this.commands.ownerOf(id)
    if (owner !== undefined && this.isPluginEnabled?.(owner) === false) {
      return Promise.reject(new Error(`command "${id}" belongs to a disabled plugin`))
    }
    return this.commands.execute(id, args)
  }

  notifyConfigChanged(pluginId: string): void {
    const { endpoint } = this.ensure()
    this.observeNotification('notifyConfigChanged', endpoint.getProxy<{ $onDidChange(id: string): Promise<void> }>(PLUGIN_CONFIG).$onDidChange(pluginId))
  }

  resolveUi(requestId: string, value: unknown): void { this.ui.resolve(requestId, value) }

  dispose(): void {
    this.ui.flush()
    this.endpoint?.rejectAllPending('extension host disposed')
    this.commands.clear()
    this.child?.kill()
    this.child = null
    this.endpoint = null
  }
}
