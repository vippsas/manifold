import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useWatchBridge, __watchBridgeTestHooks } from './use-watch-bridge'
import { watchPanelStore, __watchPanelStoreTestHooks } from './watch-panel-store'
import { __watchUrlPreviewTestHooks } from './watch-preview-cache'
import { isWebviewMsg } from './protocol'
import type { WebviewMsg, HostMsg } from './protocol'
import type { WatchSetupStatus } from '../shared-types'

void React // plugin .tsx tests must import React explicitly

const SETUP: WatchSetupStatus = { ffmpeg: true, ytdlp: true, hasBrew: true, provider: 'none', hasApiKey: false }

/** Messages the webview posted to the host (captured off the jsdom window,
 *  where parent === window). */
let sent: WebviewMsg[] = []
const capture = (e: MessageEvent): void => {
  if (isWebviewMsg(e.data)) sent.push(e.data)
}

function postHost(msg: HostMsg): void {
  window.postMessage(msg, '*')
}

async function flushMessages(): Promise<void> {
  // jsdom delivers postMessage asynchronously; one macrotask is enough.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function initMsg(sessionId: string | null, overrides: Partial<Extract<HostMsg, { type: 'init' }>> = {}): HostMsg {
  return { type: 'init', sessionId, snapshot: null, setup: SETUP, persisted: {}, ...overrides }
}

beforeEach(() => {
  sent = []
  window.addEventListener('message', capture)
  __watchBridgeTestHooks.reset()
  __watchPanelStoreTestHooks.reset()
  __watchUrlPreviewTestHooks.reset()
})

afterEach(() => {
  window.removeEventListener('message', capture)
  __watchBridgeTestHooks.reset()
  __watchPanelStoreTestHooks.reset()
  __watchUrlPreviewTestHooks.reset()
})

