import type React from 'react'

export const aiAnswerPanelStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    marginBottom: '20px',
    padding: '18px',
    border: '1px solid var(--border)',
    borderRadius: '18px',
    background: 'var(--bg-elevated)',
    boxShadow: 'var(--shadow-popover)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    color: 'var(--text-primary)',
    fontSize: '15px',
    fontWeight: 700,
  },
  sourceMeta: {
    color: 'var(--text-secondary)',
    fontSize: '12px',
    lineHeight: 1.4,
  },
  meta: {
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 600,
  },
  answer: {
    whiteSpace: 'pre-wrap',
    color: 'var(--text-primary)',
    fontSize: '14px',
    lineHeight: 1.75,
  },
  loadingBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '4px 0 2px',
  },
  loadingHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minHeight: '18px',
  },
  loadingDots: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  loadingDot: {
    width: '6px',
    height: '6px',
    borderRadius: '999px',
    background: 'var(--accent)',
    animation: 'typing-dot 1.4s ease-in-out infinite',
  },
  loadingText: {
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: 1.5,
    background: 'linear-gradient(90deg, var(--text-muted) 0%, var(--accent-hover) 50%, var(--text-muted) 100%)',
    backgroundSize: '200% auto',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    animation: 'shimmer 2s linear infinite',
  },
  loadingCaption: {
    color: 'var(--text-secondary)',
    fontSize: '13px',
    lineHeight: 1.6,
  },
  subtle: {
    color: 'var(--text-secondary)',
    fontSize: '13px',
    lineHeight: 1.6,
  },
  error: {
    color: 'var(--error, #f44)',
    fontSize: '13px',
    lineHeight: 1.6,
  },
  citations: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  citationsTitle: {
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
}
