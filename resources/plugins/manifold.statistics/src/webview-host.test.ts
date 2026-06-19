import { describe, it, expect, vi } from 'vitest'
import { createWebviewHost, type StatisticsHostOptions } from './webview-host'
import type { WebviewView, ProjectVerdicts } from 'manifold'

function resolveWith(host: { provider: { resolveWebviewView(v: WebviewView): void } }) {
  const handlers: Array<(m: unknown) => void> = []
  const postMessage = vi.fn()
  const view = {
    webview: {
      html: '',
      postMessage,
      onDidReceiveMessage: (l: (m: unknown) => void) => { handlers.push(l); return { dispose() {} } },
    },
  } as unknown as WebviewView
  host.provider.resolveWebviewView(view)
  return { send: (m: unknown) => handlers.forEach((h) => h(m)), postMessage }
}

const GROUPS: ProjectVerdicts[] = [{ projectId: 'p1', projectName: 'Repo One', records: [] }]

function baseOpts(over: Partial<StatisticsHostOptions> = {}): StatisticsHostOptions {
  return {
    readBundle: () => '',
    listAll: async () => GROUPS,
    openExternal: () => {},
    ...over,
  }
}

describe('statistics webview host', () => {
  it('reads all projects and posts grouped init on ready/refresh', async () => {
    const listAll = vi.fn(async () => GROUPS)
    const host = createWebviewHost(baseOpts({ listAll }))
    const { send, postMessage } = resolveWith(host)
    send({ type: 'refresh' })
    await new Promise((r) => setTimeout(r, 0))
    expect(listAll).toHaveBeenCalled()
    expect(postMessage).toHaveBeenCalledWith({ type: 'init', groups: GROUPS, error: null })
  })

  it('posts an init with the error message when the read fails', async () => {
    const host = createWebviewHost(baseOpts({ listAll: async () => { throw new Error('boom') } }))
    const { send, postMessage } = resolveWith(host)
    send({ type: 'ready' })
    await new Promise((r) => setTimeout(r, 0))
    expect(postMessage).toHaveBeenCalledWith({ type: 'init', groups: [], error: 'boom' })
  })

  it('forwards open-external to the host opener', () => {
    const openExternal = vi.fn()
    const host = createWebviewHost(baseOpts({ openExternal }))
    const { send } = resolveWith(host)
    send({ type: 'open-external', url: 'https://example.com/pr/1' })
    expect(openExternal).toHaveBeenCalledWith('https://example.com/pr/1')
  })
})
