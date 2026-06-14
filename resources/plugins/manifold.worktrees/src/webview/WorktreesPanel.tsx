/// <reference lib="dom" />
import React, { useEffect, useMemo, useState } from 'react'
import type { WorktreeOverviewEntry, BranchOverviewEntry } from 'manifold'

interface ThemeMsg { type: '__manifold_theme'; vars: Record<string, string> }
type Incoming = { type: 'init'; entries: WorktreeOverviewEntry[]; branches: BranchOverviewEntry[]; error?: string | null } | ThemeMsg

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--success, #3fb950)',
  idle: 'var(--text-muted, #8b949e)',
  stale: 'var(--error, #f85149)',
}

interface RepoGroup { repo: string; worktrees: WorktreeOverviewEntry[]; branches: BranchOverviewEntry[] }

function buildRepos(entries: WorktreeOverviewEntry[], branches: BranchOverviewEntry[]): RepoGroup[] {
  const wt = new Map<string, WorktreeOverviewEntry[]>()
  for (const e of entries) { const a = wt.get(e.projectName) ?? []; a.push(e); wt.set(e.projectName, a) }
  const br = new Map<string, BranchOverviewEntry[]>()
  for (const b of branches) { const a = br.get(b.projectName) ?? []; a.push(b); br.set(b.projectName, a) }
  // Repos that hold worktrees come first (the overview is primarily about worktrees),
  // then branch-only repos; alphabetical within each band.
  return [...new Set([...wt.keys(), ...br.keys()])]
    .sort((a, b) => {
      const aw = (wt.get(a)?.length ?? 0) > 0 ? 0 : 1
      const bw = (wt.get(b)?.length ?? 0) > 0 ? 0 : 1
      return aw - bw || a.localeCompare(b)
    })
    .map((repo) => ({ repo, worktrees: wt.get(repo) ?? [], branches: br.get(repo) ?? [] }))
}

export function WorktreesPanel(): React.JSX.Element {
  const [entries, setEntries] = useState<WorktreeOverviewEntry[] | null>(null)
  const [branches, setBranches] = useState<BranchOverviewEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    const onMsg = (e: MessageEvent): void => {
      const m = e.data as Incoming | null
      if (!m || typeof m !== 'object') return
      if (m.type === '__manifold_theme') {
        for (const [k, v] of Object.entries(m.vars)) document.documentElement.style.setProperty(k, v)
        return
      }
      if (m.type === 'init') { setEntries(m.entries); setBranches(m.branches ?? []); setError(m.error ?? null) }
    }
    window.addEventListener('message', onMsg)
    parent.postMessage({ type: 'ready' }, '*')
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const repos = useMemo(() => buildRepos(entries ?? [], branches), [entries, branches])
  const wtTotal = entries?.length ?? 0
  const toggle = (repo: string): void => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(repo)) next.delete(repo); else next.add(repo)
    return next
  })

  if (entries === null) return <div style={{ padding: 16, opacity: 0.6 }}>Loading worktrees…</div>
  if (error) return <div style={{ padding: 16, color: 'var(--error,#f85149)' }}>Failed to load worktrees: {error}</div>

  const cols = '70px 1fr 90px 60px 90px 36px'
  return (
    <div data-testid="worktrees-overview" style={{ padding: '12px 14px', fontSize: 13, lineHeight: 1.5, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>
        Worktrees <span style={{ opacity: 0.6, fontWeight: 400 }}>· {wtTotal} across {repos.length} repos{branches.length > 0 ? ` · ${branches.length} prunable branches` : ''}</span>
      </div>
      {wtTotal === 0 && branches.length === 0 && <div style={{ opacity: 0.6 }}>No managed worktrees.</div>}
      {repos.map((g) => (
        <div key={g.repo} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, borderBottom: '1px solid var(--border, rgba(128,128,128,.3))', padding: '4px 2px', display: 'flex', justifyContent: 'space-between' }}>
            <span>{g.repo}</span><span style={{ opacity: 0.55, fontWeight: 400 }}>{g.worktrees.length}</span>
          </div>
          {g.worktrees.map((r) => (
            <div key={r.worktreePath} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '4px 2px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
              <span style={{ color: STATUS_COLOR[r.status] }}>● {r.status}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.branch}>{r.branch}</span>
              <span>{r.status === 'stale' ? '—' : `+${r.ahead} / −${r.behind}`}</span>
              <span style={{ color: r.dirty ? 'var(--warning,#d29922)' : undefined, opacity: r.dirty ? 1 : 0.4 }}>{r.status === 'stale' ? '' : r.dirty ? 'dirty' : 'clean'}</span>
              <span style={{ opacity: 0.6 }}>{r.lastCommitISO ? r.lastCommitISO.slice(0, 10) : '—'}</span>
              <span style={{ opacity: 0.7 }} title={r.locked ? 'locked' : undefined}>{r.locked ? '🔒' : ''}</span>
            </div>
          ))}
          {g.branches.length > 0 && (
            <div data-testid="orphan-branches" style={{ marginTop: 4 }}>
              <div
                data-testid="orphan-branches-header"
                onClick={() => toggle(g.repo)}
                style={{ opacity: 0.6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '4px 2px 2px', cursor: 'pointer', userSelect: 'none' }}
              >
                {expanded.has(g.repo) ? '▾' : '▸'} merged branches · no worktree · {g.branches.length}
              </div>
              {expanded.has(g.repo) && g.branches.map((b) => (
                <div key={b.branch} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px', gap: 8, alignItems: 'center', padding: '3px 2px', fontFamily: 'var(--font-mono, ui-monospace, monospace)', opacity: 0.8 }}>
                  <span style={{ opacity: 0.6 }}>⌥ merged</span>
                  <span data-testid="orphan-branch" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.branch}>{b.branch}</span>
                  <span style={{ opacity: 0.6 }}>{b.lastCommitISO ? b.lastCommitISO.slice(0, 10) : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
