import { describe, expect, it } from 'vitest'
import { RpcEndpoint, HOST_MESSAGES, type RpcMessage } from '../../shared/plugins/rpc'

// A minimal in-memory transport pair.
function pair(): [RpcEndpoint, RpcEndpoint] {
  const a = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => void b.handleMessage(m)) })
  const b = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => void a.handleMessage(m)) })
  return [a, b]
}

describe('HOST_MESSAGES service contract', () => {
  it('$showMessage RPC call reaches the registered handler and returns undefined (no buttons)', async () => {
    // In-memory contract only. The real ExtensionHost handler (debugLog + send 'plugins:notification') runs inside ensure()'s forked utilityProcess and is exercised by the Phase B dev smoke.
    const [host, main] = pair()
    const sent: unknown[] = []
    main.registerService(HOST_MESSAGES, {
      $showMessage: (level: string, message: string, items: string[]) => {
        sent.push({ level, message, items })
        return undefined
      },
    })
    const proxy = host.getProxy<{ $showMessage(l: string, m: string, i: string[]): Promise<string | undefined> }>(HOST_MESSAGES)
    const result = await proxy.$showMessage('info', 'Hello World', [])
    expect(result).toBeUndefined()
    expect(sent).toEqual([{ level: 'info', message: 'Hello World', items: [] }])
  })
})
