import { describe, expect, it } from 'vitest'
import { RpcEndpoint, HOST_STORAGE, PLUGIN_WORKSPACE, HOST_CONFIG, PLUGIN_CONFIG, type RpcMessage } from '../../shared/plugins/rpc'
import { createApi } from '../../plugin-host/api-impl'
import { createWindowApi } from '../../plugin-host/window-api'
import { createStorageApi } from '../../plugin-host/storage-api'
import { buildGatedApi, CapabilityError } from '../../plugin-host/gated-api'
import { WorkspaceContext } from '../../plugin-host/workspace-api'
import { ConfigContext } from '../../plugin-host/config-api'
import type { ManifoldApi } from '../../shared/plugins/api-types'

/**
 * In-memory host↔main RPC round-trips for the capability-gated namespaces
 * (storage / workspace / configuration). Companion to
 * extension-host-integration.test.ts (which covers commands + window); split out
 * to keep each file focused and under the 300-line limit.
 */

/**
 * Wire a host endpoint and a fake main HOST_STORAGE service backed by an in-memory Map.
 */
function wireStorageHostAndMain(): {
  host: RpcEndpoint
  shared: { commands: ManifoldApi['commands']; window: ReturnType<typeof createWindowApi>['windowApi'] }
} {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  main = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => host.handleMessage(m)) })
  host = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => main.handleMessage(m)) })

  // Fake HOST_STORAGE service on the main side backed by an in-memory Map.
  const store = new Map<string, unknown>()
  main.registerService(HOST_STORAGE, {
    $get: (pluginId: string, key: string) => store.get(`${pluginId}::${key}`),
    $update: (pluginId: string, key: string, value: unknown) => { store.set(`${pluginId}::${key}`, value) },
  })

  // Build shared namespaces from the host side (commands + window).
  const { makeCommandsApi } = createApi(host)
  const { windowApi } = createWindowApi(host)
  const shared = { commands: makeCommandsApi('p.x'), window: windowApi }

  return { host, shared }
}

// Privileged factories are not exercised by these gating tests; stub them so the
// GatedFactories shape is satisfied. Origin is 'builtin' (the caps under test here
// are not builtin-only, so origin does not affect them).
const PRIV_STUBS = {
  agents: () => ({ activeAgent: undefined } as never),
  lm: () => ({ selectChatModels: async () => [] } as never),
}

describe('extension host gated-storage round-trip (in-memory, no process)', () => {
  it('storage.global.update then get returns the stored value', async () => {
    const { host, shared } = wireStorageHostAndMain()
    const workspaceCtx = new WorkspaceContext()
    const api = buildGatedApi(['storage'], 'builtin', shared as never, { ...PRIV_STUBS, storage: () => createStorageApi(host, 'p.x'), workspace: () => workspaceCtx.makeApi(), configuration: () => ({ get: async () => undefined, onDidChange: () => ({ dispose: () => undefined }) }) })
    await api.storage.global.update('n', 7)
    await new Promise((resolve) => setTimeout(resolve, 0)) // let RPC settle
    expect(await api.storage.global.get('n')).toBe(7)
  })

  it('accessing storage without the capability throws CapabilityError', () => {
    const { host, shared } = wireStorageHostAndMain()
    const workspaceCtx = new WorkspaceContext()
    const gatedNoCap = buildGatedApi([], 'builtin', shared as never, { ...PRIV_STUBS, storage: () => createStorageApi(host, 'p.x'), workspace: () => workspaceCtx.makeApi(), configuration: () => ({ get: async () => undefined, onDidChange: () => ({ dispose: () => undefined }) }) })
    expect(() => gatedNoCap.storage).toThrow(CapabilityError)
  })
})

/**
 * Wire a host endpoint with PLUGIN_WORKSPACE service + a main-side proxy for workspace.
 */
function wireWorkspaceHostAndMain(): {
  pluginWorkspace: { $setActiveContext(ctx: unknown): Promise<void> }
  workspaceContext: WorkspaceContext
  shared: { commands: ManifoldApi['commands']; window: ReturnType<typeof createWindowApi>['windowApi'] }
  host: RpcEndpoint
} {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  main = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => host.handleMessage(m)) })
  host = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => main.handleMessage(m)) })

  const workspaceContext = new WorkspaceContext()
  host.registerService(PLUGIN_WORKSPACE, {
    $setActiveContext: (ctx: { project?: unknown; session?: unknown }) => workspaceContext.setActiveContext(ctx as never),
  })

  const pluginWorkspace = main.getProxy<{ $setActiveContext(ctx: unknown): Promise<void> }>(PLUGIN_WORKSPACE)

  // Build shared namespaces from the host side (commands + window).
  const { makeCommandsApi } = createApi(host)
  const { windowApi } = createWindowApi(host)
  const shared = { commands: makeCommandsApi('p.x'), window: windowApi }

  return { pluginWorkspace, workspaceContext, shared, host }
}

