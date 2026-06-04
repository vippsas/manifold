// src/plugin-host/api-impl.ts
import { HOST_COMMANDS, RpcEndpoint } from '../shared/plugins/rpc'
import type { Disposable, ManifoldApi } from '../shared/plugins/api-types'

interface HostCommandsProxy {
  $registerCommand(id: string): Promise<void>
  $unregisterCommand(id: string): Promise<void>
  $executeCommand(id: string, args: unknown[]): Promise<unknown>
}

/** Builds the shared `manifold` API and the PluginCommands service backed by
 *  locally-registered handlers. (Phase 1b: a single shared API for all plugins.) */
export function createApi(endpoint: RpcEndpoint): {
  api: ManifoldApi
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invokeLocalCommand(id: string, args: unknown[]): unknown
} {
  const host = endpoint.getProxy<HostCommandsProxy>(HOST_COMMANDS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, (...args: any[]) => unknown>()

  const api: ManifoldApi = {
    commands: {
      registerCommand(id, handler): Disposable {
        handlers.set(id, handler)
        void host.$registerCommand(id)
        return { dispose: () => { handlers.delete(id); void host.$unregisterCommand(id) } }
      },
      executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
        return host.$executeCommand(id, args) as Promise<T>
      },
    },
  }

  function invokeLocalCommand(id: string, args: unknown[]): unknown {
    const handler = handlers.get(id)
    if (!handler) throw new Error(`command not found in host: ${id}`)
    return handler(...args)
  }

  return { api, invokeLocalCommand }
}
