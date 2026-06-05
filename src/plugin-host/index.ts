// src/plugin-host/index.ts
import { join } from 'node:path'
import { RpcEndpoint, PLUGIN_ACTIVATION, PLUGIN_COMMANDS, PLUGIN_WEBVIEW, PLUGIN_WORKSPACE, PLUGIN_CONFIG, HOST_CONFIG, HOST_STORAGE, HOST_TREE, PLUGIN_TREE, type RpcMessage } from '../shared/plugins/rpc'
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

// C3: a throwing plugin must not silently take down the whole host. Surface the failure
// on stderr (captured in the app log); on a fatal uncaught exception, exit so the main
// process rejects in-flight RPCs and can re-fork a clean host.
process.on('uncaughtException', (err) => { console.error('[plugin-host] uncaughtException:', err); process.exit(1) })
process.on('unhandledRejection', (reason) => { console.error('[plugin-host] unhandledRejection:', reason) })

const endpoint = new RpcEndpoint({ post: (m) => parentPort.postMessage(m) })
parentPort.on('message', (e) => { void endpoint.handleMessage(e.data) })

const { makeCommandsApi, invokeLocalCommand } = createApi(endpoint)
const { windowApi, resolveView, deliverMessage, treeGetChildren, onTreeRefresh } = createWindowApi(endpoint)
const hostTree = endpoint.getProxy<{ $refresh(viewId: string): Promise<void> }>(HOST_TREE)
onTreeRefresh((viewId) => { void hostTree.$refresh(viewId) })
const workspaceContext = new WorkspaceContext()
const configContext = new ConfigContext()
const configProxy = endpoint.getProxy<{ $get(id: string, key: string): Promise<unknown> }>(HOST_CONFIG)
const storageProxy = endpoint.getProxy<{ $get(id: string, key: string): Promise<unknown>; $update(id: string, key: string, v: unknown): Promise<void> }>(HOST_STORAGE)
installPluginRequire()

const activator = new Activator((t: ActivationTarget): PluginModule => {
  if (t.kind === 'vscode') {
    const { vscode, createContext } = createVscodeShim({
      commands: makeCommandsApi(t.id),
      configProxy, storageProxy,
      windowApi,
      pluginId: t.id, extensionPath: t.root,
    })
    registerPluginApis(t.root, { vscode })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(join(t.root, t.main)) as PluginModule
    const ctx = createContext()
    // VS Code's activate(context) receives the vscode ExtensionContext. We bridge
    // ctx.subscriptions into the Activator's ManifoldContext so deactivate() disposes
    // them via the single disposal path (see followup I3). Snapshot is taken at
    // activate-time; extensions overwhelmingly register during activate.
    return {
      activate: async (manifoldCtx) => {
        await mod.activate?.(ctx as never)
        manifoldCtx.subscriptions.push(...(ctx.subscriptions as { dispose(): void }[]))
      },
      deactivate: () => mod.deactivate?.(),
    }
  }
  const manifold = buildGatedApi(t.capabilities ?? [], { commands: makeCommandsApi(t.id), window: windowApi }, {
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
endpoint.registerService(PLUGIN_TREE, {
  $getChildren: (viewId: string, parentNodeId: string | undefined) => treeGetChildren(viewId, parentNodeId),
})
