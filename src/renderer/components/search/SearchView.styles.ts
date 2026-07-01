import type React from 'react'

export const searchViewStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    background: 'var(--bg-primary)',
  },
  header: {
    flexShrink: 0,
    padding: 'var(--space-sm)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
  },
  field: {
    // No filled box: the input's focus/resting reticle brackets (theme.css) are
    // the field's edge, like the title-bar search. A bordered wrapper would only
    // double-frame them.
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    padding: '0 var(--space-sm) 0 var(--space-xs)',
    height: 28,
    color: 'var(--text-muted)',
    transition: 'color 150ms ease',
  },
  fieldFocused: {
    color: 'var(--accent)',
  },
  iconWrap: { display: 'grid', placeItems: 'center', flexShrink: 0 },
  input: {
    flex: 1,
    minWidth: 0,
    padding: '3px 6px',
    // 1px transparent border gives the reticle brackets a border-box to paint
    // into (theme.css) without shifting layout when focus lights them up.
    border: '1px solid transparent',
    borderRadius: '4px',
    background: 'transparent',
    outline: 'none',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--type-ui-small)',
  },
  clearBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 11,
    lineHeight: 1,
    padding: '0 2px',
    flexShrink: 0,
  },
  scopes: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  scope: {
    fontSize: 'var(--type-ui-caption)',
    padding: '2px 10px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid var(--control-border)',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease',
  },
  scopeActive: {
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
    borderColor: 'var(--accent)',
  },
  results: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: 'var(--space-xs)',
  },
  groupLabel: {
    fontSize: 'var(--type-ui-micro)',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    color: 'var(--text-muted)',
    padding: '6px 10px 3px',
  },
  empty: {
    padding: '14px 10px',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-muted)',
  },
  errorText: {
    padding: '14px 10px',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--error)',
  },
  result: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease',
  },
  resultActive: {
    background: 'var(--list-hover-bg)',
    color: 'var(--text-primary)',
  },
  resultCode: {
    alignItems: 'flex-start',
  },
  resultIcon: {
    color: 'var(--text-muted)',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  },
  resultBody: {
    minWidth: 0,
    flex: 1,
  },
  resultTitle: {
    fontSize: 'var(--type-ui-small)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  resultMeta: {
    fontSize: 'var(--type-ui-micro)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  code: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    marginTop: 4,
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-caption)',
  },
  codeLine: {
    display: 'grid',
    gridTemplateColumns: '2.5em minmax(0, 1fr)',
    gap: 'var(--space-sm)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-xs)',
    color: 'var(--text-secondary)',
  },
  codeLineCurrent: {
    background: 'var(--control-bg-hover)',
    color: 'var(--text-primary)',
  },
  codeLineNumber: {
    textAlign: 'right',
    color: 'var(--text-muted)',
    userSelect: 'none',
  },
  codeLineText: {
    minWidth: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  mark: {
    color: 'var(--accent)',
    background: 'var(--accent-subtle)',
    borderRadius: 'var(--radius-xs)',
    padding: '0 1px',
  },
}
