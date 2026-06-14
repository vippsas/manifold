/// <reference lib="dom" />
import React, { useEffect, useMemo, useState } from 'react'
import type { WorktreeOverviewEntry } from 'manifold'

interface ThemeMsg { type: '__manifold_theme'; vars: Record<string, string> }
type Incoming = { type: 'init'; entries: WorktreeOverviewEntry[]; error?: string | null } | ThemeMsg

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--success, #3fb950)',
  idle: 'var(--text-muted, #8b949e)',
  stale: 'var(--error, #f85149)',
}

function repoGroups(entries: WorktreeOverviewEntry[]): Array<{ repo: string; rows: WorktreeOverviewEntry[] }> {
  const map = new Map<string, WorktreeOverviewEntry[]>()
  for (const e of entries) {
    const arr = map.get(e.projectName) ?? []
    arr.push(e)
    map.set(e.projectName, arr)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([repo, rows]) => ({ repo, rows }))
}

export function WorktreesPanel(): React.JSX.Element {
  const [entries, setEntries] = useState<WorktreeOverviewEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onMsg = (e: MessageEvent): void => {
      const m = e.data as Incoming | null
      if (!m || typeof m !== 'object') return
      if (m.type === '__manifold_theme') {
        for (const [k, v] of Object.entries(m.vars)) document.documentElement.style.setProperty(k, v)
        return
      }
      if (m.type === 'init') { setEntries(m.entries); setError(m.error ?? null) }
    }
    window.addEventListener('message', onMsg)
    parent.postMessage({ type: 'ready' }, '*')
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const groups = useMemo(() => repoGroups(entries ?? []), [entries])
  const total = entries?.length ?? 0

  if (entries === null) return <div style={{ padding: 16, opacity: 0.6 }}>Loading worktrees…</div>
  if (error) return <div style={{ padding: 16, color: 'var(--error,#f85149)' }}>Failed to load worktrees: {error}</div>

  const cols = '70px 1fr 90px 60px 90px 36px'
  return (
    <div data-testid="worktrees-overview" style={{ padding: '12px 14px', fontSize: 13, lineHeight: 1.5, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>
        Worktrees <span style={{ opacity: 0.6, fontWeight: 400 }}>· {total} across {groups.length} repos</span>
      </div>
      {total === 0 && <div style={{ opacity: 0.6 }}>No managed worktrees.</div>}
      {groups.map((g) => (
        <div key={g.repo} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, borderBottom: '1px solid var(--border, rgba(128,128,128,.3))', padding: '4px 2px', display: 'flex', justifyContent: 'space-between' }}>
            <span>{g.repo}</span><span style={{ opacity: 0.55, fontWeight: 400 }}>{g.rows.length}</span>
          </div>
          {g.rows.map((r) => (
            <div key={r.worktreePath} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '4px 2px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
              <span style={{ color: STATUS_COLOR[r.status] }}>● {r.status}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.branch}>{r.branch}</span>
              <span>{r.status === 'stale' ? '—' : `+${r.ahead} / −${r.behind}`}</span>
              <span style={{ color: r.dirty ? 'var(--warning,#d29922)' : undefined, opacity: r.dirty ? 1 : 0.4 }}>{r.status === 'stale' ? '' : r.dirty ? 'dirty' : 'clean'}</span>
              <span style={{ opacity: 0.6 }}>{r.lastCommitISO ? r.lastCommitISO.slice(0, 10) : '—'}</span>
              <span style={{ opacity: 0.7 }} title={r.locked ? 'locked' : undefined}>{r.locked ? '🔒' : ''}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
