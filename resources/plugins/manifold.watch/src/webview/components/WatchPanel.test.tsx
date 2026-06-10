import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WatchPanel } from './WatchPanel'
import { __watchBridgeTestHooks } from '../use-watch-bridge'
import { __watchPanelStoreTestHooks } from '../watch-panel-store'
import { __watchUrlPreviewTestHooks } from '../watch-preview-cache'
import { isWebviewMsg } from '../protocol'
import type { WebviewMsg, HostMsg } from '../protocol'
import type { WatchSetupStatus } from '../../shared-types'

void React // plugin .tsx tests must import React explicitly

const SETUP: WatchSetupStatus = { ffmpeg: true, ytdlp: false, hasBrew: true, provider: 'none', hasApiKey: false }

let sent: WebviewMsg[] = []
const capture = (e: MessageEvent): void => {
  if (isWebviewMsg(e.data)) sent.push(e.data)
}

function postHost(msg: HostMsg): void {
  window.postMessage(msg, '*')
}

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  sent = []
  window.addEventListener('message', capture)
  __watchBridgeTestHooks.reset()
  __watchPanelStoreTestHooks.reset()
  __watchUrlPreviewTestHooks.reset()
})

afterEach(() => {
  window.removeEventListener('message', capture)
  vi.unstubAllGlobals()
  __watchBridgeTestHooks.reset()
  __watchPanelStoreTestHooks.reset()
  __watchUrlPreviewTestHooks.reset()
})

describe('WatchPanel (smoke)', () => {
  it('renders the hero and the no-session hint before a session is active', async () => {
    render(<WatchPanel />)
    postHost({ type: 'init', sessionId: null, snapshot: null, setup: SETUP, persisted: {} })
    await waitFor(() => expect(screen.getByText('Select a project and start an agent first.')).toBeTruthy())
    expect(screen.getByText('Watch')).toBeTruthy()
    // Setup status bar reflects init.setup (yt-dlp missing → install button).
    expect(screen.getByText('Install missing tools')).toBeTruthy()
    expect(screen.getByText('Clear cache')).toBeTruthy()
  })

  it('hydrates the snapshot URL, previews via peek, and reveals the sibling agent', async () => {
    render(<WatchPanel />)
    postHost({
      type: 'init',
      sessionId: 's1',
      snapshot: {
        url: 'https://youtu.be/abc',
        playlistFrames: {},
        siblingByIndex: { 0: 'sib-1' },
        playlistDispatched: true,
      },
      setup: SETUP,
      persisted: {},
    })

    // URL input hydrated from the snapshot.
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/youtu\.be/) as HTMLInputElement
      expect(input.value).toBe('https://youtu.be/abc')
    })

    // The preview hook debounces 400ms, then posts a peek request — answer it.
    await waitFor(() => expect(sent.some((m) => m.type === 'peek')).toBe(true), { timeout: 2000 })
    const peek = sent.find((m): m is Extract<WebviewMsg, { type: 'peek' }> => m.type === 'peek')!
    postHost({
      type: 'peekResult',
      reqId: peek.reqId,
      result: { ok: true, title: 'My Video', webpageUrl: 'https://youtu.be/abc', durationSeconds: 65 },
    })

    // Entry card renders (the title also appears as the auto-focused player's
    // label) with the sibling's "Open agent" affordance.
    await waitFor(() => expect(screen.getAllByText('My Video').length).toBeGreaterThan(0))
    const openBtn = screen.getByText('Open agent →')
    fireEvent.click(openBtn)
    await waitFor(() => expect(sent.some((m) => m.type === 'revealAgent')).toBe(true))
    const reveal = sent.find((m): m is Extract<WebviewMsg, { type: 'revealAgent' }> => m.type === 'revealAgent')!
    expect(reveal.sessionId).toBe('sib-1')
    expect(reveal.title).toBe('My Video')
  })
})
