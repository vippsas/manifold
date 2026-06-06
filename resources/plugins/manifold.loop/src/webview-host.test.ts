import { describe, it, expect } from 'vitest'
import { createWebviewHost, buildWebviewHtml, type EngineFacade } from './webview-host'

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

function recordingEngine(): EngineFacade & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    getStatus: async () => ({ sessionId: 's1', state: 'running', currentIteration: 2 }),
    getStatusSync: () => ({ sessionId: 's1', state: 'running', currentIteration: 0 }),
    getIterations: async () => [{ index: 1, startedAt: 0, outcome: 'improved' }],
    getConfig: async () => null,
    start: async () => { calls.push('start') },
    stop: async () => { calls.push('stop') },
    setConfig: async () => { calls.push('setConfig'); return {} },
    restoreBest: async () => ({ sha: 'abcdef0' }),
    clear: async () => { calls.push('clear'); return {} },
  }
}

const baseOpts = (): { readBundle: () => string; getActiveSessionId: () => string | null; confirmClear: () => Promise<boolean>; improveWithAi: () => Promise<string> } => ({
  readBundle: () => '',
  getActiveSessionId: () => 's1',
  confirmClear: async () => true,
  improveWithAi: async () => 'improved text',
})

describe('createWebviewHost — html + init', () => {
  it('serves HTML with the inlined bundle and a root node; escapes </script>', async () => {
    const host = createWebviewHost({ engine: recordingEngine(), ...baseOpts(), readBundle: () => 'var x = "</script>"' })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    expect(v.webview.html).toContain('id="root"')
    expect(v.webview.html).toContain('<\\/script>')
    expect(v.webview.html).not.toContain('</script>"')
  })

  it('replies to ready with an init snapshot', async () => {
    const host = createWebviewHost({ engine: recordingEngine(), ...baseOpts() })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'ready' })
    await new Promise((r) => setTimeout(r, 0))
    const init = v.posted.find((m) => (m as { type?: string }).type === 'init') as { sessionId: string; status: { state: string }; iterations: unknown[] }
    expect(init.sessionId).toBe('s1')
    expect(init.status.state).toBe('running')
    expect(init.iterations.length).toBe(1)
  })

  it('buildWebviewHtml escapes </script>', () => {
    expect(buildWebviewHtml('a</script>b')).toContain('<\\/script>')
  })
})

describe('createWebviewHost — events', () => {
  it('forwards engine emit events to the resolved view', async () => {
    const host = createWebviewHost({ engine: recordingEngine(), ...baseOpts() })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    host.emit('status', { sessionId: 's1', state: 'finished', currentIteration: 3 })
    host.emit('iteration', { index: 2, startedAt: 0, outcome: 'regressed' })
    const types = v.posted.map((m) => (m as { type?: string }).type)
    expect(types).toContain('status')
    expect(types).toContain('iteration')
  })

  it('emit before a view resolves is a no-op (does not throw)', () => {
    const host = createWebviewHost({ engine: recordingEngine(), ...baseOpts(), getActiveSessionId: () => null })
    expect(() => host.emit('status', { sessionId: 's', state: 'idle', currentIteration: 0 })).not.toThrow()
  })

  it('refresh re-posts init', async () => {
    const host = createWebviewHost({ engine: recordingEngine(), ...baseOpts() })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    host.refresh()
    await new Promise((r) => setTimeout(r, 0))
    expect(v.posted.filter((m) => (m as { type?: string }).type === 'init').length).toBeGreaterThanOrEqual(1)
  })
})

describe('createWebviewHost — actions', () => {
  it('start/stop/saveConfig call the engine', async () => {
    const engine = recordingEngine()
    const host = createWebviewHost({ engine, ...baseOpts() })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'start', config: { sessionId: 's1' } }); v.fire({ type: 'stop' }); v.fire({ type: 'saveConfig', config: { sessionId: 's1' } })
    await new Promise((r) => setTimeout(r, 0))
    expect(engine.calls).toEqual(['start', 'stop', 'setConfig'])
  })

  it('restoreBest posts restoreResult with the sha', async () => {
    const host = createWebviewHost({ engine: recordingEngine(), ...baseOpts() })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'restoreBest' }); await new Promise((r) => setTimeout(r, 0))
    const rr = v.posted.find((m) => (m as { type?: string }).type === 'restoreResult') as { ok: boolean; sha: string }
    expect(rr.ok).toBe(true); expect(rr.sha).toBe('abcdef0')
  })

  it('clearRequest declined → no clear; confirmed → clear + re-init', async () => {
    const declined = recordingEngine()
    const hostD = createWebviewHost({ engine: declined, ...baseOpts(), confirmClear: async () => false })
    const vD = fakeView(); await hostD.provider.resolveWebviewView(vD as never)
    vD.fire({ type: 'clearRequest' }); await new Promise((r) => setTimeout(r, 0))
    expect(declined.calls).not.toContain('clear')

    const confirmed = recordingEngine()
    const hostC = createWebviewHost({ engine: confirmed, ...baseOpts(), confirmClear: async () => true })
    const vC = fakeView(); await hostC.provider.resolveWebviewView(vC as never)
    vC.fire({ type: 'clearRequest' }); await new Promise((r) => setTimeout(r, 0))
    expect(confirmed.calls).toContain('clear')
    expect(vC.posted.filter((m) => (m as { type?: string }).type === 'init').length).toBeGreaterThanOrEqual(1)
  })

  it('improveWithAi posts aiResult', async () => {
    const host = createWebviewHost({ engine: recordingEngine(), ...baseOpts() })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'improveWithAi', draft: 'd', evalCommand: 'e', targetGlobs: 'g' }); await new Promise((r) => setTimeout(r, 0))
    const ai = v.posted.find((m) => (m as { type?: string }).type === 'aiResult') as { ok: boolean; text: string }
    expect(ai.ok).toBe(true); expect(ai.text).toBe('improved text')
  })
})
