// resources/plugins/manifold.watch/src/webview/use-watch-panel.ts
// Per-session UI-state plumbing for the Watch panel: exposes the active
// session's store slice and the actions that mutate it. Run state itself is
// host-owned; `run` only posts the request and flips the optimistic flag —
// progress and the result come back through the bridge as store updates.
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { WatchFrameRef, WatchPeekResult, WatchSetupStatus } from '../shared-types'
import type { WatchBridge } from './use-watch-bridge'
import { watchPanelStore, type WatchRunUiStatus } from './watch-panel-store'

interface UseWatchPanel {
  setupStatus: WatchSetupStatus | null
  refreshSetupStatus: () => Promise<void>
  installBinaries: () => Promise<{ ok: boolean; error?: string }>
  improveQuestion: (question: string) => Promise<string>
  peekUrl: (url: string) => Promise<WatchPeekResult>
  readFrame: (path: string) => Promise<string>
  run: (videoUrl: string, question: string) => void
  stop: () => void
  // Per-session Watch panel state
  url: string
  status: WatchRunUiStatus
  stage: string | null
  frames: WatchFrameRef[]
  runError: string | null
  playerHidden: boolean
  setUrl: (url: string) => void
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

  const run = useCallback((videoUrl: string, question: string): void => {
    if (!activeSessionId) return
    watchPanelStore.setRunning(activeSessionId)
    // The run is recorded under the typed panel URL (not the normalized video
    // URL) so the host snapshot re-attaches to this session after remounts.
    bridge.run(videoUrl, question, sessionState.url)
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
  const setPlayerHidden = useCallback((value: boolean) => {
    if (activeSessionId) watchPanelStore.setPlayerHidden(activeSessionId, value)
  }, [activeSessionId])

  return {
    setupStatus: bridge.setupStatus,
    refreshSetupStatus: bridge.refreshSetupStatus,
    installBinaries: bridge.installBinaries,
    improveQuestion,
    peekUrl: bridge.peekUrl,
    readFrame: bridge.readFrame,
    run,
    stop: bridge.stop,
    url: sessionState.url,
    status: sessionState.status,
    stage: sessionState.stage,
    frames: sessionState.frames,
    runError: sessionState.error,
    playerHidden: sessionState.playerHidden,
    setUrl,
    setPlayerHidden,
  }
}
