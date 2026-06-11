import { describe, it, expect } from 'vitest'
import { createWebviewHost, buildWebviewHtml, type WatchFacade } from './webview-host'
import type { WatchSetupStatus } from './shared-types'

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

const SETUP: WatchSetupStatus = { ffmpeg: true, ytdlp: true, hasBrew: true, provider: 'none', hasApiKey: false }

function recordingFacade(): WatchFacade & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    getActiveSessionId: () => 's1',
    getSnapshot: async () => ({ url: 'https://v', run: null }),
    setupStatus: async () => SETUP,
    getPersisted: async () => ({ savedKey: 'savedValue' }),
    persist: async (key) => { calls.push(`persist:${key}`) },
    peek: async (url) => { calls.push(`peek:${url}`); return { ok: true, title: 'T' } },
    runVideo: async ({ url, sourceUrl, onProgress }) => {
      calls.push(`runVideo:${url}:${sourceUrl ?? ''}`)
      onProgress('log', 'line-1')
      return { ok: true, workDir: '/tmp/wd' }
    },
    installBinaries: async (onLog) => { calls.push('installBinaries'); onLog('brew line'); return { ok: true } },
    readFrame: async (p) => { calls.push(`readFrame:${p}`); return 'data:image/jpeg;base64,xx' },
    setUrl: async (url) => { calls.push(`setUrl:${url}`) },
    improvePrompt: async (draft) => { calls.push(`improvePrompt:${draft}`); return 'better question' },
  }
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
const find = <T>(v: { posted: unknown[] }, type: string): T =>
  v.posted.find((m) => (m as { type?: string }).type === type) as T

describe('createWebviewHost — html + init', () => {
  it('serves HTML with the inlined bundle and a root node; escapes </script>', async () => {
    const host = createWebviewHost({ facade: recordingFacade(), readBundle: () => 'var x = "</script>"' })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    expect(v.webview.html).toContain('id="root"')
    expect(v.webview.html).toContain('<\\/script>')
    expect(v.webview.html).not.toContain('</script>"')
  })

  it('buildWebviewHtml escapes </script>', () => {
    expect(buildWebviewHtml('a</script>b')).toContain('<\\/script>')
  })

  it('replies to ready with an init payload (sessionId + snapshot + setup + persisted + running)', async () => {
    const host = createWebviewHost({ facade: recordingFacade(), readBundle: () => '' })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'ready' })
    await tick()
    const init = find<{ sessionId: string; snapshot: { url: string }; setup: WatchSetupStatus; persisted: Record<string, unknown>; running: boolean; lastStage: string | null }>(v, 'init')
    expect(init.sessionId).toBe('s1')
    expect(init.snapshot.url).toBe('https://v')
    expect(init.setup).toEqual(SETUP)
    expect(init.persisted).toEqual({ savedKey: 'savedValue' })
    expect(init.running).toBe(false)
    expect(init.lastStage).toBeNull()
  })

  it('init carries a null snapshot when there is no active session', async () => {
    const facade = recordingFacade()
    facade.getActiveSessionId = () => null
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'ready' })
    await tick()
    const init = find<{ sessionId: string | null; snapshot: unknown }>(v, 'init')
    expect(init.sessionId).toBeNull()
    expect(init.snapshot).toBeNull()
  })

  it('refresh re-posts init; refresh before a view resolves is a no-op (does not throw)', async () => {
    const host = createWebviewHost({ facade: recordingFacade(), readBundle: () => '' })
    expect(() => host.refresh()).not.toThrow()
    const v = fakeView()
    await host.provider.resolveWebviewView(v as never)
    host.refresh()
    await tick()
    expect(v.posted.filter((m) => (m as { type?: string }).type === 'init').length).toBeGreaterThanOrEqual(1)
  })
})

