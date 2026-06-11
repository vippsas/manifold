// resources/plugins/manifold.watch/src/webview/components/WatchSetupStatusBar.tsx
// Ported verbatim from src/renderer/components/watch/WatchSetupStatusBar.tsx.
import React from 'react'
import { watchStyles as s } from '../styles/WatchPanel.styles'
import type { WatchSetupStatus } from '../../shared-types'

interface Props {
  status: WatchSetupStatus
  installing: boolean
  onInstall: () => void
  onClearCache: () => void
}

export function WatchSetupStatusBar({ status, installing, onInstall, onClearCache }: Props): React.JSX.Element {
  const binariesMissing = !status.ffmpeg || !status.ytdlp
  const ffmpegNeedsBrew = !status.ffmpeg && !status.hasBrew
  return (
    <div style={s.status}>
      <SetupDot label="ffmpeg" ok={status.ffmpeg} />
      <SetupDot label="yt-dlp" ok={status.ytdlp} />
      <SetupDot
        label={
          status.provider === 'none'
            ? 'no transcription (captions only)'
            : `${status.provider} ${status.hasApiKey ? 'configured' : 'key missing'}`
        }
        ok={status.provider === 'none' ? true : status.hasApiKey}
      />
      {binariesMissing && (
        <button
          type="button"
          onClick={onInstall}
          disabled={installing}
          style={s.installButton}
        >
          {installing ? 'Installing…' : ffmpegNeedsBrew ? 'Install Homebrew first' : 'Install missing tools'}
        </button>
      )}
      <button
        type="button"
        onClick={onClearCache}
        title="Clear cached video metadata and force a fresh peek"
        style={s.installButton}
      >
        Clear cache
      </button>
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
