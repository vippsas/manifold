import type React from 'react'

// Iteration-list row styles + outcome/state color maps.
// (Originally lifted from the built-in loop panel, removed in #447; this is now canonical.)
export const iterationStyles: Record<string, React.CSSProperties> = {
  iterList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  iterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    padding: '6px 8px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--type-ui-small)',
  },
  iterIndex: {
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    minWidth: 32,
  },
  iterOutcome: {
    fontSize: 'var(--type-ui-caption)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '1px 6px',
    borderRadius: 'var(--radius-xs)',
  },
  iterScore: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 4,
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-xs)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-caption)',
  },
  iterScoreLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.75,
  },
  iterScoreValue: {
    color: 'var(--accent-text)',
    fontWeight: 600,
    fontSize: 'var(--type-ui-small)',
  },
  iterReason: {
    color: 'var(--text-muted)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  iterGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  iterRowClickable: {
    cursor: 'pointer',
  },
  iterToggle: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-caption)',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    flexShrink: 0,
  },
  iterJudgeOutput: {
    margin: '4px 0 0 0',
    padding: 'var(--space-sm)',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-caption)',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 320,
    overflow: 'auto',
  },
}

export const outcomeColors: Record<string, { bg: string; fg: string }> = {
  improved: { bg: 'color-mix(in srgb, var(--status-done) 18%, transparent)', fg: 'var(--status-done)' },
  regressed: { bg: 'color-mix(in srgb, var(--status-waiting) 18%, transparent)', fg: 'var(--status-waiting)' },
  failed: { bg: 'color-mix(in srgb, var(--status-error) 18%, transparent)', fg: 'var(--status-error)' },
  aborted: { bg: 'color-mix(in srgb, var(--text-muted) 18%, transparent)', fg: 'var(--text-muted)' },
}

export const stateColors: Record<string, string> = {
  idle: 'var(--text-muted)',
  running: 'var(--status-running)',
  paused: 'var(--status-waiting)',
  finished: 'var(--status-done)',
  error: 'var(--status-error)',
}
