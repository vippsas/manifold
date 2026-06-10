/// <reference lib="dom" />
// resources/plugins/manifold.watch/src/webview/use-watch-bridge.ts
// Webview-side replacement for the builtin's electronAPI plumbing: state from
// host messages, actions via parent.postMessage. Request/response pairs are
// correlated by reqId (request-tracker); `runPlaylist` is single-flight (the
// UI disables Run while busy) so one pending resolver suffices.
import { useCallback, useEffect, useState } from 'react'
import type { HostMsg } from './protocol'
import type {
  WatchPeekResult,
  WatchPlaylistEntryInput,
  WatchPlaylistPeekResult,
  WatchPlaylistRunResult,
  WatchSetupStatus,
} from '../shared-types'
import { postToHost } from './host-post'
import { createRequestTracker } from './request-tracker'
import { watchPanelStore } from './watch-panel-store'
import { hydratePreviewCaches } from './watch-preview-cache'

interface ThemeMsg { type: '__manifold_theme'; vars: Record<string, string> }

export interface WatchBridge {
  /** False until the first `init` arrives. */
  initialized: boolean
  sessionId: string | null
  setupStatus: WatchSetupStatus | null
  refreshSetupStatus: () => Promise<void>
  installBinaries: () => Promise<{ ok: boolean; error?: string }>
  peekUrl: (url: string) => Promise<WatchPeekResult>
  peekPlaylist: (url: string) => Promise<WatchPlaylistPeekResult>
  runPlaylist: (entries: WatchPlaylistEntryInput[], sourceUrl?: string) => Promise<WatchPlaylistRunResult>
  readFrame: (path: string) => Promise<string>
  improvePrompt: (draft: string) => Promise<string>
  revealAgent: (sessionId: string, title?: string) => void
  /** Debounce-free host write of the panel URL (callers debounce). */
  postUrlToHost: (url: string) => void
}

// Module-level so correlation state survives a panel remount within the same
// webview document (replies for in-flight requests still find their promise).
const peekTracker = createRequestTracker<WatchPeekResult>()
const peekPlaylistTracker = createRequestTracker<WatchPlaylistPeekResult>()
const installTracker = createRequestTracker<{ ok: boolean; error?: string }>()
const frameTracker = createRequestTracker<string>()
const setupTracker = createRequestTracker<WatchSetupStatus>()
const improveTracker = createRequestTracker<string>()

let pendingRun: { resolve: (r: WatchPlaylistRunResult) => void } | null = null
// The session that owns the in-flight run. The builtin's progress events
// carried a sessionId; the plugin protocol implies it from the single
// in-flight run, so progress is routed to the session that dispatched it even
// if the user switches sessions mid-run.
let runSessionId: string | null = null
let currentSessionId: string | null = null

// Frame thumbnails are immutable on disk for a run — cache the data-URL
// promises so re-renders and the lightbox don't re-request the same frame.
const frameCache = new Map<string, Promise<string>>()

