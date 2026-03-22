import type React from 'react'

export const aiAnswerPanelStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
    marginBottom: 'var(--space-md)',
    padding: 'var(--space-sm)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02))',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'var(--space-sm)',
  },
  title: {
    color: 'var(--text-primary)',
    fontSize: 'var(--type-ui-small)',
    fontWeight: 600,
  },
  meta: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-micro)',
  },
  answer: {
    whiteSpace: 'pre-wrap',
    color: 'var(--text-primary)',
    fontSize: 'var(--type-ui-caption)',
    lineHeight: 1.5,
  },
  subtle: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-caption)',
    lineHeight: 1.5,
  },
  error: {
    color: 'var(--error, #f44)',
    fontSize: 'var(--type-ui-caption)',
    lineHeight: 1.5,
  },
  citations: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  citationsTitle: {
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-micro)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
}
