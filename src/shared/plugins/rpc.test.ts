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
})