describe('createWebviewHost — request/response correlation', () => {
  it('peek replies with the request reqId', async () => {
    const facade = recordingFacade()
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'peek', reqId: 7, url: 'https://a' })
    await tick()
    const peek = find<{ reqId: number; result: { ok: boolean; title: string } }>(v, 'peekResult')
    expect(peek.reqId).toBe(7)
    expect(peek.result.title).toBe('T')
    expect(facade.calls).toContain('peek:https://a')
  })

  it('readFrame replies frameData with the dataUrl; a facade throw becomes an error reply', async () => {
    const facade = recordingFacade()
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'readFrame', reqId: 3, framePath: '/tmp/f.jpg' })
    await tick()
    const ok = find<{ reqId: number; dataUrl: string }>(v, 'frameData')
    expect(ok.reqId).toBe(3)
    expect(ok.dataUrl).toContain('data:image/jpeg')

    facade.readFrame = async () => { throw new Error('bad path') }
    v.fire({ type: 'readFrame', reqId: 4, framePath: '/etc/passwd' })
    await tick()
    const err = v.posted.filter((m) => (m as { type?: string }).type === 'frameData').pop() as { reqId: number; error: string; dataUrl?: string }
    expect(err.reqId).toBe(4)
    expect(err.error).toBe('bad path')
    expect(err.dataUrl).toBeUndefined()
  })

  it('setupStatus replies setupStatusResult with the status', async () => {
    const host = createWebviewHost({ facade: recordingFacade(), readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'setupStatus', reqId: 11 })
    await tick()
    const res = find<{ reqId: number; status: WatchSetupStatus }>(v, 'setupStatusResult')
    expect(res.reqId).toBe(11)
    expect(res.status).toEqual(SETUP)
  })

  it('improvePrompt replies improveResult; a facade throw becomes ok:false', async () => {
    const facade = recordingFacade()
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'improvePrompt', reqId: 5, draft: 'why?' })
    await tick()
    const ok = find<{ reqId: number; ok: boolean; text: string }>(v, 'improveResult')
    expect(ok).toEqual({ type: 'improveResult', reqId: 5, ok: true, text: 'better question' })

    facade.improvePrompt = async () => { throw new Error('no model') }
    v.fire({ type: 'improvePrompt', reqId: 6, draft: 'why?' })
    await tick()
    const err = v.posted.filter((m) => (m as { type?: string }).type === 'improveResult').pop() as { reqId: number; ok: boolean; error: string }
    expect(err.reqId).toBe(6)
    expect(err.ok).toBe(false)
    expect(err.error).toBe('no model')
  })

  it('installBinaries streams installProgress lines then replies installResult', async () => {
    const host = createWebviewHost({ facade: recordingFacade(), readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'installBinaries', reqId: 9 })
    await tick()
    expect(find<{ line: string }>(v, 'installProgress').line).toBe('brew line')
    const res = find<{ reqId: number; ok: boolean }>(v, 'installResult')
    expect(res.reqId).toBe(9)
    expect(res.ok).toBe(true)
  })

  it('a failed install surfaces installResult ok:false with the error', async () => {
    const facade = recordingFacade()
    facade.installBinaries = async () => ({ ok: false, error: 'ffmpeg: brew missing' })
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'installBinaries', reqId: 10 })
    await tick()
    const res = find<{ ok: boolean; error: string }>(v, 'installResult')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('ffmpeg: brew missing')
  })
})

