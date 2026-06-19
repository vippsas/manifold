import { describe, it, expect, vi } from 'vitest'
import { createWebviewHost, type StatisticsHostOptions } from './webview-host'
import type { WebviewView } from 'manifold'

function resolveWith(host: { provider: { resolveWebviewView(v: WebviewView): void } }) {
  const handlers: Array<(m: unknown) => void> = []
  const view = {
    webview: {
      html: '',
      postMessage: vi.fn(),
      onDidReceiveMessage: (l: (m: unknown) => void) => { handlers.push(l); return { dispose() {} } },
    },
  } as unknown as WebviewView
  host.provider.resolveWebviewView(view)
  return { send: (m: unknown) => handlers.forEach((h) => h(m)), view }
}

function baseOpts(over: Partial<StatisticsHostOptions> = {}): StatisticsHostOptions {
  return {
    readBundle: () => '',
    activeProjectId: () => 'p1',
    list: async () => [],
    openExternal: () => {},
    clearProject: vi.fn(async () => {}),
    confirmReset: vi.fn(async () => true),
    ...over,
  }
}

describe('statistics host reset', () => {
  it('clears the project and refreshes when confirmed', async () => {
    const clearProject = vi.fn(async () => {})
    const confirmReset = vi.fn(async () => true)
    const host = createWebviewHost(baseOpts({ clearProject, confirmReset }))
    const { send } = resolveWith(host)
    send({ type: 'reset' })
    await new Promise((r) => setTimeout(r, 0))
    expect(confirmReset).toHaveBeenCalledWith('p1')
    expect(clearProject).toHaveBeenCalledWith('p1')
  })

  it('does nothing when cancelled', async () => {
    const clearProject = vi.fn(async () => {})
    const host = createWebviewHost(baseOpts({ clearProject, confirmReset: async () => false }))
    const { send } = resolveWith(host)
    send({ type: 'reset' })
    await new Promise((r) => setTimeout(r, 0))
    expect(clearProject).not.toHaveBeenCalled()
  })

  it('ignores reset when no project is active', async () => {
    const clearProject = vi.fn(async () => {})
    const confirmReset = vi.fn(async () => true)
    const host = createWebviewHost(baseOpts({ activeProjectId: () => null, clearProject, confirmReset }))
    const { send } = resolveWith(host)
    send({ type: 'reset' })
    await new Promise((r) => setTimeout(r, 0))
    expect(confirmReset).not.toHaveBeenCalled()
    expect(clearProject).not.toHaveBeenCalled()
  })
})
