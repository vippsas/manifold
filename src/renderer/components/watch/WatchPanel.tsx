import React, { useEffect, useState } from 'react'
import { useDockState } from '../editor/dock-panel-types'
import { useWatchPanel } from '../../hooks/useWatchPanel'
import { watchStyles as s } from './WatchPanel.styles'
import { FrameThumbnailStrip } from './FrameThumbnailStrip'
import { FrameLightbox } from './FrameLightbox'
import type { WatchFrameRef } from '../../../shared/watch-types'

export function WatchPanel(): React.JSX.Element {
  const dock = useDockState()
  const sessionId = dock.sessionId
  const isRunning = dock.activeSessionStatus === 'running' || dock.activeSessionStatus === 'waiting'
  const {
    setupStatus,
    refreshSetupStatus,
    runWatch,
    installBinaries,
    progressLog,
    currentStage,
    frames,
    readFrame,
  } = useWatchPanel(sessionId)
  const [url, setUrl] = useState('')
  const [question, setQuestion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [lightbox, setLightbox] = useState<{ frame: WatchFrameRef; dataUrl: string } | null>(null)

  useEffect(() => { void refreshSetupStatus() }, [refreshSetupStatus])

  const canRun = !!sessionId && isRunning && url.trim().length > 0 && !busy
  const binariesMissing = setupStatus !== null && (!setupStatus.ffmpeg || !setupStatus.ytdlp)

  const handleRun = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      await runWatch(url, question.trim() || undefined)
      setUrl('')
      setQuestion('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

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

  const stageLabel = currentStage
    ? ({
        download: 'Downloading…',
        frames: 'Extracting frames…',
        transcribe: 'Transcribing…',
        report: 'Finalizing…',
      } as Record<string, string>)[currentStage] ?? currentStage
    : null

  return (
    <div style={s.container}>
      <div>
        <div style={s.label}>Video URL or local path</div>
        <input
          style={s.input}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtu.be/… or /path/to/recording.mp4"
          autoFocus
        />
      </div>
      <div>
        <div style={s.label}>Question (optional)</div>
        <textarea
          style={s.textarea}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What's the hook in the first 3 seconds?"
          rows={3}
        />
      </div>
      <div style={s.row}>
        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun}
          style={{ ...s.runButton, ...(canRun ? {} : s.runButtonDisabled) }}
        >
          {busy ? (stageLabel ?? 'Working…') : 'Run'}
        </button>
        {!sessionId && <span style={s.hint}>Select a project and start an agent first.</span>}
        {sessionId && !isRunning && <span style={s.hint}>Active agent is not running.</span>}
        {stageLabel && <span style={s.stage}>{stageLabel}</span>}
      </div>
      {error && <div style={s.error}>{error}</div>}

      {progressLog.length > 0 && (
        <div style={s.log}>{progressLog.join('\n')}</div>
      )}

      <FrameThumbnailStrip
        frames={frames}
        readFrame={readFrame}
        onSelect={(frame, dataUrl) => setLightbox({ frame, dataUrl })}
      />

      {setupStatus && (
        <div style={s.status}>
          <SetupDot label="ffmpeg" ok={setupStatus.ffmpeg} />
          <SetupDot label="yt-dlp" ok={setupStatus.ytdlp} />
          <SetupDot
            label={
              setupStatus.provider === 'none'
                ? 'no transcription (captions only)'
                : `${setupStatus.provider} ${setupStatus.hasApiKey ? 'configured' : 'key missing'}`
            }
            ok={setupStatus.provider === 'none' ? true : setupStatus.hasApiKey}
          />
          {binariesMissing && (
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              style={s.installButton}
            >
              {installing ? 'Installing…' : setupStatus.hasBrew ? 'Install via brew' : 'Install Homebrew first'}
            </button>
          )}
        </div>
      )}

      {lightbox && (
        <FrameLightbox
          dataUrl={lightbox.dataUrl}
          timestampSeconds={lightbox.frame.timestampSeconds}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}

function SetupDot({ label, ok }: { label: string; ok: boolean }): React.JSX.Element {
  return (
    <span>
      <span style={{ ...s.dot, ...(ok ? s.dotOk : s.dotMissing) }} />
      {label}
    </span>
  )
}