describe('useWatchBridge', () => {
  it('posts ready on mount and applies init (sessionId, setup, snapshot, persisted)', async () => {
    const { result } = renderHook(() => useWatchBridge())
    await waitFor(() => expect(sent.some((m) => m.type === 'ready')).toBe(true))

    postHost(initMsg('s1', {
      snapshot: {
        url: 'https://playlist',
        playlistFrames: { 1: [{ path: '/tmp/f.jpg', timestampSeconds: 3 }] },
        siblingByIndex: { 1: 'sib-1' },
        playlistDispatched: true,
      },
      persisted: { 'manifold.watch.session-state': { s2: { url: 'https://other' } } },
    }))
    await waitFor(() => expect(result.current.sessionId).toBe('s1'))
    expect(result.current.initialized).toBe(true)
    expect(result.current.setupStatus).toEqual(SETUP)
    // Snapshot hydrated into the per-session store.
    expect(watchPanelStore.get('s1').url).toBe('https://playlist')
    expect(watchPanelStore.get('s1').siblingByIndex).toEqual({ 1: 'sib-1' })
    // Persisted blob seeded the other session's URL.
    expect(watchPanelStore.get('s2').url).toBe('https://other')
  })

  it('re-init replaces the active session and the store restores prior sessions', async () => {
    const { result } = renderHook(() => useWatchBridge())
    postHost(initMsg('s1'))
    await waitFor(() => expect(result.current.sessionId).toBe('s1'))
    watchPanelStore.setUrl('s1', 'https://one')

    postHost(initMsg('s2'))
    await waitFor(() => expect(result.current.sessionId).toBe('s2'))
    expect(watchPanelStore.get('s2').url).toBe('')

    postHost(initMsg('s1'))
    await waitFor(() => expect(result.current.sessionId).toBe('s1'))
    // Switching back restores the in-memory state for s1.
    expect(watchPanelStore.get('s1').url).toBe('https://one')
  })

  it('correlates out-of-order peek replies by reqId', async () => {
    const { result } = renderHook(() => useWatchBridge())
    postHost(initMsg('s1'))
    await waitFor(() => expect(result.current.sessionId).toBe('s1'))

    const pa = result.current.peekUrl('https://a')
    const pb = result.current.peekUrl('https://b')
    // jsdom delivers our own outbound postMessage asynchronously too.
    await waitFor(() => expect(sent.filter((m) => m.type === 'peek').length).toBe(2))
    const peeks = sent.filter((m): m is Extract<WebviewMsg, { type: 'peek' }> => m.type === 'peek')
    // Reply in reverse order — each promise must still get its own result.
    postHost({ type: 'peekResult', reqId: peeks[1].reqId, result: { ok: true, title: 'B' } })
    postHost({ type: 'peekResult', reqId: peeks[0].reqId, result: { ok: true, title: 'A' } })
    await expect(pa).resolves.toEqual({ ok: true, title: 'A' })
    await expect(pb).resolves.toEqual({ ok: true, title: 'B' })
  })

  it('routes playlistProgress to the session that dispatched the run, across a session switch', async () => {
    const { result } = renderHook(() => useWatchBridge())
    postHost(initMsg('s1'))
    await waitFor(() => expect(result.current.sessionId).toBe('s1'))

    const run = result.current.runPlaylist([{ url: 'https://a' }], 'https://a')
    // The user switches sessions while the run is in flight.
    postHost(initMsg('s2'))
    await waitFor(() => expect(result.current.sessionId).toBe('s2'))

    postHost({ type: 'playlistProgress', entryIndex: 0, kind: 'sibling', payload: 'sib-1' })
    postHost({ type: 'playlistProgress', entryIndex: 0, kind: 'frames', payload: [{ path: '/tmp/f.jpg', timestampSeconds: 1 }] })
    await flushMessages()
    expect(watchPanelStore.get('s1').siblingByIndex).toEqual({ 0: 'sib-1' })
    expect(watchPanelStore.get('s1').playlistFrames[0][0].path).toBe('/tmp/f.jpg')
    expect(watchPanelStore.get('s2').siblingByIndex).toEqual({})

    postHost({ type: 'runResult', result: { ok: true } })
    await expect(run).resolves.toEqual({ ok: true })
  })

  it('rejects a second runPlaylist while one is in flight', async () => {
    const { result } = renderHook(() => useWatchBridge())
    postHost(initMsg('s1'))
    await waitFor(() => expect(result.current.sessionId).toBe('s1'))

    const first = result.current.runPlaylist([{ url: 'https://a' }])
    const second = await result.current.runPlaylist([{ url: 'https://b' }])
    expect(second.ok).toBe(false)
    expect(second.error).toMatch(/already in progress/)

    postHost({ type: 'runResult', result: { ok: true } })
    await expect(first).resolves.toEqual({ ok: true })
  })

  it('caches readFrame results and drops failed reads for retry', async () => {
    const { result } = renderHook(() => useWatchBridge())
    postHost(initMsg('s1'))
    await waitFor(() => expect(result.current.sessionId).toBe('s1'))

    const p1 = result.current.readFrame('/tmp/f.jpg')
    const p2 = result.current.readFrame('/tmp/f.jpg')
    expect(p2).toBe(p1) // cached promise, no second request
    await waitFor(() => expect(sent.filter((m) => m.type === 'readFrame').length).toBe(1))
    const reads = sent.filter((m): m is Extract<WebviewMsg, { type: 'readFrame' }> => m.type === 'readFrame')
    postHost({ type: 'frameData', reqId: reads[0].reqId, dataUrl: 'data:image/jpeg;base64,x' })
    await expect(p1).resolves.toBe('data:image/jpeg;base64,x')

    // A failing path is evicted so a retry issues a new request.
    const bad = result.current.readFrame('/tmp/missing.jpg')
    await waitFor(() => expect(sent.filter((m) => m.type === 'readFrame').length).toBe(2))
    const badReq = sent.filter((m): m is Extract<WebviewMsg, { type: 'readFrame' }> => m.type === 'readFrame')[1]
    postHost({ type: 'frameData', reqId: badReq.reqId, error: 'gone' })
    await expect(bad).rejects.toThrow('gone')
    await flushMessages()
    result.current.readFrame('/tmp/missing.jpg').catch(() => {})
    await waitFor(() => expect(sent.filter((m) => m.type === 'readFrame').length).toBe(3))
  })

  it('resolves improvePrompt with the text and rejects on failure', async () => {
    const { result } = renderHook(() => useWatchBridge())
    postHost(initMsg('s1'))
    await waitFor(() => expect(result.current.sessionId).toBe('s1'))

    const ok = result.current.improvePrompt('draft')
    const fail = result.current.improvePrompt('other')
    await waitFor(() => expect(sent.filter((m) => m.type === 'improvePrompt').length).toBe(2))
    const reqs = sent.filter((m): m is Extract<WebviewMsg, { type: 'improvePrompt' }> => m.type === 'improvePrompt')
    postHost({ type: 'improveResult', reqId: reqs[0].reqId, ok: true, text: 'better' })
    postHost({ type: 'improveResult', reqId: reqs[1].reqId, ok: false, error: 'no model' })
    await expect(ok).resolves.toBe('better')
    await expect(fail).rejects.toThrow('no model')
  })

  it('installBinaries resolves the install result and then refreshes setup status', async () => {
    const { result } = renderHook(() => useWatchBridge())
    postHost(initMsg('s1'))
    await waitFor(() => expect(result.current.sessionId).toBe('s1'))

    const install = result.current.installBinaries()
    await waitFor(() => expect(sent.some((m) => m.type === 'installBinaries')).toBe(true))
    const req = sent.find((m): m is Extract<WebviewMsg, { type: 'installBinaries' }> => m.type === 'installBinaries')!
    postHost({ type: 'installResult', reqId: req.reqId, ok: true })
    await waitFor(() => expect(sent.some((m) => m.type === 'setupStatus')).toBe(true))
    const statusReq = sent.find((m): m is Extract<WebviewMsg, { type: 'setupStatus' }> => m.type === 'setupStatus')!
    const newSetup: WatchSetupStatus = { ...SETUP, ffmpeg: true, ytdlp: true }
    postHost({ type: 'setupStatusResult', reqId: statusReq.reqId, status: newSetup })
    await expect(install).resolves.toEqual({ ok: true })
    await waitFor(() => expect(result.current.setupStatus).toEqual(newSetup))
  })
})
