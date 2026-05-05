import React, { useEffect, useState } from 'react'
import { useDockState } from '../editor/dock-panel-types'
import { useWatchPanel } from '../../hooks/useWatchPanel'
import { watchStyles as s } from './WatchPanel.styles'

export function WatchPanel(): React.JSX.Element {
  const dock = useDockState()
  const sessionId = dock.sessionId
  const isRunning = dock.activeSessionStatus === 'running' || dock.activeSessionStatus === 'waiting'
  const { setupStatus, refreshSetupStatus, runWatch } = useWatchPanel(sessionId)
  const [url, setUrl] = useState('')
  const [question, setQuestion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { void refreshSetupStatus() }, [refreshSetupStatus])

  const canRun = !!sessionId && isRunning && url.trim().length > 0 && !busy

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
          {busy ? 'Sending…' : 'Run'}
        </button>
        {!sessionId && <span style={s.hint}>Select a project and start an agent first.</span>}
        {sessionId && !isRunning && <span style={s.hint}>Active agent is not running.</span>}
      </div>
      {error && <div style={s.error}>{error}</div>}
      {setupStatus && (
        <div style={s.status}>
          <SetupDot label="ffmpeg" ok={setupStatus.ffmpeg} />
          <SetupDot label="yt-dlp" ok={setupStatus.ytdlp} />
          <SetupDot label="claude" ok={setupStatus.claudeCli} />
          <SetupDot
            label={setupStatus.apiKeyKind ?? 'no key (captions only)'}
            ok={setupStatus.apiKeyKind !== null}
          />
        </div>
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
