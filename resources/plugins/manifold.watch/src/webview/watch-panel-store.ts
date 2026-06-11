// resources/plugins/manifold.watch/src/webview/watch-panel-store.ts
// Ported from src/renderer/hooks/watchPanelStore.ts. Differences from the builtin:
// - localStorage → `persist` bridge messages (same STORAGE_KEY, same payload
//   shape); hydration comes from init.persisted instead of localStorage.
// - the `watch:playlist-progress` IPC listener → applyPlaylistProgress, called
//   by the bridge when a `playlistProgress` HostMsg arrives.
import type { WatchFrameRef, WatchSessionSnapshot } from '../shared-types'
import { sameFrameMap, sameStringMap } from './watch-state-equality'
import { postPersist } from './host-post'

export interface WatchSessionState {
  /** Per-entry frame thumbnails for playlist runs, keyed by entry index. */
  playlistFrames: Record<number, WatchFrameRef[]>
  /** Persisted Watch-panel UI state so it survives webview re-inits. */
  url: string
  siblingByIndex: Record<number, string>
  playlistDispatched: boolean
  openSiblingId: string | null
  /** Index of the entry whose card is highlighted and whose video shows in
   *  the player above the list. Persisted so it survives re-mounts
   *  triggered by opening a sibling agent. */
  focusedEntryIndex: number | null
  /** Whether the user has collapsed the embedded video player. Persisted so
   *  navigating away and back doesn't re-expand it. */
  playerHidden: boolean
}

const EMPTY_STATE: WatchSessionState = Object.freeze({
  playlistFrames: {},
  url: '',
  siblingByIndex: {},
  playlistDispatched: false,
  openSiblingId: null,
  focusedEntryIndex: null,
  playerHidden: false,
}) as WatchSessionState

const stateMap = new Map<string, WatchSessionState>()
const listeners = new Map<string, Set<() => void>>()

// The persisted blob holds only the URL per session (run-state — siblings and
// frames — comes from the host snapshot on init, filtered to live sessions, so
// dead siblings from a prior app run never reappear).
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
  /** Ported from the builtin's `watch:playlist-progress` IPC handler. */
  applyPlaylistProgress(sessionId: string, entryIndex: number, kind: 'log' | 'stage' | 'frames' | 'sibling', payload: unknown): void {
    if (kind === 'frames' && Array.isArray(payload)) {
      const frames = payload as WatchFrameRef[]
      update(sessionId, (cur) => ({
        ...cur,
        playlistFrames: { ...cur.playlistFrames, [entryIndex]: frames },
      }))
    } else if (kind === 'sibling' && typeof payload === 'string') {
      const siblingSessionId = payload
      update(sessionId, (cur) => ({
        ...cur,
        siblingByIndex: { ...cur.siblingByIndex, [entryIndex]: siblingSessionId },
      }))
    }
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
        focusedEntryIndex: null,
      }
    })
  },
  setFocusedEntryIndex(sessionId: string, value: number | null): void {
    update(sessionId, (cur) => {
      if (cur.focusedEntryIndex === value) return cur
      return { ...cur, focusedEntryIndex: value }
    })
  },
  setPlayerHidden(sessionId: string, value: boolean): void {
    update(sessionId, (cur) => {
      if (cur.playerHidden === value) return cur
      return { ...cur, playerHidden: value }
    })
  },
  hydrateSession(sessionId: string, snapshot: WatchSessionSnapshot): void {
    update(sessionId, (cur) => {
      // The user may have typed a different URL while the snapshot was
      // in flight — drop the stale snapshot rather than clobber the new URL
      // (and the run-state that belongs to it).
      if (cur.url && snapshot.url && cur.url !== snapshot.url) return cur

      // Merge: live entries (sibling/frame events that arrived between mount
      // and snapshot resolution) win over the on-disk snapshot.
      const mergedSiblings = { ...snapshot.siblingByIndex, ...cur.siblingByIndex }
      const mergedFrames = { ...snapshot.playlistFrames, ...cur.playlistFrames }
      const nextUrl = cur.url || snapshot.url
      // Derive `dispatched` from the merged siblings — OR-ing the booleans
      // can leave dispatched=true with an empty siblingByIndex (the producer
      // derives the same field from siblingByIndex size, so the consumer must
      // match).
      const nextDispatched = Object.keys(mergedSiblings).length > 0
      const nextOpenSiblingId = cur.openSiblingId && Object.values(mergedSiblings).includes(cur.openSiblingId)
        ? cur.openSiblingId
        : null
      if (
        nextUrl === cur.url &&
        nextDispatched === cur.playlistDispatched &&
        nextOpenSiblingId === cur.openSiblingId &&
        sameFrameMap(mergedFrames, cur.playlistFrames) &&
        sameStringMap(mergedSiblings, cur.siblingByIndex)
      ) {
        return cur
      }
      return {
        ...cur,
        url: nextUrl,
        playlistFrames: mergedFrames,
        siblingByIndex: mergedSiblings,
        playlistDispatched: nextDispatched,
        openSiblingId: nextOpenSiblingId,
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
      let nextFocused = cur.focusedEntryIndex
      if (nextFocused !== null) {
        const url = oldEntries[nextFocused]?.url
        nextFocused = url !== undefined ? (newUrlToIdx.get(url) ?? null) : null
      }
      return { ...cur, playlistFrames: nextFrames, siblingByIndex: nextSiblings, focusedEntryIndex: nextFocused }
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
  seedFrames(sessionId: string, frames: Record<number, WatchFrameRef[]>): void {
    const cur = stateMap.get(sessionId) ?? EMPTY_STATE
    stateMap.set(sessionId, { ...cur, playlistFrames: frames })
    notify(sessionId)
  },
}
