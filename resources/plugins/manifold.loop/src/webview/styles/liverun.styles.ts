import type React from 'react'

// Live-run card + score-trend strip styles. Kept in its own module so panel.styles.ts
// stays focused and under the 300-LOC ceiling.
export const liverunStyles: Record<string, React.CSSProperties> = {
  liveCard: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
  },
  liveTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-primary)',
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: 'var(--status-running)',
    animation: 'dot-blink 1.4s ease-in-out infinite',
    flexShrink: 0,
  },
  liveState: { fontWeight: 600 },
  liveTimer: {
    marginLeft: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
  },
  liveScores: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
  },
  liveTrack: {
    position: 'relative',
    height: 3,
    background: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-xs)',
    overflow: 'hidden',
  },
  liveTrackFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '25%',
    background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
    animation: 'loop-progress-sweep 1.8s ease-in-out infinite',
  },
  liveMeta: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  trendCard: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-sm) var(--space-md)',
  },
  trendHead: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-sm)',
  },
  trendBars: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 6,
    height: 60,
  },
  trendBar: {
    flex: 1,
    minWidth: 6,
    background: 'var(--status-done)',
    borderRadius: '3px 3px 0 0',
    opacity: 0.55,
  },
  trendBarBest: {
    background: 'var(--accent)',
    opacity: 1,
  },
  trendBarRegressed: {
    background: 'var(--status-waiting)',
  },
}
