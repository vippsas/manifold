// src/plugin-host/storage-api.ts
import { HOST_STORAGE, type RpcEndpoint } from '../shared/plugins/rpc'

interface HostStorageProxy {
  $get(pluginId: string, key: string): Promise<unknown>
  $update(pluginId: string, key: string, value: unknown): Promise<void>
}

/** Per-plugin storage namespace backed by the main-process HOST_STORAGE service. */
export function createStorageApi(endpoint: RpcEndpoint, pluginId: string): {
  global: {
    get<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined>
    update(key: string, value: unknown): Promise<void>
  }
} {
  const host = endpoint.getProxy<HostStorageProxy>(HOST_STORAGE)
  return {
    global: {
      async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        const value = (await host.$get(pluginId, key)) as T | undefined
        return value === undefined ? defaultValue : value
      },
      update(key: string, value: unknown): Promise<void> {
        return host.$update(pluginId, key, value)
      },
    },
  }
}
