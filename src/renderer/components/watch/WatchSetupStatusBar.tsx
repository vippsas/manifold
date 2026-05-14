import React from 'react'
import { watchStyles as s } from './WatchPanel.styles'
import type { WatchSetupStatus } from '../../../shared/watch-types'

interface Props {
  status: WatchSetupStatus
  installing: boolean
  onInstall: () => void
  onClearCache: () => void
}

export function WatchSetupStatusBar({ status, installing, onInstall, onClearCache }: Props): React.JSX.Element {
  const binariesMissing = !status.ffmpeg || !status.ytdlp
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
          {installing ? 'Installing…' : status.hasBrew ? 'Install via brew' : 'Install Homebrew first'}
        </button>
      )}
      <button
        type="button"
        onClick={onClearCache}
        title="Clear cached playlist metadata and force a fresh peek"
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
