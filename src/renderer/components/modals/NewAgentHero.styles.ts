import type React from 'react'

export const heroStyles: Record<string, React.CSSProperties> = {
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-lg)',
    width: 620,
    maxWidth: '92%',
  },
  // Sits under the wordmark the way Cursor's "Team · Settings" line does: says
  // which repository the cards below will act on, and nothing more.
  contextLine: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 'var(--space-sm)',
    marginTop: 'calc(-1 * var(--space-sm))',
  },
  contextProject: {
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--type-ui)',
    fontStyle: 'italic',
    fontWeight: 500,
    letterSpacing: 'var(--tracking-tight)',
    color: 'var(--accent-hi, var(--text-primary))',
  },
  contextMeta: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
  },
  // Both card rows narrow to a single column on a cramped panel without a media
  // query, which inline styles can't express.
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 'var(--space-sm)',
  },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 'var(--space-sm)',
    padding: 'var(--space-md)',
    textAlign: 'left',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-elevated)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'transform 200ms ease, box-shadow 200ms ease, background 150ms ease, color 150ms ease',
  },
  cardAction: {
    minHeight: 96,
  },
  cardOption: {
    minHeight: 72,
  },
  cardHover: {
    transform: 'translateY(-0.5px)',
    boxShadow: 'var(--shadow-popover)',
    background: 'var(--list-hover-bg)',
    color: 'var(--text-primary)',
  },
  cardOn: {
    background: 'var(--accent-subtle)',
    borderColor: 'var(--accent)',
    color: 'var(--accent)',
  },
  cardDisabled: {
    opacity: 0.45,
    cursor: 'default',
    transform: 'none',
    boxShadow: 'var(--shadow-elevated)',
  },
  cardLabel: {
    fontSize: 'var(--type-ui)',
    fontWeight: 500,
    color: 'inherit',
  },
  cardCaption: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    lineHeight: 1.4,
  },
  // Enter in the name field launches the remembered mode; this marks which card
  // that is, so the shortcut isn't invisible.
  cardHint: {
    position: 'absolute',
    top: 'var(--space-sm)',
    right: 'var(--space-sm)',
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
  },
  optionsRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 'var(--space-md)',
  },
}
