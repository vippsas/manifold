import React from 'react'

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

export function DurationBadge({ durationMs }: { durationMs: number }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
      <span style={{
        fontSize: 12,
        color: 'var(--text-muted)',
        padding: '4px 12px',
        borderRadius: 12,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}>
        Completed in {formatDuration(durationMs)}
      </span>
    </div>
  )
}
