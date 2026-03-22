import type React from 'react'

export const searchPanelChromeStyles: Record<string, React.CSSProperties> = {
  searchHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-sm)',
    padding: 'var(--space-sm)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  headerActions: {
    display: 'flex',
    gap: 'var(--space-xs)',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  summaryBar: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 'var(--space-sm)',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    padding: '6px var(--space-sm)',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-micro)',
    flexShrink: 0,
  },
  summaryText: {
    color: 'var(--text-primary)',
    fontWeight: 600,
  },
  summaryHint: {
    color: 'var(--text-muted)',
  },
  emptyStatePanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    padding: '16px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
  },
  emptyStateTitle: {
    fontSize: 'var(--type-ui-small)',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  emptyStateBody: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    lineHeight: '1.5',
  },
}
