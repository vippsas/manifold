import { describe, it, expect } from 'vitest'
import { createWebviewHost, type EngineFacade } from './webview-host'

function fakeView(): {
  posted: unknown[]
  fire: (m: unknown) => void
  webview: { html: string; postMessage: (m: unknown) => void; onDidReceiveMessage: (l: (m: unknown) => void) => { dispose(): void } }
} {
  const posted: unknown[] = []
  let onMsg: ((m: unknown) => void) | undefined
  return {
    posted,
    fire: (m: unknown) => onMsg?.(m),
    webview: {
      html: '',
      postMessage: (m: unknown) => { posted.push(m) },
      onDidReceiveMessage: (l: (m: unknown) => void) => { onMsg = l; return { dispose() {} } },
    },
  }
}

const engine: EngineFacade = {
  getStatus: async () => ({ sessionId: 's1', state: 'running', currentIteration: 2 }),
  getIterations: async () => [{ index: 1, startedAt: 0, outcome: 'improved' }],
  getConfig: async () => null,
}

describe('createWebviewHost', () => {
  it('serves HTML with the inlined bundle and a root node', async () => {
    const host = createWebviewHost({ engine, readBundle: () => 'console.log(1)', getActiveSessionId: () => 's1' })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    expect(v.webview.html).toContain('id="root"')
    expect(v.webview.html).toContain('console.log(1)')
  })

  it('escapes </script> sequences in the bundle', async () => {
    const host = createWebviewHost({ engine, readBundle: () => 'var x = "</script>"', getActiveSessionId: () => 's1' })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    expect(v.webview.html).not.toContain('</script>"')
    expect(v.webview.html).toContain('<\\/script>')
  })

  it('replies to ready with an init snapshot', async () => {
    const host = createWebviewHost({ engine, readBundle: () => '', getActiveSessionId: () => 's1' })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'ready' })
    await new Promise((r) => setTimeout(r, 0))
    const init = v.posted.find((m) => (m as { type?: string }).type === 'init') as { sessionId: string; status: { state: string }; iterations: unknown[] }
    expect(init.sessionId).toBe('s1')
    expect(init.status.state).toBe('running')
    expect(init.iterations.length).toBe(1)
  })

  it('forwards engine emit events to the resolved view', async () => {
    const host = createWebviewHost({ engine, readBundle: () => '', getActiveSessionId: () => 's1' })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    host.emit('status', { sessionId: 's1', state: 'finished', currentIteration: 3 })
    host.emit('iteration', { index: 2, startedAt: 0, outcome: 'regressed' })
    const types = v.posted.map((m) => (m as { type?: string }).type)
    expect(types).toContain('status')
    expect(types).toContain('iteration')
  })

  it('emit before a view resolves is a no-op (does not throw)', () => {
    const host = createWebviewHost({ engine, readBundle: () => '', getActiveSessionId: () => null })
    expect(() => host.emit('status', { sessionId: 's', state: 'idle', currentIteration: 0 })).not.toThrow()
  })
})
