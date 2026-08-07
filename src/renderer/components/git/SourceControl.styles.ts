import type React from 'react'

/** Source Control panel styling. Split out of the component when the staging
 *  groups landed — token-only, so all 32 themes get it for free. */
export const sourceControlStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 'var(--space-xs) 0',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-small)',
  },

  // ── repo section ──────────────────────────────────────────────
  repoHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: 'var(--space-xs) var(--space-sm)',
  },
  repoToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    // The name yields to the branch label only past half the header — the
    // branch truncates first, so "storefront" never renders as "STOREFR…".
    // The name is all that tells two sections apart, while a clipped branch is
    // still readable from the pill's tooltip and spelled out in full in the
    // commit placeholder directly below it.
    flexShrink: 0,
    maxWidth: '50%',
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: 'var(--type-ui-caption)',
  },
  chevron: {
    flexShrink: 0,
    fontSize: '9px',
    transition: 'transform 0.1s ease',
  },
  repoName: {
    color: 'var(--text-primary)',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    fontSize: 'var(--type-ui-caption)',
  },
  countBadge: {
    flexShrink: 0,
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--type-ui-micro)',
  },

  // ── icon buttons (repo header, group header, row) ─────────────
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '18px',
    height: '18px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    borderRadius: 'var(--radius-xs)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease',
  },
  iconButtonHover: {
    background: 'var(--list-hover-bg)',
    color: 'var(--text-primary)',
  },
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '1px',
    flexShrink: 0,
  },
  // Right-aligned without a flex spacer: a spacer would claim the slack first
  // and truncate the branch pill to "manifold…" even in a wide sidebar.
  actionRowTrailing: {
    marginLeft: 'auto',
  },

  // ── commit box ────────────────────────────────────────────────
  commitArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
    padding: '2px var(--space-sm) 6px 24px',
  },
  commitTextarea: {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: 'var(--space-xs) 6px',
    background: 'var(--bg-input)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-xs)',
    color: 'var(--text-primary)',
    fontSize: 'var(--type-ui-small)',
    fontFamily: 'var(--font-sans)',
    lineHeight: '16px',
    resize: 'none' as const,
    outline: 'none',
  },
  commitButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    width: '100%',
    padding: '4px 6px',
    background: 'linear-gradient(135deg, var(--btn-bg), var(--btn-hover))',
    border: 'none',
    borderRadius: 'var(--radius-xs)',
    color: 'var(--btn-text)',
    fontSize: 'var(--type-ui-caption)',
    cursor: 'pointer',
    transition: 'filter 200ms ease',
  },
  commitButtonDisabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  commitError: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--error)',
    whiteSpace: 'pre-wrap' as const,
    maxHeight: '80px',
    overflowY: 'auto' as const,
  },

  // ── change groups ─────────────────────────────────────────────
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '2px var(--space-sm) 2px 16px',
  },
  groupToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
    minWidth: 0,
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: 'var(--type-ui-small)',
  },
  groupLabel: {
    color: 'var(--text-secondary)',
  },
  groupCount: {
    flexShrink: 0,
    minWidth: '18px',
    textAlign: 'center' as const,
    background: 'var(--control-bg)',
    color: 'var(--text-muted)',
    padding: '0 5px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--type-ui-micro)',
  },

  // ── change rows ───────────────────────────────────────────────
  cleanRow: {
    padding: '2px var(--space-sm) 6px 24px',
    color: 'var(--text-muted)',
    fontSize: 'var(--type-ui-small)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px var(--space-sm) 2px 28px',
    cursor: 'pointer',
    fontSize: 'var(--type-ui-small)',
    lineHeight: '18px',
    color: 'var(--text-primary)',
    transition: 'background 150ms ease',
  },
  rowHover: {
    background: 'var(--list-hover-bg)',
  },
  rowName: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    flex: 1,
    minWidth: 0,
  },
  indicator: {
    flexShrink: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-caption)',
    fontWeight: 700,
  },
  filename: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-small)',
  },
  dir: {
    flexShrink: 1,
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-micro)',
    color: 'var(--text-muted)',
  },
}