describe('createWebviewHost — run lifecycle', () => {
  it('run forwards progress and result tagged with the owning sessionId', async () => {
    const facade = recordingFacade()
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'run', url: 'https://www.youtube.com/watch?v=a', question: 'why?', sourceUrl: 'https://youtu.be/a' })
    await tick()
    // Both the pipeline URL and the typed panel URL reach the facade.
    expect(facade.calls).toContain('runVideo:https://www.youtube.com/watch?v=a:https://youtu.be/a')
    const prog = find<{ sessionId: string; kind: string; payload: unknown }>(v, 'runProgress')
    expect(prog).toEqual({ type: 'runProgress', sessionId: 's1', kind: 'log', payload: 'line-1' })
    const run = find<{ sessionId: string; result: { ok: boolean; workDir: string } }>(v, 'runResult')
    expect(run.sessionId).toBe('s1')
    expect(run.result).toEqual({ ok: true, workDir: '/tmp/wd' })
  })

  it('a runVideo rejection becomes a failed runResult', async () => {
    const facade = recordingFacade()
    facade.runVideo = async () => { throw new Error('pipeline failed') }
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'run', url: 'https://a' })
    await tick()
    const run = find<{ result: { ok: boolean; error: string } }>(v, 'runResult')
    expect(run.result.ok).toBe(false)
    expect(run.result.error).toBe('pipeline failed')
  })

  it('init reports running:true with the last stage while a run is in flight, false after', async () => {
    const facade = recordingFacade()
    let finish: (() => void) | undefined
    facade.runVideo = async ({ onProgress }) => {
      onProgress('stage', 'transcribe')
      await new Promise<void>((r) => { finish = r })
      return { ok: true, workDir: '/tmp/wd' }
    }
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'run', url: 'https://a' })
    await tick()

    // Simulates the webview reloading mid-run (agent switch + switch back).
    v.fire({ type: 'ready' })
    await tick()
    const midRun = find<{ running: boolean; lastStage: string | null }>(v, 'init')
    expect(midRun.running).toBe(true)
    expect(midRun.lastStage).toBe('transcribe')

    finish!()
    await tick()
    v.fire({ type: 'ready' })
    await tick()
    const after = v.posted.filter((m) => (m as { type?: string }).type === 'init').pop() as { running: boolean }
    expect(after.running).toBe(false)
  })

  it('rejects a second run for the same session while one is in flight', async () => {
    const facade = recordingFacade()
    let finish: (() => void) | undefined
    facade.runVideo = async () => {
      await new Promise<void>((r) => { finish = r })
      return { ok: true }
    }
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'run', url: 'https://a' })
    await tick()
    v.fire({ type: 'run', url: 'https://a' })
    await tick()
    const rejected = find<{ result: { ok: boolean; error: string } }>(v, 'runResult')
    expect(rejected.result).toEqual({ ok: false, error: 'A run is already in progress' })
    finish!()
  })

  it('stop aborts the active session’s in-flight run via the host-owned AbortController', async () => {
    const facade = recordingFacade()
    facade.runVideo = async ({ signal }) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve({ ok: false, error: 'aborted' }), { once: true })
      })
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'run', url: 'https://a' })
    await tick()
    expect(v.posted.some((m) => (m as { type?: string }).type === 'runResult')).toBe(false)
    v.fire({ type: 'stop' })
    await tick()
    const run = find<{ result: { ok: boolean; error: string } }>(v, 'runResult')
    expect(run.result.error).toBe('aborted')
  })

  it('stop with no run in flight is a no-op', async () => {
    const facade = recordingFacade()
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'stop' })
    await tick()
    expect(facade.calls).toEqual([])
    expect(v.posted).toEqual([])
  })
})

describe('createWebviewHost — fire-and-forget + trust boundary', () => {
  it('setUrl and persist dispatch to the facade without replies', async () => {
    const facade = recordingFacade()
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'setUrl', url: 'https://x' })
    v.fire({ type: 'persist', key: 'watch.url', value: 'https://x' })
    await tick()
    expect(facade.calls).toEqual(['setUrl:https://x', 'persist:watch.url'])
    expect(v.posted).toEqual([])
  })

  it('ignores inbound messages that are not a valid WebviewMsg (sandbox trust boundary)', async () => {
    const facade = recordingFacade()
    const host = createWebviewHost({ facade, readBundle: () => '' })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'totally-bogus' }); v.fire(null); v.fire('nope'); v.fire(42)
    await tick()
    expect(facade.calls).toEqual([])
    expect(v.posted).toEqual([])
  })
})
