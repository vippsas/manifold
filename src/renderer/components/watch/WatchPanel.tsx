import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useDockState } from '../editor/dock-panel-types'
import { useWatchPanel } from '../../hooks/useWatchPanel'
import { useWatchUrlPreview, clearWatchPreviewCaches } from '../../hooks/useWatchUrlPreview'
import { watchPanelStore } from '../../hooks/watchPanelStore'
import { watchStyles as s } from './WatchPanel.styles'
import { FrameLightbox } from './FrameLightbox'
import { WatchPlaylistPreview } from './WatchPlaylistPreview'
import { WatchActivePlayer } from './WatchActivePlayer'
import { WatchSetupStatusBar } from './WatchSetupStatusBar'
import { siblingPanelId } from '../../hooks/agent-siblings'

const PLAYLIST_SOFT_CAP = 10

export function WatchPanel(): React.JSX.Element {
  const dock = useDockState()
  // Key Watch panel state by the primary (worktree-stable) session, not the
  // currently-active one. Clicking a sibling agent tab changes activeSessionId
  // but should not reset the Watch panel — the primary owns this worktree's
  // Watch state. runPlaylist also uses this so the primer goes to the primary.
  const sessionId = dock.primarySessionId ?? dock.sessionId
  const isRunning = dock.activeSessionStatus === 'running' || dock.activeSessionStatus === 'waiting'
  const {
    setupStatus,
    refreshSetupStatus,
    runPlaylist,
    installBinaries,
    improveQuestion,
    peekUrl,
    peekPlaylist,
    playlistFrames,
    readFrame,
    url,
    setUrl,
    siblingByIndex,
    setSiblingByIndex,
    playlistDispatched,
    setPlaylistDispatched,
    openSiblingId,
    setOpenSiblingId,
  } = useWatchPanel(sessionId)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [improvingIndex, setImprovingIndex] = useState<number | null>(null)
  const [thumbCache, setThumbCache] = useState<Record<string, string>>({})
  const [lightbox, setLightbox] = useState<{ cardIndex: number; frameIndex: number } | null>(null)
  const [playerHidden, setPlayerHidden] = useState(false)
  // Which entry's video is shown in the player above the list. Independent
  // of `openSiblingId` so the player works before any agent is dispatched.
  const [focusedEntryIndex, setFocusedEntryIndex] = useState<number | null>(null)

  const preview = useWatchUrlPreview(url, { peekUrl, peekPlaylist })

  useEffect(() => { void refreshSetupStatus() }, [refreshSetupStatus])
  // When the playlist's contents shift (e.g. a video was removed externally
  // and Clear cache forced a re-peek), re-key the frame thumbnails and
  // sibling-agent mapping by URL. Without this, frames captured at index N
  // would render under whatever video is now at index N — a different video.
  const prevEntryUrlsRef = useRef<string[]>([])
  useEffect(() => {
    const prev = prevEntryUrlsRef.current
    const next = preview.entries.map((e) => e.url)
    prevEntryUrlsRef.current = next
    if (!sessionId || prev.length === 0) return
    const identical = prev.length === next.length && prev.every((u, i) => u === next[i])
    if (identical) return
    watchPanelStore.remapPlaylistEntries(
      sessionId,
      prev.map((url) => ({ url })),
      next.map((url) => ({ url })),
    )
  }, [preview.entries, sessionId])
  // Re-reveal the player whenever the focused entry changes, even if the
  // previous one was hidden.
  useEffect(() => { setPlayerHidden(false) }, [focusedEntryIndex])
  // Default focus to the first selected entry (or first entry overall) once
  // the playlist preview loads. Reset to null when the URL clears.
  useEffect(() => {
    if (preview.entries.length === 0) {
      if (focusedEntryIndex !== null) setFocusedEntryIndex(null)
      return
    }
    if (focusedEntryIndex !== null && focusedEntryIndex < preview.entries.length) return
    const firstSelected = preview.entries.findIndex((_, i) => preview.selectedIndices.has(i))
    setFocusedEntryIndex(firstSelected >= 0 ? firstSelected : 0)
  }, [preview.entries, preview.selectedIndices, focusedEntryIndex])

  const handleThumbLoaded = useCallback((path: string, dataUrl: string) => {
    setThumbCache((prev) => (prev[path] === dataUrl ? prev : { ...prev, [path]: dataUrl }))
  }, [])

  const selectedEntries = preview.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => preview.selectedIndices.has(index))
  // Only selected entries that don't yet have a sibling are eligible for a
  // Run — already-dispatched entries are locked to navigation mode.
  const pendingEntries = selectedEntries.filter(({ index }) => !siblingByIndex[index])
  const hasAnySibling = Object.keys(siblingByIndex).length > 0
  const ready = !preview.loading && preview.entries.length > 0
  const canRun = !!sessionId && isRunning && !busy && ready && pendingEntries.length > 0
  const canImprove = !!sessionId && isRunning && improvingIndex === null && !busy
  const runLabel = pendingEntries.length === 0
    ? (hasAnySibling ? 'All dispatched' : 'Run')
    : pendingEntries.length > 1
      ? `Run (${pendingEntries.length})`
      : 'Run'

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
    // Wipe the peek + user-state caches (in-memory + localStorage), then
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
      if (result.errors.length > 0) {
        setError(result.errors.map((e) => `${e.binary}: ${e.message}`).join('\n'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Install failed')
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div style={s.container}>
      <div>
        <div style={s.label}>Video, public playlist, or local path</div>
        <input
          style={s.input}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtu.be/… , a public playlist URL, or /path/to/recording.mp4"
          autoFocus
        />
        <div style={s.inputHint}>Playlists must be public — private and unlisted are not supported.</div>
      </div>
      {(() => {
        const activeEntry = focusedEntryIndex !== null
          ? preview.entries[focusedEntryIndex] ?? null
          : null
        if (!activeEntry) return null
        if (playerHidden) {
          return (
            <button
              type="button"
              onClick={() => setPlayerHidden(false)}
              style={s.showVideoButton}
            >
              ▶ Show video player
            </button>
          )
        }
        return <WatchActivePlayer entry={activeEntry} onHide={() => setPlayerHidden(true)} />
      })()}
      <WatchPlaylistPreview
        loading={preview.loading}
        playlistTitle={preview.playlistTitle ?? undefined}
        uploader={preview.uploader ?? undefined}
        entries={preview.entries}
        questions={preview.entryQuestions}
        selectedIndices={preview.selectedIndices}
        improvingIndex={improvingIndex}
        onQuestionChange={preview.setEntryQuestion}
        onImprove={(i) => void handleImprove(i)}
        onToggleSelected={preview.toggleEntrySelected}
        onToggleAll={preview.setAllEntriesSelected}
        canImprove={canImprove}
        siblingByIndex={siblingByIndex}
        focusedIndex={focusedEntryIndex}
        onFocus={setFocusedEntryIndex}
        framesByIndex={playlistFrames}
        readFrame={readFrame}
        onThumbLoaded={handleThumbLoaded}
        onOpenSibling={(index) => {
          const sid = siblingByIndex[index]
          if (!sid) return
          // Open the new sibling in the same dock group as the previous one
          // so any custom split/pane layout the user set up is preserved.
          // Order: add new first (joins the group), then remove old — keeps
          // the group alive across the swap.
          const refPanelId = openSiblingId && openSiblingId !== sid
            ? siblingPanelId(openSiblingId)
            : undefined
          dock.onOpenSibling(sid, preview.entries[index]?.title, refPanelId)
          if (openSiblingId && openSiblingId !== sid) {
            dock.onCloseSiblingPanel(openSiblingId)
          }
          setOpenSiblingId(sid)
          setFocusedEntryIndex(index)
        }}
        onSelectFrame={(cardIndex, frameIndex) => setLightbox({ cardIndex, frameIndex })}
      />
      <div style={s.row}>
        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun}
          aria-busy={busy}
          style={{
            ...s.runButton,
            ...(busy ? s.runButtonBusy : {}),
            ...(canRun || busy ? {} : s.runButtonDisabled),
          }}
        >
          {busy ? (
            <>
              <span style={s.runSpinner} aria-hidden />
              <span>Working…</span>
            </>
          ) : (
            runLabel
          )}
        </button>
        {!sessionId && <span style={s.hint}>Select a project and start an agent first.</span>}
        {sessionId && !isRunning && <span style={s.hint}>Active agent is not running.</span>}
      </div>
      {error && <div style={s.error}>{error}</div>}
      {!error && preview.error && <div style={s.error}>{preview.error}</div>}

      {setupStatus && (
        <WatchSetupStatusBar
          status={setupStatus}
          installing={installing}
          onInstall={() => void handleInstall()}
          onClearCache={handleClearCache}
        />
      )}

      {lightbox && playlistFrames[lightbox.cardIndex]?.[lightbox.frameIndex] && (
        <FrameLightbox
          frames={playlistFrames[lightbox.cardIndex]}
          currentIndex={lightbox.frameIndex}
          thumbDataUrl={thumbCache[playlistFrames[lightbox.cardIndex][lightbox.frameIndex].path] ?? ''}
          readFrame={readFrame}
          onIndexChange={(i) => setLightbox((cur) => cur ? { ...cur, frameIndex: i } : null)}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