export function useWatchBridge(): WatchBridge {
  const [initialized, setInitialized] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [setupStatus, setSetupStatus] = useState<WatchSetupStatus | null>(null)

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const m = e.data as HostMsg | ThemeMsg | null
      if (!m || typeof m !== 'object') return
      switch (m.type) {
        case '__manifold_theme':
          for (const [k, v] of Object.entries(m.vars)) document.documentElement.style.setProperty(k, v)
          return
        case 'init':
          // REPLACE the active session: the per-session store keeps every
          // session's in-memory state, so switching back restores it.
          watchPanelStore.hydrateFromPersisted(m.persisted)
          hydratePreviewCaches(m.persisted)
          if (m.sessionId && m.snapshot) watchPanelStore.hydrateSession(m.sessionId, m.snapshot)
          currentSessionId = m.sessionId
          setSessionId(m.sessionId)
          setSetupStatus(m.setup)
          setInitialized(true)
          return
        case 'peekResult':
          peekTracker.resolve(m.reqId, m.result)
          return
        case 'peekPlaylistResult':
          peekPlaylistTracker.resolve(m.reqId, m.result)
          return
        case 'runResult': {
          const run = pendingRun
          pendingRun = null
          runSessionId = null
          run?.resolve(m.result)
          return
        }
        case 'playlistProgress': {
          const target = runSessionId ?? currentSessionId
          if (target) watchPanelStore.applyPlaylistProgress(target, m.entryIndex, m.kind, m.payload)
          return
        }
        case 'installProgress':
          // The builtin surfaced no install log; parity keeps this silent.
          return
        case 'installResult':
          installTracker.resolve(m.reqId, { ok: m.ok, error: m.error })
          return
        case 'frameData':
          if (m.dataUrl !== undefined) frameTracker.resolve(m.reqId, m.dataUrl)
          else frameTracker.reject(m.reqId, new Error(m.error ?? 'frame read failed'))
          return
        case 'setupStatusResult':
          setupTracker.resolve(m.reqId, m.status)
          return
        case 'improveResult':
          if (m.ok && m.text !== undefined) improveTracker.resolve(m.reqId, m.text)
          else improveTracker.reject(m.reqId, new Error(m.error ?? 'Improve failed'))
          return
      }
    }
    window.addEventListener('message', onMessage)
    postToHost({ type: 'ready' })
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // All actions close over module state / stable setters only ⇒ stable
  // identities, so downstream effect deps (e.g. useWatchUrlPreview's peek
  // functions) don't re-fire on every render.
  const refreshSetupStatus = useCallback(async (): Promise<void> => {
    const { reqId, promise } = setupTracker.begin()
    postToHost({ type: 'setupStatus', reqId })
    setSetupStatus(await promise)
  }, [])

  const installBinaries = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const { reqId, promise } = installTracker.begin()
    postToHost({ type: 'installBinaries', reqId })
    const result = await promise
    await refreshSetupStatus()
    return result
  }, [refreshSetupStatus])

  const peekUrl = useCallback((url: string): Promise<WatchPeekResult> => {
    const { reqId, promise } = peekTracker.begin()
    postToHost({ type: 'peek', reqId, url })
    return promise
  }, [])

  const peekPlaylist = useCallback((url: string): Promise<WatchPlaylistPeekResult> => {
    const { reqId, promise } = peekPlaylistTracker.begin()
    postToHost({ type: 'peekPlaylist', reqId, url })
    return promise
  }, [])

  const runPlaylist = useCallback((entries: WatchPlaylistEntryInput[], sourceUrl?: string): Promise<WatchPlaylistRunResult> => {
    if (pendingRun) return Promise.resolve({ ok: false, error: 'A run is already in progress' })
    return new Promise<WatchPlaylistRunResult>((resolve) => {
      runSessionId = currentSessionId
      pendingRun = { resolve }
      postToHost({ type: 'runPlaylist', entries, sourceUrl })
    })
  }, [])

  const readFrame = useCallback((path: string): Promise<string> => {
    const cached = frameCache.get(path)
    if (cached) return cached
    const { reqId, promise } = frameTracker.begin()
    postToHost({ type: 'readFrame', reqId, framePath: path })
    frameCache.set(path, promise)
    // Drop failed reads so a later retry re-requests instead of re-failing.
    promise.catch(() => { frameCache.delete(path) })
    return promise
  }, [])

  const improvePrompt = useCallback((draft: string): Promise<string> => {
    const { reqId, promise } = improveTracker.begin()
    postToHost({ type: 'improvePrompt', reqId, draft })
    return promise
  }, [])

  const revealAgent = useCallback((sid: string, title?: string): void => {
    postToHost({ type: 'revealAgent', sessionId: sid, title })
  }, [])

  const postUrlToHost = useCallback((url: string): void => {
    postToHost({ type: 'setUrl', url })
  }, [])

  return {
    initialized,
    sessionId,
    setupStatus,
    refreshSetupStatus,
    installBinaries,
    peekUrl,
    peekPlaylist,
    runPlaylist,
    readFrame,
    improvePrompt,
    revealAgent,
    postUrlToHost,
  }
}

export const __watchBridgeTestHooks = {
  reset(): void {
    pendingRun = null
    runSessionId = null
    currentSessionId = null
    frameCache.clear()
  },
}
