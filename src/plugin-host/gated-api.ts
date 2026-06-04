// src/plugin-host/gated-api.ts
import type { ManifoldApi } from '../shared/plugins/api-types'

export class CapabilityError extends Error {
  constructor(capability: string) {
    super(`Missing capability: "${capability}". Declare it in your plugin manifest's "capabilities".`)
    this.name = 'CapabilityError'
  }
}

export interface GatedFactories {
  storage: () => ManifoldApi['storage']
  workspace: () => ManifoldApi['workspace']
  configuration: () => ManifoldApi['configuration']
}

export function buildGatedApi(
  capabilities: string[],
  shared: Pick<ManifoldApi, 'commands' | 'window'>,
  factories: GatedFactories,
): ManifoldApi {
  const caps = new Set(capabilities)
  return {
    commands: shared.commands,
    window: shared.window,
    get storage(): ManifoldApi['storage'] {
      if (!caps.has('storage')) throw new CapabilityError('storage')
      return factories.storage()
    },
    get workspace(): ManifoldApi['workspace'] {
      if (!caps.has('workspace:read')) throw new CapabilityError('workspace:read')
      return factories.workspace()
    },
    get configuration(): ManifoldApi['configuration'] {
      if (!caps.has('configuration')) throw new CapabilityError('configuration')
      return factories.configuration()
    },
  }
}
