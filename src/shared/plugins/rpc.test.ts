// src/shared/plugins/rpc.test.ts
import { describe, expect, it, vi } from 'vitest'
import { RpcEndpoint, type RpcMessage } from './rpc'

/** Wire two endpoints directly to each other (in-memory transport). */
function pair() {
  let a!: RpcEndpoint, b!: RpcEndpoint
  a = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => b.handleMessage(m)) })
  b = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => a.handleMessage(m)) })
  return { a, b }
}

describe('RpcEndpoint', () => {
  it('round-trips a request to a registered service and returns its result', async () => {
    const { a, b } = pair()
    b.registerService('Svc', { $add: (x: number, y: number) => x + y })
    const proxy = a.getProxy<{ $add: (x: number, y: number) => Promise<number> }>('Svc')
    expect(await proxy.$add(2, 3)).toBe(5)
  })

  it('awaits async service methods', async () => {
    const { a, b } = pair()
    b.registerService('Svc', { $echo: async (v: string) => `${v}!` })
    const proxy = a.getProxy<{ $echo: (v: string) => Promise<string> }>('Svc')
    expect(await proxy.$echo('hi')).toBe('hi!')
  })

  it('rejects when the service method throws', async () => {
    const { a, b } = pair()
    b.registerService('Svc', { $boom: () => { throw new Error('nope') } })
    const proxy = a.getProxy<{ $boom: () => Promise<void> }>('Svc')
    await expect(proxy.$boom()).rejects.toThrow('nope')
  })

  it('rejects calls to an unknown service', async () => {
    const { a } = pair()
    const proxy = a.getProxy<{ $x: () => Promise<void> }>('Missing')
    await expect(proxy.$x()).rejects.toThrow(/Missing/)
  })

  it('rejectAllPending rejects every in-flight call (e.g. when the host process dies)', async () => {
    // Transport posts into the void, so the call never gets a reply and stays pending.
    const endpoint = new RpcEndpoint({ post: () => {} })
    const proxy = endpoint.getProxy<{ $hang: () => Promise<void> }>('Svc')
    const inflight = proxy.$hang()
    endpoint.rejectAllPending('plugin host exited')
    await expect(inflight).rejects.toThrow('plugin host exited')
  })

  it('rejectAllPending is a no-op when there are no pending calls', () => {
    const endpoint = new RpcEndpoint({ post: () => {} })
    expect(() => endpoint.rejectAllPending('host exited')).not.toThrow()
  })

  it('a later reply for an already-rejected id is ignored (no crash)', async () => {
    let deliver: (() => void) | undefined
    const endpoint = new RpcEndpoint({ post: (m) => { if (m.t === 'req') deliver = () => endpoint.handleMessage({ t: 'rep', id: m.id, ok: true, value: 1 }) } })
    const inflight = endpoint.getProxy<{ $x: () => Promise<number> }>('Svc').$x()
    endpoint.rejectAllPending('host exited')
    await expect(inflight).rejects.toThrow('host exited')
    // The host's (late) reply arrives after the endpoint gave up — must be dropped silently.
    expect(() => deliver?.()).not.toThrow()
  })
})
