// resources/plugins/manifold.watch/src/webview/use-watch-panel.ts
// Ported from src/renderer/hooks/useWatchPanel.ts. The electronAPI invokes are
// replaced by the bridge; snapshot hydration and the IMPROVE_PROMPT_META
// wrapping moved host-side (init carries the snapshot; the facade prepends the
// meta prompt), so this hook only keeps the per-session UI-state plumbing.
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type {
  WatchSetupStatus,
  WatchFrameRef,
  WatchPeekResult,
  WatchPlaylistPeekResult,
  WatchPlaylistEntryInput,
  WatchPlaylistRunResult,
} from '../shared-types'
import type { WatchBridge } from './use-watch-bridge'
import { watchPanelStore } from './watch-panel-store'

interface UseWatchPanel {
  setupStatus: WatchSetupStatus | null
  refreshSetupStatus: () => Promise<void>
  installBinaries: () => Promise<{ ok: boolean; error?: string }>
  improveQuestion: (question: string) => Promise<string>
  peekUrl: (url: string) => Promise<WatchPeekResult>
  peekPlaylist: (url: string) => Promise<WatchPlaylistPeekResult>
  runPlaylist: (entries: WatchPlaylistEntryInput[]) => Promise<WatchPlaylistRunResult>
  playlistFrames: Record<number, WatchFrameRef[]>
  readFrame: (path: string) => Promise<string>
  // Persisted Watch panel UI state
  url: string
  siblingByIndex: Record<number, string>
  playlistDispatched: boolean
  openSiblingId: string | null
  focusedEntryIndex: number | null
  playerHidden: boolean
  setUrl: (url: string) => void
  setSiblingByIndex: (map: Record<number, string>) => void
  setPlaylistDispatched: (v: boolean) => void
  setOpenSiblingId: (id: string | null) => void
  setFocusedEntryIndex: (value: number | null) => void
  setPlayerHidden: (value: boolean) => void
}

export function useWatchPanel(bridge: WatchBridge): UseWatchPanel {
  const activeSessionId = bridge.sessionId

  const subscribe = useCallback(
    (listener: () => void) => watchPanelStore.subscribe(activeSessionId, listener),
    [activeSessionId],
  )
  const getSnapshot = useCallback(() => watchPanelStore.get(activeSessionId), [activeSessionId])
  const sessionState = useSyncExternalStore(subscribe, getSnapshot)

  const runPlaylist = useCallback(async (entries: WatchPlaylistEntryInput[]): Promise<WatchPlaylistRunResult> => {
    if (!activeSessionId) throw new Error('No active session')
    if (entries.length === 0) throw new Error('No entries')
    return bridge.runPlaylist(entries, sessionState.url)
  }, [bridge, activeSessionId, sessionState.url])

  const improveQuestion = useCallback(async (question: string): Promise<string> => {
    if (!activeSessionId) throw new Error('No active session')
    const trimmed = question.trim()
    if (!trimmed) throw new Error('Question is empty')
    const improved = await bridge.improvePrompt(trimmed)
    return (improved ?? '').trim() || trimmed
  }, [bridge, activeSessionId])

  // Debounce the host write so a long URL doesn't trigger one run-store
  // JSON write per keystroke. The in-memory store updates immediately so
  // the UI stays responsive. (Same 300ms as the builtin.)
  const persistUrlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (persistUrlTimerRef.current) clearTimeout(persistUrlTimerRef.current)
  }, [])
  const setUrl = useCallback((url: string) => {
    if (!activeSessionId) return
    watchPanelStore.setUrl(activeSessionId, url)
    if (persistUrlTimerRef.current) clearTimeout(persistUrlTimerRef.current)
    persistUrlTimerRef.current = setTimeout(() => {
      persistUrlTimerRef.current = null
      bridge.postUrlToHost(url)
    }, 300)
  }, [bridge, activeSessionId])
  const setSiblingByIndex = useCallback((map: Record<number, string>) => {
    if (activeSessionId) watchPanelStore.setSiblingByIndex(activeSessionId, map)
  }, [activeSessionId])
  const setPlaylistDispatched = useCallback((v: boolean) => {
    if (activeSessionId) watchPanelStore.setPlaylistDispatched(activeSessionId, v)
  }, [activeSessionId])
  const setOpenSiblingId = useCallback((id: string | null) => {
    if (activeSessionId) watchPanelStore.setOpenSiblingId(activeSessionId, id)
  }, [activeSessionId])
  const setFocusedEntryIndex = useCallback((value: number | null) => {
    if (activeSessionId) watchPanelStore.setFocusedEntryIndex(activeSessionId, value)
  }, [activeSessionId])
  const setPlayerHidden = useCallback((value: boolean) => {
    if (activeSessionId) watchPanelStore.setPlayerHidden(activeSessionId, value)
  }, [activeSessionId])

  return {
    setupStatus: bridge.setupStatus,
    refreshSetupStatus: bridge.refreshSetupStatus,
    installBinaries: bridge.installBinaries,
    improveQuestion,
    peekUrl: bridge.peekUrl,
    peekPlaylist: bridge.peekPlaylist,
    runPlaylist,
    playlistFrames: sessionState.playlistFrames,
    readFrame: bridge.readFrame,
    url: sessionState.url,
    siblingByIndex: sessionState.siblingByIndex,
    playlistDispatched: sessionState.playlistDispatched,
    openSiblingId: sessionState.openSiblingId,
    focusedEntryIndex: sessionState.focusedEntryIndex,
    playerHidden: sessionState.playerHidden,
    setUrl,
    setSiblingByIndex,
    setPlaylistDispatched,
    setOpenSiblingId,
    setFocusedEntryIndex,
    setPlayerHidden,
  }
}
