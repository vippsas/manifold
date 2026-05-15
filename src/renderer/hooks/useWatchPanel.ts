import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { WatchSetupStatus, WatchFrameRef, WatchPeekResult, WatchPlaylistPeekResult, WatchPlaylistEntryInput, WatchPlaylistRunResult } from '../../shared/watch-types'
import { watchPanelStore } from './watchPanelStore'

interface UseWatchPanel {
  setupStatus: WatchSetupStatus | null
  refreshSetupStatus: () => Promise<void>
  installBinaries: () => Promise<{ installed: string[]; alreadyPresent: string[]; errors: Array<{ binary: string; message: string }> }>
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
  setUrl: (url: string) => void
  setSiblingByIndex: (map: Record<number, string>) => void
  setPlaylistDispatched: (v: boolean) => void
  setOpenSiblingId: (id: string | null) => void
  setFocusedEntryIndex: (value: number | null) => void
}

const IMPROVE_PROMPT_META = [
  'You will receive a prompt that a user wants to send to an AI agent that analyzes a video',
  '(transcript + extracted frames). Rewrite it to be clearer, more specific, and more likely to',
  'elicit a useful answer. Preserve the user\'s intent and constraints (e.g. requested length).',
  'Return ONLY the improved prompt text — no preamble, no explanation, no surrounding quotes,',
  'no markdown.',
  '',
  'Original prompt:',
].join('\n')

export function useWatchPanel(activeSessionId: string | null): UseWatchPanel {
  const [setupStatus, setSetupStatus] = useState<WatchSetupStatus | null>(null)

  useEffect(() => {
    watchPanelStore.init()
  }, [])

  const subscribe = useCallback(
    (listener: () => void) => watchPanelStore.subscribe(activeSessionId, listener),
    [activeSessionId],
  )
  const getSnapshot = useCallback(() => watchPanelStore.get(activeSessionId), [activeSessionId])
  const sessionState = useSyncExternalStore(subscribe, getSnapshot)

  const refreshSetupStatus = useCallback(async (): Promise<void> => {
    const status = (await window.electronAPI.invoke('watch:setup-status')) as WatchSetupStatus
    setSetupStatus(status)
  }, [])

  const installBinaries = useCallback(async () => {
    const result = (await window.electronAPI.invoke('watch:install-binaries')) as {
      installed: string[]
      alreadyPresent: string[]
      errors: Array<{ binary: string; message: string }>
    }
    await refreshSetupStatus()
    return result
  }, [refreshSetupStatus])

  const readFrame = useCallback(async (path: string): Promise<string> => {
    return (await window.electronAPI.invoke('watch:read-frame', path)) as string
  }, [])

  const peekUrl = useCallback(async (url: string): Promise<WatchPeekResult> => {
    return (await window.electronAPI.invoke('watch:peek', url)) as WatchPeekResult
  }, [])

  const peekPlaylist = useCallback(async (url: string): Promise<WatchPlaylistPeekResult> => {
    return (await window.electronAPI.invoke('watch:peek-playlist', url)) as WatchPlaylistPeekResult
  }, [])

  const runPlaylist = useCallback(async (entries: WatchPlaylistEntryInput[]): Promise<WatchPlaylistRunResult> => {
    if (!activeSessionId) throw new Error('No active session')
    if (entries.length === 0) throw new Error('No entries')
    return (await window.electronAPI.invoke(
      'watch:run-playlist',
      activeSessionId,
      entries,
    )) as WatchPlaylistRunResult
  }, [activeSessionId])

  const improveQuestion = useCallback(async (question: string): Promise<string> => {
    if (!activeSessionId) throw new Error('No active session')
    const trimmed = question.trim()
    if (!trimmed) throw new Error('Question is empty')
    const prompt = `${IMPROVE_PROMPT_META}\n${trimmed}`
    const improved = (await window.electronAPI.invoke(
      'git:ai-generate',
      activeSessionId,
      prompt,
    )) as string
    return (improved ?? '').trim() || trimmed
  }, [activeSessionId])

  const setUrl = useCallback((url: string) => {
    if (activeSessionId) watchPanelStore.setUrl(activeSessionId, url)
  }, [activeSessionId])
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

  return {
    setupStatus,
    refreshSetupStatus,
    installBinaries,
    improveQuestion,
    peekUrl,
    peekPlaylist,
    runPlaylist,
    playlistFrames: sessionState.playlistFrames,
    readFrame,
    url: sessionState.url,
    siblingByIndex: sessionState.siblingByIndex,
    playlistDispatched: sessionState.playlistDispatched,
    openSiblingId: sessionState.openSiblingId,
    focusedEntryIndex: sessionState.focusedEntryIndex,
    setUrl,
    setSiblingByIndex,
    setPlaylistDispatched,
    setOpenSiblingId,
    setFocusedEntryIndex,
  }
}
