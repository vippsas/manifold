import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WatchPanel } from './WatchPanel'
import { __watchBridgeTestHooks } from '../use-watch-bridge'
import { __watchPanelStoreTestHooks } from '../watch-panel-store'
import { __watchUrlPreviewTestHooks } from '../watch-preview-cache'
import { isWebviewMsg } from '../protocol'
import { DEFAULT_WATCH_QUESTION } from '../../shared-types'
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

function initMsg(sessionId: string | null, overrides: Partial<Extract<HostMsg, { type: 'init' }>> = {}): HostMsg {
  return { type: 'init', sessionId, snapshot: null, setup: SETUP, persisted: {}, running: false, lastStage: null, ...overrides }
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
    postHost(initMsg(null))
    await waitFor(() => expect(screen.getByText('Select a project and start an agent first.')).toBeTruthy())
    expect(screen.getByText('Watch')).toBeTruthy()
    // Setup status bar reflects init.setup (yt-dlp missing → install button).
    expect(screen.getByText('Install missing tools')).toBeTruthy()
    expect(screen.getByText('Clear cache')).toBeTruthy()
  })

  it('hydrates the snapshot URL, previews via peek, and runs with the editable prompt', async () => {
    render(<WatchPanel />)
    postHost(initMsg('s1', { snapshot: { url: 'https://youtu.be/abc', run: null } }))

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
      result: { ok: true, title: 'My Video', webpageUrl: 'https://www.youtube.com/watch?v=abc', durationSeconds: 65 },
    })

    // Video card renders (the title also appears as the player's label) with
    // the agent prompt pre-filled with the default — visible and editable.
    await waitFor(() => expect(screen.getAllByText('My Video').length).toBeGreaterThan(0))
    const prompt = screen.getByPlaceholderText(/look for in this video/) as HTMLTextAreaElement
    expect(prompt.value).toBe(DEFAULT_WATCH_QUESTION)
    fireEvent.change(prompt, { target: { value: 'List the demos shown.' } })

    // Run posts the edited prompt and flips to the busy state. The pipeline
    // gets the normalized video URL; the run is recorded under the typed URL.
    fireEvent.click(screen.getByText('Run'))
    await waitFor(() => expect(sent.some((m) => m.type === 'run')).toBe(true))
    const run = sent.find((m): m is Extract<WebviewMsg, { type: 'run' }> => m.type === 'run')!
    expect(run).toEqual({
      type: 'run',
      url: 'https://www.youtube.com/watch?v=abc',
      question: 'List the demos shown.',
      sourceUrl: 'https://youtu.be/abc',
    })
    expect(screen.getByText('Stop')).toBeTruthy()

    // The host finishes: command typed into the agent → "sent" state.
    postHost({ type: 'runResult', sessionId: 's1', result: { ok: true, workDir: '/tmp/wd' } })
    await waitFor(() => expect(screen.getByText('Run again')).toBeTruthy())
    expect(screen.getByText(/Sent to your agent/)).toBeTruthy()
  })

  it('restores the busy state from init when remounted mid-run', async () => {
    render(<WatchPanel />)
    postHost(initMsg('s1', {
      snapshot: { url: 'https://youtu.be/abc', run: { runId: 'r1', status: 'processing', frames: [] } },
      running: true,
      lastStage: 'transcribe',
    }))
    await waitFor(() => expect(screen.getByText('Transcribing…')).toBeTruthy())
    expect(screen.getByText('Stop')).toBeTruthy()
  })
})
