// resources/plugins/manifold.watch/src/webview/watch-panel-store.ts
// Per-session UI state for the Watch panel. The webview document is torn down
// on every panel remount (agent switches), so nothing here is authoritative:
// run state lives host-side (run-store + the in-flight AbortController) and is
// restored through `init` (hydrateSession) and the sessionId-tagged
// runProgress/runResult events the bridge feeds into this store.
import type { WatchFrameRef, WatchSessionSnapshot, WatchVideoRunResult } from '../shared-types'
import { postPersist } from './host-post'

/** UI status of the active session's run. 'sent' = the /watch:watch command
 *  has been typed into the user's agent. */
export type WatchRunUiStatus = 'idle' | 'running' | 'sent' | 'error'

export interface WatchSessionState {
  /** Persisted Watch-panel URL so it survives webview re-inits. */
  url: string
  status: WatchRunUiStatus
  /** Last pipeline stage while running ('download' | 'frames' | …). */
  stage: string | null
  /** Frame thumbnails of the current run. */
  frames: WatchFrameRef[]
  error: string | null
  /** Whether the user has collapsed the embedded video player. Persisted so
   *  navigating away and back doesn't re-expand it. */
  playerHidden: boolean
}

const EMPTY_STATE: WatchSessionState = Object.freeze({
  url: '',
  status: 'idle',
  stage: null,
  frames: [],
  error: null,
  playerHidden: false,
}) as WatchSessionState

const stateMap = new Map<string, WatchSessionState>()
const listeners = new Map<string, Set<() => void>>()

// The persisted blob holds only the URL per session (run state comes from the
// host snapshot on init, so stale runs from a prior app run never reappear).
interface PersistedSessionState {
  url: string
}
export const STORAGE_KEY = 'manifold.watch.session-state'
let persistFn: (key: string, value: unknown) => void = postPersist
let persistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    const out: Record<string, PersistedSessionState> = {}
    for (const [sid, state] of stateMap.entries()) {
      if (state.url) out[sid] = { url: state.url }
    }
    persistFn(STORAGE_KEY, out)
  }, 500)
}

function notify(sessionId: string): void {
  const set = listeners.get(sessionId)
  if (!set) return
  for (const fn of set) fn()
}

function update(sessionId: string, updater: (cur: WatchSessionState) => WatchSessionState): void {
  const cur = stateMap.get(sessionId) ?? EMPTY_STATE
  const next = updater(cur)
  if (next === cur) return
  stateMap.set(sessionId, next)
  notify(sessionId)
  if (next.url !== cur.url) schedulePersist()
}

function sameFrames(a: WatchFrameRef[], b: WatchFrameRef[]): boolean {
  if (a.length !== b.length) return false
  return a.every((f, i) => f.path === b[i].path)
}

export const watchPanelStore = {
  /** Seed URLs from the host-persisted blob (init.persisted). In-memory state
   *  wins: only sessions we have no state for are hydrated, so re-inits
   *  (session switches) never clobber live state. */
  hydrateFromPersisted(persisted: Record<string, unknown>): void {
    const raw = persisted[STORAGE_KEY]
    if (!raw || typeof raw !== 'object') return
    for (const [sessionId, value] of Object.entries(raw as Record<string, PersistedSessionState>)) {
      if (value && typeof value.url === 'string' && value.url && !stateMap.has(sessionId)) {
        stateMap.set(sessionId, { ...EMPTY_STATE, url: value.url })
      }
    }
  },
  /** Restore a session's run state from the host `init`: `running` reflects
   *  the host's in-flight AbortController (survives webview reloads — the
   *  bug-fix this store exists for), `snapshot.run` the persisted run-store
   *  entry. A persisted 'processing' run without `running` means the plugin
   *  host died mid-run — surfaced as idle, not as a forever-spinner. */
  hydrateSession(sessionId: string, snapshot: WatchSessionSnapshot, running: boolean, lastStage: string | null): void {
    update(sessionId, (cur) => {
      // The user may have typed a different URL while the snapshot was
      // in flight — drop the stale snapshot rather than clobber the new URL
      // (and the run state that belongs to it).
      if (cur.url && snapshot.url && cur.url !== snapshot.url) return cur

      const url = cur.url || snapshot.url
      const run = snapshot.run
      const status: WatchRunUiStatus = running
        ? 'running'
        : run?.status === 'ready' ? 'sent'
          : run?.status === 'error' ? 'error'
            : 'idle'
      const stage = running ? (lastStage ?? cur.stage) : null
      const frames = run && run.frames.length > 0 ? run.frames : cur.frames
      const error = status === 'error' ? (run?.error ?? null) : null
      if (
        url === cur.url &&
        status === cur.status &&
        stage === cur.stage &&
        error === cur.error &&
        sameFrames(frames, cur.frames)
      ) {
        return cur
      }
      return { ...cur, url, status, stage, frames, error }
    })
  },
  applyRunProgress(sessionId: string, kind: 'log' | 'stage' | 'frames', payload: unknown): void {
    if (kind === 'frames' && Array.isArray(payload)) {
      const frames = payload as WatchFrameRef[]
      update(sessionId, (cur) => ({ ...cur, frames }))
    } else if (kind === 'stage' && typeof payload === 'string') {
      update(sessionId, (cur) => ({ ...cur, stage: payload }))
    }
  },
  applyRunResult(sessionId: string, result: WatchVideoRunResult): void {
    update(sessionId, (cur) => ({
      ...cur,
      status: result.ok ? 'sent' : 'error',
      stage: null,
      error: result.ok ? null : (result.error ?? 'Run failed'),
    }))
  },
  /** Optimistic transition when the user clicks Run (the host's runProgress /
   *  runResult events settle the final state). */
  setRunning(sessionId: string): void {
    update(sessionId, (cur) => ({ ...cur, status: 'running', stage: null, frames: [], error: null }))
  },
  get(sessionId: string | null): WatchSessionState {
    if (!sessionId) return EMPTY_STATE
    return stateMap.get(sessionId) ?? EMPTY_STATE
  },
  subscribe(sessionId: string | null, listener: () => void): () => void {
    if (!sessionId) return () => undefined
    let set = listeners.get(sessionId)
    if (!set) {
      set = new Set()
      listeners.set(sessionId, set)
    }
    set.add(listener)
    return () => {
      const s = listeners.get(sessionId)
      if (!s) return
      s.delete(listener)
      if (s.size === 0) listeners.delete(sessionId)
    }
  },
  setUrl(sessionId: string, url: string): void {
    update(sessionId, (cur) => {
      if (cur.url === url) return cur
      // Setting a new URL resets everything tied to the previous run.
      return { ...cur, url, status: 'idle', stage: null, frames: [], error: null }
    })
  },
  setPlayerHidden(sessionId: string, value: boolean): void {
    update(sessionId, (cur) => {
      if (cur.playerHidden === value) return cur
      return { ...cur, playerHidden: value }
    })
  },
  delete(sessionId: string): void {
    stateMap.delete(sessionId)
    listeners.delete(sessionId)
    schedulePersist()
  },
}

export const __watchPanelStoreTestHooks = {
  reset(): void {
    stateMap.clear()
    listeners.clear()
    persistFn = postPersist
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
  },
  setPersist(fn: (key: string, value: unknown) => void): void {
    persistFn = fn
  },
}
