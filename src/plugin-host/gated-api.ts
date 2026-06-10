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
  agents: (caps: ReadonlySet<Capability>) => ManifoldApi['agents']
  lm: () => ManifoldApi['lm']
  transcription: () => ManifoldApi['transcription']
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
    // The agents namespace is shared by two capabilities: `agent:control` (runTurn)
    // and `agent:spawn` (sibling spawn + raw PTY). Either admits the namespace; the
    // factory receives the declared caps so each method re-checks its own.
    get agents(): ManifoldApi['agents'] {
      if (!caps.has('agent:control') && !caps.has('agent:spawn')) throw new CapabilityError('agent:control')
      if (caps.has('agent:control')) requireCap('agent:control')
      if (caps.has('agent:spawn')) requireCap('agent:spawn')
      return factories.agents(caps)
    },
    get lm(): ManifoldApi['lm'] { requireCap('lm'); return factories.lm() },
    get transcription(): ManifoldApi['transcription'] { requireCap('transcription:read'); return factories.transcription() },
  }
}