describe('extension host workspace round-trip (in-memory, no process)', () => {
  it('$setActiveContext updates activeProject and fires onDidChangeActiveProject listener', async () => {
    const { pluginWorkspace, workspaceContext, shared } = wireWorkspaceHostAndMain()
    const api = buildGatedApi(['workspace:read'], 'builtin', shared as never, { ...PRIV_STUBS,
      storage: () => ({ global: {} as never }),
      workspace: () => workspaceContext.makeApi(),
      configuration: () => ({ get: async () => undefined, onDidChange: () => ({ dispose: () => undefined }) }),
    })

    const fired: unknown[] = []
    api.workspace.onDidChangeActiveProject((p) => fired.push(p))

    await pluginWorkspace.$setActiveContext({ project: { id: 'p', name: 'P', path: '/p' } })
    await new Promise((resolve) => setTimeout(resolve, 0)) // let RPC settle

    expect(api.workspace.activeProject?.id).toBe('p')
    expect(fired).toHaveLength(1)
    expect((fired[0] as { id: string }).id).toBe('p')
  })

  it('accessing workspace without workspace:read throws CapabilityError', () => {
    const { workspaceContext, shared } = wireWorkspaceHostAndMain()
    const api = buildGatedApi([], 'builtin', shared as never, { ...PRIV_STUBS,
      storage: () => ({ global: {} as never }),
      workspace: () => workspaceContext.makeApi(),
      configuration: () => ({ get: async () => undefined, onDidChange: () => ({ dispose: () => undefined }) }),
    })
    expect(() => api.workspace).toThrow(CapabilityError)
  })
})

/**
 * Wire a host endpoint with PLUGIN_CONFIG service + a fake main HOST_CONFIG backed by an in-memory map.
 */
function wireConfigHostAndMain(): {
  configContext: ConfigContext
  mainPluginConfig: { $onDidChange(pluginId: string): Promise<void> }
  shared: { commands: ManifoldApi['commands']; window: ReturnType<typeof createWindowApi>['windowApi'] }
  host: RpcEndpoint
  configStore: Map<string, unknown>
} {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  main = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => host.handleMessage(m)) })
  host = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => main.handleMessage(m)) })

  // Fake HOST_CONFIG service on the main side backed by an in-memory Map.
  const configStore = new Map<string, unknown>()
  main.registerService(HOST_CONFIG, {
    $get: (pluginId: string, key: string) => configStore.get(`${pluginId}::${key}`),
  })

  // ConfigContext on the host side + register the PLUGIN_CONFIG service.
  const configContext = new ConfigContext()
  host.registerService(PLUGIN_CONFIG, {
    $onDidChange: (pluginId: string) => configContext.notifyChanged(pluginId),
  })

  // Main-side proxy to call PLUGIN_CONFIG.$onDidChange.
  const mainPluginConfig = main.getProxy<{ $onDidChange(pluginId: string): Promise<void> }>(PLUGIN_CONFIG)

  // Build shared namespaces from the host side (commands + window).
  const { makeCommandsApi } = createApi(host)
  const { windowApi } = createWindowApi(host)
  const shared = { commands: makeCommandsApi('p.x'), window: windowApi }

  return { configContext, mainPluginConfig, shared, host, configStore }
}

describe('extension host configuration round-trip (in-memory, no process)', () => {
  it('configuration.get returns the value from the host store', async () => {
    const { configContext, shared, host, configStore } = wireConfigHostAndMain()
    configStore.set('p.test::greeting', 'Hello')
    const workspaceCtx = new WorkspaceContext()
    const api = buildGatedApi(['configuration'], 'builtin', shared as never, { ...PRIV_STUBS,
      storage: () => ({ global: {} as never }),
      workspace: () => workspaceCtx.makeApi(),
      configuration: () => configContext.makeApi(host, 'p.test'),
    })

    const value = await api.configuration.get('greeting', 'default')
    expect(value).toBe('Hello')
  })

  it('configuration.get returns the defaultValue when the host has no entry', async () => {
    const { configContext, shared, host } = wireConfigHostAndMain()
    const workspaceCtx = new WorkspaceContext()
    const api = buildGatedApi(['configuration'], 'builtin', shared as never, { ...PRIV_STUBS,
      storage: () => ({ global: {} as never }),
      workspace: () => workspaceCtx.makeApi(),
      configuration: () => configContext.makeApi(host, 'p.missing'),
    })

    const value = await api.configuration.get('key', 'fallback')
    expect(value).toBe('fallback')
  })

  it('$onDidChange round-trip: calling main proxy fires the plugin listener', async () => {
    const { configContext, mainPluginConfig, shared, host } = wireConfigHostAndMain()
    const workspaceCtx = new WorkspaceContext()
    const api = buildGatedApi(['configuration'], 'builtin', shared as never, { ...PRIV_STUBS,
      storage: () => ({ global: {} as never }),
      workspace: () => workspaceCtx.makeApi(),
      configuration: () => configContext.makeApi(host, 'p.listen'),
    })

    const fired: number[] = []
    api.configuration.onDidChange(() => fired.push(1))

    await mainPluginConfig.$onDidChange('p.listen')
    await new Promise((resolve) => setTimeout(resolve, 0)) // let RPC settle

    expect(fired).toHaveLength(1)
  })

  it('accessing configuration without the capability throws CapabilityError', () => {
    const { configContext, shared, host } = wireConfigHostAndMain()
    const workspaceCtx = new WorkspaceContext()
    const api = buildGatedApi([], 'builtin', shared as never, { ...PRIV_STUBS,
      storage: () => ({ global: {} as never }),
      workspace: () => workspaceCtx.makeApi(),
      configuration: () => configContext.makeApi(host, 'p.denied'),
    })
    expect(() => api.configuration).toThrow(CapabilityError)
  })
})
