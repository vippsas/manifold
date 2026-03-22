import type React from 'react'

export const searchPanelChromeStyles: Record<string, React.CSSProperties> = {
  searchHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '18px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01))',
  },
  searchHeaderTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  headerActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  summaryBar: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'flex-start',
    flexWrap: 'wrap' as const,
    padding: '10px 18px',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(255, 255, 255, 0.02)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    lineHeight: 1.5,
    flexShrink: 0,
  },
  summaryText: {
    color: 'var(--text-primary)',
    fontWeight: 700,
    fontSize: '13px',
  },
  summaryHint: {
    color: 'var(--text-secondary)',
    maxWidth: '520px',
  },
  emptyStatePanel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    padding: '20px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02))',
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.16)',
  },
  emptyStateTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  emptyStateBody: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
  },
}
