import type React from 'react'

export const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', padding: 16, gap: 16, fontSize: 13, color: 'var(--text-default)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: 600 },
  refreshButton: { padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-default)', cursor: 'pointer' },
  sectionTitle: { fontSize: 12, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.4 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, opacity: 0.75 },
  td: { padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' },
  emptyState: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' },
  errorBox: { padding: 12, border: '1px solid var(--border-error, #d44)', color: 'var(--text-error, #d44)', borderRadius: 4 },
  outcomeFooter: { fontSize: 12, opacity: 0.7 },
  prLink: { color: 'var(--text-link, #4af)', textDecoration: 'underline' },
  promptCell: { maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}
