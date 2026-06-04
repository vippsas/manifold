// src/plugin-host/gated-api.ts
import type { ManifoldApi } from '../shared/plugins/api-types'

/** Thrown when a plugin accesses an API namespace it did not declare. */
export class CapabilityError extends Error {
  constructor(capability: string) {
    super(`Missing capability: "${capability}". Declare it in your plugin manifest's "capabilities".`)
    this.name = 'CapabilityError'
  }
}

type StorageApi = ManifoldApi['storage']

/** Wrap the shared commands/window namespaces with a per-plugin, capability-gated
 *  view. `commands` and `window` are always available; `storage` requires the
 *  "storage" capability (else accessing it throws CapabilityError). */
export function buildGatedApi(
  capabilities: string[],
  shared: Pick<ManifoldApi, 'commands' | 'window'>,
  makeStorage: () => StorageApi,
): ManifoldApi {
  const caps = new Set(capabilities)
  return {
    commands: shared.commands,
    window: shared.window,
    get storage(): StorageApi {
      if (!caps.has('storage')) throw new CapabilityError('storage')
      return makeStorage()
    },
  }
}
