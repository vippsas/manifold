// src/plugin-host/config-api.ts
import { HOST_CONFIG, type RpcEndpoint } from '../shared/plugins/rpc'
import type { Disposable, ManifoldApi } from '../shared/plugins/api-types'

interface HostConfigProxy { $get(pluginId: string, key: string): Promise<unknown> }

/** Host-side config: shared per-plugin onDidChange listeners + a get() over HOST_CONFIG. */
export class ConfigContext {
  private readonly listeners = new Map<string, Set<() => void>>()

  /** Called (via the PLUGIN_CONFIG service) when a plugin's config changed in main. */
  notifyChanged(pluginId: string): void {
    const set = this.listeners.get(pluginId)
    if (set) for (const listener of set) listener()
  }

  /** Per-plugin `manifold.configuration` namespace. */
  makeApi(endpoint: RpcEndpoint, pluginId: string): ManifoldApi['configuration'] {
    const host = endpoint.getProxy<HostConfigProxy>(HOST_CONFIG)
    const listeners = this.listeners
    return {
      async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        const value = (await host.$get(pluginId, key)) as T | undefined
        return value === undefined ? defaultValue : value
      },
      onDidChange(listener: () => void): Disposable {
        let set = listeners.get(pluginId)
        if (!set) { set = new Set(); listeners.set(pluginId, set) }
        set.add(listener)
        return { dispose: () => { set!.delete(listener) } }
      },
    }
  }
}
