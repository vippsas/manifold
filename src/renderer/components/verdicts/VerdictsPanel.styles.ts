import type React from 'react'

export const verdictsPanelStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-xs) var(--space-sm)',
    background: 'var(--bg-chrome)',
    borderBottom: '1px solid var(--border)',
    minHeight: 32,
  },
  title: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  refreshButton: {
    background: 'var(--control-bg)',
    border: '1px solid var(--control-border)',
    color: 'var(--text-secondary)',
    height: 'var(--control-height)',
    borderRadius: 'var(--radius-sm)',
    padding: '0 var(--space-sm)',
    fontSize: 'var(--type-ui-caption)',
    fontFamily: 'var(--font-sans)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    cursor: 'pointer',
    transition: 'background 200ms ease, color 200ms ease',
  },
  refreshButtonBusy: {
    cursor: 'progress',
    color: 'var(--accent)',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 'var(--space-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-md)',
  },
  errorBox: {
    background: 'color-mix(in srgb, var(--status-error) 12%, transparent)',
    border: '1px solid color-mix(in srgb, var(--status-error) 30%, transparent)',
    color: 'var(--status-error)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-sm) var(--space-md)',
    fontSize: 'var(--type-ui-small)',
    lineHeight: 1.5,
  },

  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-small)',
    gap: 'var(--space-sm)',
    padding: 'var(--space-lg)',
    textAlign: 'center',
  },
  emptyGlyph: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '1px dashed var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
    fontSize: 18,
  },

  // KPI hero strip
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 'var(--space-sm)',
  },
  kpiCard: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-subtle)',
    padding: 'var(--space-sm) var(--space-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  kpiLabel: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 'var(--type-title)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    lineHeight: 1.1,
  },
  kpiValueGood: {
    color: 'var(--status-done)',
  },
  kpiValueWarn: {
    color: 'var(--status-error)',
  },
  kpiSub: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },

  // Section label
  sectionLabel: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingLeft: 2,
  },

  // Runtime cards grid
  runtimeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 'var(--space-sm)',
  },
  runtimeCard: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-subtle)',
    padding: 'var(--space-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
  },
  runtimeHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  runtimeName: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
  },
  runtimeTotal: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },
  runtimePrimaryMetric: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--space-xs)',
  },
  runtimePrimaryValue: {
    fontSize: 'var(--type-display)',
    color: 'var(--status-done)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    lineHeight: 1,
  },
  runtimePrimaryLabel: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  outcomeBar: {
    display: 'flex',
    height: 6,
    borderRadius: 'var(--radius-pill)',
    overflow: 'hidden',
    background: 'var(--bg-secondary)',
  },
  runtimeFootnote: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },

  // Recent sessions list
  recentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
  },
  recentRow: {
    display: 'grid',
    gridTemplateColumns: '4px 1fr auto',
    gap: 'var(--space-sm)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-sm) var(--space-md)',
    alignItems: 'center',
  },
  recentAccent: {
    alignSelf: 'stretch',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--text-muted)',
  },
  recentMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  recentTopLine: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 'var(--space-sm)',
  },
  recentRuntime: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-mono)',
  },
  recentTime: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
  },
  recentPrompt: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.4,
  },
  recentRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
  },
  outcomeChip: {
    fontSize: 'var(--type-ui-caption)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'var(--font-mono)',
    padding: '1px 8px',
    borderRadius: 'var(--radius-xs)',
  },
  prLink: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--accent)',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textDecoration: 'none',
    padding: '1px 8px',
    border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
    borderRadius: 'var(--radius-xs)',
  },

  // Footer outcome distribution
  outcomeFooter: {
    display: 'flex',
    gap: 'var(--space-md)',
    paddingTop: 'var(--space-sm)',
    borderTop: '1px solid var(--divider)',
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    flexWrap: 'wrap',
  },
  outcomeFooterItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-xs)',
  },
  outcomeFooterDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
}

export const outcomeColors: Record<string, string> = {
  merged: 'var(--status-done)',
  pr_created: 'var(--accent)',
  committed_only: 'var(--status-waiting)',
  discarded: 'var(--status-error)',
  unknown: 'var(--text-muted)',
}

export const outcomeLabels: Record<string, string> = {
  merged: 'merged',
  pr_created: 'PR',
  committed_only: 'committed',
  discarded: 'discarded',
  unknown: 'unknown',
}

export function outcomeChipStyle(outcome: string): React.CSSProperties {
  const color = outcomeColors[outcome] ?? 'var(--text-muted)'
  return {
    background: `color-mix(in srgb, ${color} 18%, transparent)`,
    color,
  }
}
