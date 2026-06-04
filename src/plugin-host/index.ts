// src/plugin-host/index.ts
import { join } from 'node:path'
import { RpcEndpoint, PLUGIN_ACTIVATION, PLUGIN_COMMANDS, PLUGIN_WEBVIEW, type RpcMessage } from '../shared/plugins/rpc'
import { Activator, type ActivationTarget } from './activator'
import { createApi } from './api-impl'
import { createWindowApi } from './window-api'
import { installManifoldRequire } from './require-interceptor'
import { buildGatedApi } from './gated-api'
import { createStorageApi } from './storage-api'

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
let currentApi: unknown = buildGatedApi([], sharedNamespaces, () => createStorageApi(endpoint, ''))
installManifoldRequire(() => currentApi)

const activator = new Activator(
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
  (t) => {
    currentApi = buildGatedApi(t.capabilities ?? [], sharedNamespaces, () => createStorageApi(endpoint, t.id))
    return require(join(t.root, t.main))
  },
  // makeApi (used by future per-call needs); harmless to return currentApi
  () => currentApi as never,
)

endpoint.registerService(PLUGIN_ACTIVATION, {
  $activate: (t: ActivationTarget) => activator.activate(t),
  $deactivate: (id: string) => activator.deactivate(id),
})
endpoint.registerService(PLUGIN_COMMANDS, {
  $invokeCommand: (id: string, args: unknown[]) => invokeLocalCommand(id, args),
})
endpoint.registerService(PLUGIN_WEBVIEW, {
  $resolveView: (viewId: string) => resolveView(viewId),
  $deliverMessage: (viewId: string, message: unknown) => deliverMessage(viewId, message),
})
