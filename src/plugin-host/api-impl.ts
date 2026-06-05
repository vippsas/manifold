// src/plugin-host/api-impl.ts
import { HOST_COMMANDS, RpcEndpoint } from '../shared/plugins/rpc'
import type { Disposable, ManifoldApi } from '../shared/plugins/api-types'

interface HostCommandsProxy {
  $registerCommand(pluginId: string, id: string): Promise<void>
  $unregisterCommand(pluginId: string, id: string): Promise<void>
  $executeCommand(id: string, args: unknown[]): Promise<unknown>
}

/** Builds per-plugin `commands` namespaces over a shared local handler registry,
 *  plus the PluginCommands service that executes them.
 *
 *  Each plugin gets a `commands` API bound to its own `pluginId`, which is threaded
 *  to the host (main) on register/unregister so command ownership is enforced
 *  end-to-end (see CommandRegistry + host-commands-service). Locally we also track
 *  the owner per id and refuse a cross-owner overwrite, so a second plugin can
 *  neither replace another plugin's handler nor unregister it. */
export function createApi(endpoint: RpcEndpoint): {
  makeCommandsApi(pluginId: string): ManifoldApi['commands']
  invokeLocalCommand(id: string, args: unknown[]): unknown
} {
  const host = endpoint.getProxy<HostCommandsProxy>(HOST_COMMANDS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, { owner: string; handler: (...args: any[]) => unknown }>()

  function makeCommandsApi(pluginId: string): ManifoldApi['commands'] {
    return {
      registerCommand(id, handler): Disposable {
        const existing = handlers.get(id)
        if (existing && existing.owner !== pluginId) {
          throw new Error(`command "${id}" is already registered by another plugin`)
        }
        handlers.set(id, { owner: pluginId, handler })
        void host.$registerCommand(pluginId, id)
        return {
          dispose: () => {
            if (handlers.get(id)?.owner === pluginId) handlers.delete(id)
            void host.$unregisterCommand(pluginId, id)
          },
        }
      },
      executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
        return host.$executeCommand(id, args) as Promise<T>
      },
    }
  }

  function invokeLocalCommand(id: string, args: unknown[]): unknown {
    const entry = handlers.get(id)
    if (!entry) throw new Error(`command not found in host: ${id}`)
    return entry.handler(...args)
  }

  return { makeCommandsApi, invokeLocalCommand }
}
