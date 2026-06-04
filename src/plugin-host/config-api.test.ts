// src/plugin-host/config-api.test.ts
import { describe, expect, it, vi } from 'vitest'
import { ConfigContext } from './config-api'
import { HOST_CONFIG, RpcEndpoint, type RpcMessage } from '../shared/plugins/rpc'

/** Build a pair of in-memory wired endpoints with a fake HOST_CONFIG. */
function wireWithFakeHostConfig(store: Map<string, unknown>): { host: RpcEndpoint } {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  main = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => host.handleMessage(m)) })
  host = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => main.handleMessage(m)) })

  // Fake HOST_CONFIG on the main side.
  main.registerService(HOST_CONFIG, {
    $get: (pluginId: string, key: string) => store.get(`${pluginId}::${key}`),
  })

  return { host }
}

describe('ConfigContext.notifyChanged', () => {
  it('fires listeners only for the target pluginId', () => {
    const ctx = new ConfigContext()
    const { host } = wireWithFakeHostConfig(new Map())
    const api1 = ctx.makeApi(host, 'plugin.a')
    const api2 = ctx.makeApi(host, 'plugin.b')

    const fired1: number[] = []
    const fired2: number[] = []
    api1.onDidChange(() => fired1.push(1))
    api2.onDidChange(() => fired2.push(2))

    ctx.notifyChanged('plugin.a')

    expect(fired1).toHaveLength(1)
    expect(fired2).toHaveLength(0)
  })

  it('does not throw when notifyChanged is called with no listeners', () => {
    const ctx = new ConfigContext()
    expect(() => ctx.notifyChanged('no-such-plugin')).not.toThrow()
  })
})

describe('ConfigContext dispose', () => {
  it('a disposed listener no longer fires', () => {
    const ctx = new ConfigContext()
    const { host } = wireWithFakeHostConfig(new Map())
    const api = ctx.makeApi(host, 'plugin.x')

    const fired: number[] = []
    const disposable = api.onDidChange(() => fired.push(1))

    ctx.notifyChanged('plugin.x')
    expect(fired).toHaveLength(1)

    disposable.dispose()
    ctx.notifyChanged('plugin.x')
    expect(fired).toHaveLength(1) // still 1, not fired again
  })
})

describe('ConfigContext makeApi get', () => {
  it('returns the value from the host when present', async () => {
    const store = new Map<string, unknown>([['plugin.y::greeting', 'Hi']])
    const { host } = wireWithFakeHostConfig(store)
    const ctx = new ConfigContext()
    const api = ctx.makeApi(host, 'plugin.y')

    const value = await api.get('greeting', 'default')
    expect(value).toBe('Hi')
  })

  it('returns the defaultValue when host returns undefined', async () => {
    const store = new Map<string, unknown>()
    const { host } = wireWithFakeHostConfig(store)
    const ctx = new ConfigContext()
    const api = ctx.makeApi(host, 'plugin.z')

    const value = await api.get('missing', 'fallback')
    expect(value).toBe('fallback')
  })

  it('returns undefined when host returns undefined and no defaultValue provided', async () => {
    const store = new Map<string, unknown>()
    const { host } = wireWithFakeHostConfig(store)
    const ctx = new ConfigContext()
    const api = ctx.makeApi(host, 'plugin.w')

    const value = await api.get('missing')
    expect(value).toBeUndefined()
  })
})

describe('ConfigContext notifyChanged fires all listeners for the same pluginId', () => {
  it('fires multiple distinct listeners for the same plugin', () => {
    const ctx = new ConfigContext()
    const { host } = wireWithFakeHostConfig(new Map())
    const api = ctx.makeApi(host, 'plugin.multi')

    const listener1 = vi.fn()
    const listener2 = vi.fn()
    api.onDidChange(listener1)
    api.onDidChange(listener2)

    ctx.notifyChanged('plugin.multi')

    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener2).toHaveBeenCalledTimes(1)
  })
})
