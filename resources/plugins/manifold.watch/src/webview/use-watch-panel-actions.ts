// resources/plugins/manifold.watch/src/webview/use-watch-panel-actions.ts
// Ported from src/renderer/hooks/useWatchPanelActions.ts. Only handleInstall
// changed shape: the host returns { ok, error } (errors pre-joined) instead of
// the builtin's { installed, alreadyPresent, errors[] }.
import { useCallback, useState } from 'react'
import type { WatchPlaylistEntry } from '../shared-types'
import type { useWatchPanel } from './use-watch-panel'
import { useWatchUrlPreview, clearWatchPreviewCaches } from './use-watch-url-preview'

const PLAYLIST_SOFT_CAP = 10

type WatchPanelApi = ReturnType<typeof useWatchPanel>
type WatchPreview = ReturnType<typeof useWatchUrlPreview>

interface WatchPanelActionDeps {
  preview: WatchPreview
  improveQuestion: WatchPanelApi['improveQuestion']
  runPlaylist: WatchPanelApi['runPlaylist']
  installBinaries: WatchPanelApi['installBinaries']
  siblingByIndex: Record<number, string>
  setSiblingByIndex: WatchPanelApi['setSiblingByIndex']
  setPlaylistDispatched: WatchPanelApi['setPlaylistDispatched']
  pendingEntries: { entry: WatchPlaylistEntry; index: number }[]
}

export interface WatchPanelActions {
  error: string | null
  setError: (value: string | null) => void
  busy: boolean
  installing: boolean
  improvingIndex: number | null
  handleImprove: (index: number) => Promise<void>
  handleRun: () => Promise<void>
  handleClearCache: () => void
  handleInstall: () => Promise<void>
}

/** Async actions (improve / run / install / clear-cache) for the Watch panel. */
export function useWatchPanelActions(deps: WatchPanelActionDeps): WatchPanelActions {
  const { preview, improveQuestion, runPlaylist, installBinaries, siblingByIndex, setSiblingByIndex, setPlaylistDispatched, pendingEntries } = deps
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [improvingIndex, setImprovingIndex] = useState<number | null>(null)

  const handleImprove = async (index: number): Promise<void> => {
    const current = preview.entryQuestions[index] ?? ''
    if (!current.trim()) return
    setError(null)
    setImprovingIndex(index)
    try {
      const improved = await improveQuestion(current)
      if (improved) preview.setEntryQuestion(index, improved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Improve failed')
    } finally {
      setImprovingIndex(null)
    }
  }

  const handleRun = async (): Promise<void> => {
    setError(null)
    if (pendingEntries.length === 0) return
    if (pendingEntries.length > PLAYLIST_SOFT_CAP) {
      const ok = window.confirm(
        `This will spawn ${pendingEntries.length} sibling agents. Continue?`,
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      const result = await runPlaylist(pendingEntries.map(({ entry, index }) => ({
        url: entry.url,
        question: preview.entryQuestions[index]?.trim() || undefined,
        title: entry.title,
        originalIndex: index,
      })))
      if (!result.ok) throw new Error(result.error ?? 'Run failed')
      // Merge new siblings into the existing map — previously-dispatched
      // entries keep their session IDs so navigation to them still works.
      const merged: Record<number, string> = { ...siblingByIndex }
      pendingEntries.forEach(({ index }, i) => {
        const sid = result.entryResults?.[i]?.sessionId
        if (sid) merged[index] = sid
      })
      setSiblingByIndex(merged)
      setPlaylistDispatched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const handleClearCache = useCallback((): void => {
    // Wipe the peek + user-state caches (in-memory + host-persisted), then
    // ask the preview hook to re-peek for the current URL. The sibling
    // mapping / dispatched flag in the store stay intact — only the peek
    // cache is invalidated.
    clearWatchPreviewCaches()
    preview.forceRefresh()
  }, [preview])

  const handleInstall = async (): Promise<void> => {
    setError(null)
    setInstalling(true)
    try {
      const result = await installBinaries()
      if (!result.ok) setError(result.error ?? 'Install failed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstalling(false)
    }
  }

  return { error, setError, busy, installing, improvingIndex, handleImprove, handleRun, handleClearCache, handleInstall }
}
