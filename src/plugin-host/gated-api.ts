// src/plugin-host/gated-api.ts
import type { ManifoldApi } from '../shared/plugins/api-types'
import { type Capability, isBuiltinOnlyCapability } from '../shared/plugins/manifest'

export class CapabilityError extends Error {
  constructor(capability: string) {
    super(`Missing capability: "${capability}". Declare it in your plugin manifest's "capabilities".`)
    this.name = 'CapabilityError'
  }
}

export class RestrictedCapabilityError extends Error {
  constructor(capability: string) {
    super(`Capability "${capability}" is restricted to built-in plugins.`)
    this.name = 'RestrictedCapabilityError'
  }
}

export interface GatedFactories {
  storage: () => ManifoldApi['storage']
  workspace: () => ManifoldApi['workspace']
  configuration: () => ManifoldApi['configuration']
  agents: () => ManifoldApi['agents']
  lm: () => ManifoldApi['lm']
}

export function buildGatedApi(
  capabilities: Capability[],
  origin: 'builtin' | 'user',
  shared: Pick<ManifoldApi, 'commands' | 'window'>,
  factories: GatedFactories,
): ManifoldApi {
  const caps = new Set<Capability>(capabilities)
  function requireCap(cap: Capability): void {
    if (!caps.has(cap)) throw new CapabilityError(cap)
    if (isBuiltinOnlyCapability(cap) && origin !== 'builtin') throw new RestrictedCapabilityError(cap)
  }
  return {
    commands: shared.commands,
    window: shared.window,
    get storage(): ManifoldApi['storage'] { requireCap('storage'); return factories.storage() },
    get workspace(): ManifoldApi['workspace'] { requireCap('workspace:read'); return factories.workspace() },
    get configuration(): ManifoldApi['configuration'] { requireCap('configuration'); return factories.configuration() },
    get agents(): ManifoldApi['agents'] { requireCap('agent:control'); return factories.agents() },
    get lm(): ManifoldApi['lm'] { requireCap('lm'); return factories.lm() },
  }
}
