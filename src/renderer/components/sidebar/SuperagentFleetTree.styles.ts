import type React from 'react'
import type { AgentSession } from '../../../shared/types'

export const EMPTY_SET: Set<string> = new Set()

const statusColor = (status: AgentSession['status']): string => {
  switch (status) {
    case 'running': return 'var(--status-running, #22c55e)'
    case 'waiting': return 'var(--status-waiting, #eab308)'
    case 'error': return 'var(--error, #ef4444)'
    case 'done': return 'var(--text-muted)'
    default: return 'var(--text-muted)'
  }
}

export const statusDotStyle = (status: AgentSession['status']): React.CSSProperties => ({
  width: 8, height: 8, borderRadius: '50%', background: statusColor(status), flexShrink: 0,
})

export const styles = {
  root: { display: 'flex', flexDirection: 'column' as const, height: '100%', overflow: 'hidden' },
  superagentRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    width: '100%',
    margin: 0,
    padding: '0 8px 0 6px',
    minHeight: 28,
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left' as const,
    color: 'inherit',
  },
  superagentBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    borderRadius: '999px',
    background: 'color-mix(in srgb, var(--warning), transparent 78%)',
    border: '1px solid color-mix(in srgb, var(--warning), transparent 52%)',
    color: 'var(--warning-text, var(--warning))',
    fontSize: 10,
    fontWeight: 700,
    flexShrink: 0,
  },
  superagentText: {
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
    gap: 1,
  },
  superagentName: {
    fontSize: 12,
    color: 'var(--text-primary)',
    fontWeight: 600,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  superagentMeta: { fontSize: 10, color: 'var(--text-muted)' },
  empty: { fontSize: 12, color: 'var(--text-muted)', padding: 8 },
  agentsGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    padding: '6px 8px 8px 8px',
    borderBottom: '1px solid var(--border)',
  },
  agentsHeaderRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 0' },
  agentsHeader: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5, padding: '2px 0' },
  collapseButton: {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: '0 2px',
    fontSize: 11,
    fontWeight: 500,
  },
  sessionRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 6px', cursor: 'pointer', borderRadius: 4,
    fontSize: 12,
  },
  sessionText: {
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
    gap: 1,
    flex: 1,
  },
  sessionName: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  sessionMeta: { fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  emptyAgents: { fontSize: 11, color: 'var(--text-muted)', padding: '2px 0 4px 0' },
  treeWrapper: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' as const },
}
