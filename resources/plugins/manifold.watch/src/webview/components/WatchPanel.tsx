// resources/plugins/manifold.watch/src/webview/components/WatchPanel.tsx
// Single-video Watch panel: URL → preview card with an editable agent prompt →
// Run pipes the video through the host pipeline and types /watch:watch into
// the user's own agent. Run state is host-owned (per-session store hydrated by
// `init`), so it survives the panel remounts agent switches trigger.
import React, { useCallback, useEffect, useState } from 'react'
import { useWatchBridge } from '../use-watch-bridge'
import { useWatchPanel } from '../use-watch-panel'
import { useWatchUrlPreview } from '../use-watch-url-preview'
import { useWatchPanelActions } from '../use-watch-panel-actions'
import { useContainerWidth } from '../use-container-width'
import { watchStyles as s } from '../styles/WatchPanel.styles'
import { FrameLightbox } from './FrameLightbox'
import { WatchVideoCard } from './WatchVideoCard'
import { WatchHeader } from './WatchHeader'
import { WatchPlayerSlot } from './WatchPlayerSlot'
import { WatchSetupStatusBar } from './WatchSetupStatusBar'

// Below this width the panel stays in a stacked single-column layout. Above
// it, the hero/URL bar and the video player split side-by-side so horizontal
// real estate is used instead of pushing the card offscreen.
const WIDE_LAYOUT_THRESHOLD_PX = 760

const STAGE_LABELS: Record<string, string> = {
  download: 'Downloading…',
  frames: 'Extracting frames…',
  transcribe: 'Transcribing…',
  report: 'Writing report…',
}

export function WatchPanel(): React.JSX.Element {
  const bridge = useWatchBridge()
  const sessionId = bridge.sessionId
  const {
    setupStatus,
    refreshSetupStatus,
    installBinaries,
    improveQuestion,
    peekUrl,
    readFrame,
    run,
    stop,
    url,
    status,
    stage,
    frames,
    runError,
    playerHidden,
    setUrl,
    setPlayerHidden,
  } = useWatchPanel(bridge)
  const [thumbCache, setThumbCache] = useState<Record<string, string>>({})
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const preview = useWatchUrlPreview(url, { peekUrl })

  useEffect(() => { void refreshSetupStatus() }, [refreshSetupStatus])

  const handleThumbLoaded = useCallback((path: string, dataUrl: string) => {
    setThumbCache((prev) => (prev[path] === dataUrl ? prev : { ...prev, [path]: dataUrl }))
  }, [])

  const {
    error, installing, improving,
    handleImprove, handleClearCache, handleInstall,
  } = useWatchPanelActions({ preview, improveQuestion, installBinaries })

  const busy = status === 'running'
  const canRun = !!sessionId && !busy && !preview.loading && preview.video !== null
  const canImprove = !!sessionId && !improving && !busy

  const handleRun = (): void => {
    if (!preview.video) return
    run(preview.video.url, preview.question)
  }

  const { ref: containerRef, width: containerWidth } = useContainerWidth()
  const playerNode = (
    <WatchPlayerSlot
      entry={preview.video}
      hidden={playerHidden}
      onHide={() => setPlayerHidden(true)}
      onShow={() => setPlayerHidden(false)}
    />
  )
  const header = (
    <WatchHeader
      url={url}
      onUrlChange={setUrl}
      showExamples={!url && !preview.video}
    />
  )
  // Side-by-side layout: only when the panel is wide enough AND there's a
  // player to put next to the URL bar. Otherwise the right column would be
  // empty and waste space.
  const wide = containerWidth >= WIDE_LAYOUT_THRESHOLD_PX && preview.video !== null

  return (
    <div ref={containerRef} style={s.container}>
      {wide ? (
        <div style={s.splitRow}>
          <div style={s.splitLeft}>{header}</div>
          <div style={s.splitRight}>{playerNode}</div>
        </div>
      ) : (
        <>
          {header}
          {playerNode}
        </>
      )}
      <WatchVideoCard
        loading={preview.loading}
        video={preview.video}
        question={preview.question}
        onQuestionChange={preview.setQuestion}
        improving={improving}
        canImprove={canImprove}
        onImprove={() => void handleImprove()}
        frames={frames}
        readFrame={readFrame}
        onThumbLoaded={handleThumbLoaded}
        onSelectFrame={setLightboxIndex}
      />
      <div style={s.runRow}>
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
              <span>{(stage && STAGE_LABELS[stage]) ?? 'Working…'}</span>
            </>
          ) : (
            status === 'sent' ? 'Run again' : 'Run'
          )}
        </button>
        {busy && (
          <button type="button" onClick={stop} style={s.stopButton}>
            Stop
          </button>
        )}
        {status === 'sent' && <span style={s.hint}>Sent to your agent — ask it about the video.</span>}
        {!sessionId && <span style={s.hint}>Select a project and start an agent first.</span>}
      </div>
      {runError && <div style={s.error}>{runError}</div>}
      {!runError && error && <div style={s.error}>{error}</div>}
      {!runError && !error && preview.error && <div style={s.error}>{preview.error}</div>}

      {setupStatus && (
        <WatchSetupStatusBar
          status={setupStatus}
          installing={installing}
          onInstall={() => void handleInstall()}
          onClearCache={handleClearCache}
        />
      )}

      {lightboxIndex !== null && frames[lightboxIndex] && (
        <FrameLightbox
          frames={frames}
          currentIndex={lightboxIndex}
          thumbDataUrl={thumbCache[frames[lightboxIndex].path] ?? ''}
          readFrame={readFrame}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
