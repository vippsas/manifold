import type { WatchFrameRef } from '../../shared/watch-types'

export interface WatchSessionState {
  /** Per-entry frame thumbnails for playlist runs, keyed by entry index. */
  playlistFrames: Record<number, WatchFrameRef[]>
  /** Persisted Watch-panel UI state so it survives dockview re-mounts. */
  url: string
  siblingByIndex: Record<number, string>
  playlistDispatched: boolean
  openSiblingId: string | null
}

const EMPTY_STATE: WatchSessionState = Object.freeze({
  playlistFrames: {},
  url: '',
  siblingByIndex: {},
  playlistDispatched: false,
  openSiblingId: null,
}) as WatchSessionState

const stateMap = new Map<string, WatchSessionState>()
const listeners = new Map<string, Set<() => void>>()

let ipcInitialized = false

// Persisted slice of WatchSessionState — only user-intent fields (URL).
// Run-state (siblings/frames/dispatched flag) is intentionally NOT persisted
// because sibling agent sessions don't survive app restart.
interface PersistedSessionState {
  url: string
}
const STORAGE_KEY = 'manifold.watch.session-state'
let persistTimer: ReturnType<typeof setTimeout> | null = null

function readPersisted(): Record<string, PersistedSessionState> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, PersistedSessionState>
  } catch { return {} }
}

function hydrate(): void {
  const persisted = readPersisted()
  for (const [sessionId, value] of Object.entries(persisted)) {
    if (value && typeof value.url === 'string' && value.url) {
      stateMap.set(sessionId, { ...EMPTY_STATE, url: value.url })
    }
  }
}

function schedulePersist(): void {
  if (typeof localStorage === 'undefined') return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      const out: Record<string, PersistedSessionState> = {}
      for (const [sid, state] of stateMap.entries()) {
        if (state.url) out[sid] = { url: state.url }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
    } catch { /* quota or serialization failure — best effort */ }
  }, 500)
}

interface PlaylistProgressEvent {
  sessionId?: string
  entryIndex?: number
  kind?: 'log' | 'stage' | 'frames'
  payload?: unknown
}

function notify(sessionId: string): void {
  const set = listeners.get(sessionId)
  if (!set) return
  for (const fn of set) fn()
}

function update(sessionId: string, updater: (cur: WatchSessionState) => WatchSessionState): void {
  const cur = stateMap.get(sessionId) ?? EMPTY_STATE
  const next = updater(cur)
  stateMap.set(sessionId, next)
  notify(sessionId)
  if (next.url !== cur.url) schedulePersist()
}

function ensureIpc(): void {
  if (ipcInitialized) return
  ipcInitialized = true
  hydrate()
  window.electronAPI.on('watch:playlist-progress', (event: unknown) => {
    const ev = event as PlaylistProgressEvent
    if (!ev.sessionId || typeof ev.entryIndex !== 'number') return
    if (ev.kind === 'frames' && Array.isArray(ev.payload)) {
      const frames = ev.payload as WatchFrameRef[]
      const entryIndex = ev.entryIndex
      update(ev.sessionId, (cur) => ({
        ...cur,
        playlistFrames: { ...cur.playlistFrames, [entryIndex]: frames },
      }))
    }
  })
}

export const watchPanelStore = {
  init(): void {
    ensureIpc()
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
      return {
        ...cur,
        url,
        playlistFrames: {},
        siblingByIndex: {},
        playlistDispatched: false,
        openSiblingId: null,
      }
    })
  },
  setSiblingByIndex(sessionId: string, map: Record<number, string>): void {
    update(sessionId, (cur) => ({ ...cur, siblingByIndex: map }))
  },
  setPlaylistDispatched(sessionId: string, value: boolean): void {
    update(sessionId, (cur) => ({ ...cur, playlistDispatched: value }))
  },
  setOpenSiblingId(sessionId: string, value: string | null): void {
    update(sessionId, (cur) => ({ ...cur, openSiblingId: value }))
  },
  /**
   * Re-key `playlistFrames` and `siblingByIndex` by entry URL when the
   * playlist contents change (e.g. a video was removed and the user clicked
   * Clear cache). Without this, frames captured at index N would render under
   * whatever video is now at index N — a different video.
   */
  remapPlaylistEntries(
    sessionId: string,
    oldEntries: { url: string }[],
    newEntries: { url: string }[],
  ): void {
    const sameLength = oldEntries.length === newEntries.length
    const identical = sameLength && oldEntries.every((e, i) => e.url === newEntries[i].url)
    if (identical) return
    const newUrlToIdx = new Map(newEntries.map((e, i) => [e.url, i]))
    update(sessionId, (cur) => {
      const nextFrames: WatchSessionState['playlistFrames'] = {}
      for (const [oldIdxStr, fr] of Object.entries(cur.playlistFrames)) {
        const url = oldEntries[Number(oldIdxStr)]?.url
        if (url === undefined) continue
        const newIdx = newUrlToIdx.get(url)
        if (newIdx !== undefined) nextFrames[newIdx] = fr
      }
      const nextSiblings: WatchSessionState['siblingByIndex'] = {}
      for (const [oldIdxStr, sid] of Object.entries(cur.siblingByIndex)) {
        const url = oldEntries[Number(oldIdxStr)]?.url
        if (url === undefined) continue
        const newIdx = newUrlToIdx.get(url)
        if (newIdx !== undefined) nextSiblings[newIdx] = sid
      }
      return { ...cur, playlistFrames: nextFrames, siblingByIndex: nextSiblings }
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
    ipcInitialized = false
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY) } catch { /* */ }
  },
  seedFrames(sessionId: string, frames: Record<number, WatchFrameRef[]>): void {
    const cur = stateMap.get(sessionId) ?? EMPTY_STATE
    stateMap.set(sessionId, { ...cur, playlistFrames: frames })
    notify(sessionId)
  },
}
