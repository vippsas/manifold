// src/plugin-host/index.ts
import { join } from 'node:path'
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parentPort = (process as any).parentPort as {
  on(event: 'message', cb: (e: { data: RpcMessage }) => void): void
  postMessage(message: RpcMessage): void
}

const endpoint = new RpcEndpoint({ post: (m) => parentPort.postMessage(m) })
parentPort.on('message', (e) => { void endpoint.handleMessage(e.data) })

const { api: commandsApi, invokeLocalCommand } = createApi(endpoint)
const { windowApi, resolveView, deliverMessage } = createWindowApi(endpoint)
const sharedNamespaces = { commands: commandsApi.commands, window: windowApi }
const workspaceContext = new WorkspaceContext()
const configContext = new ConfigContext()
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
    // VS Code's activate(context) receives the vscode ExtensionContext.
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

endpoint.registerService(PLUGIN_ACTIVATION, {
  $activate: (t: ActivationTarget) => activator.activate(t),
  // TODO(deactivation): also unregisterPluginApis for this plugin's root (needs an id→root map; tracked in followups).
  $deactivate: (id: string) => activator.deactivate(id),
})
endpoint.registerService(PLUGIN_COMMANDS, {
  $invokeCommand: (id: string, args: unknown[]) => invokeLocalCommand(id, args),
})
endpoint.registerService(PLUGIN_WEBVIEW, {
  $resolveView: (viewId: string) => resolveView(viewId),
  $deliverMessage: (viewId: string, message: unknown) => deliverMessage(viewId, message),
})
endpoint.registerService(PLUGIN_WORKSPACE, {
  $setActiveContext: (ctx: { project?: unknown; session?: unknown }) => workspaceContext.setActiveContext(ctx as never),
})
endpoint.registerService(PLUGIN_CONFIG, {
  $onDidChange: (pluginId: string) => configContext.notifyChanged(pluginId),
})
