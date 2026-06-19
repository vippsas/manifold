import { describe, it, expect } from 'vitest'
import { RpcEndpoint, HOST_VERDICTS, type RpcMessage } from '../shared/plugins/rpc'
import { createVerdictsApi } from './verdicts-api'

function wire(): { host: RpcEndpoint; main: RpcEndpoint } {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  main = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => void host.handleMessage(m)) })
  host = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => void main.handleMessage(m)) })
  return { host, main }
}

describe('createVerdictsApi.clearProject', () => {
  it('forwards pluginId + projectId to HOST_VERDICTS.$clearProject', async () => {
    const { host, main } = wire()
    const calls: Array<[string, string]> = []
    main.registerService(HOST_VERDICTS, {
      $listByProject: () => Promise.resolve([]),
      $clearProject: (pluginId: string, projectId: string) => { calls.push([pluginId, projectId]); return Promise.resolve() },
    })
    const api = createVerdictsApi(host, 'manifold.statistics')
    await api.clearProject('p1')
    expect(calls).toEqual([['manifold.statistics', 'p1']])
  })
})
