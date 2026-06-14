/// <reference lib="dom" />
import React, { useEffect, useMemo, useState } from 'react'
import type { WorktreeOverviewEntry, BranchOverviewEntry } from 'manifold'

interface ThemeMsg { type: '__manifold_theme'; vars: Record<string, string> }
type Incoming = { type: 'init'; entries: WorktreeOverviewEntry[]; branches: BranchOverviewEntry[]; error?: string | null } | ThemeMsg

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--status-running)',
  idle: 'var(--text-muted)',
  stale: 'var(--status-error)',
}

const COLS = '84px minmax(0,1fr) 96px 64px 104px 22px'

const CSS = `
  .wt-root { height:100%; overflow:auto; box-sizing:border-box; font-size:var(--type-ui-small); color:var(--text-secondary); }
  .wt-summary { padding:var(--space-sm) var(--space-md); color:var(--text-muted); font-size:var(--type-ui-caption); }
  .wt-summary b { color:var(--text-secondary); font-weight:600; }
  .wt-colhead { display:grid; grid-template-columns:${COLS}; gap:var(--space-sm); position:sticky; top:0; z-index:1;
    padding:6px var(--space-md); background:var(--bg-primary); border-bottom:1px solid var(--divider);
    font-size:var(--type-ui-micro); text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); }
  .wt-repohead { display:flex; justify-content:space-between; align-items:center; padding:10px var(--space-md) 4px;
    font-size:var(--type-ui-small); font-weight:700; color:var(--text-primary); }
  .wt-repohead .count { color:var(--text-muted); font-weight:400; }
  .wt-row { display:grid; grid-template-columns:${COLS}; gap:var(--space-sm); align-items:center;
    padding:4px var(--space-md); font-family:var(--font-mono); transition:background 150ms ease; }
  .wt-row:hover, .wt-branchrow:hover { background:var(--list-hover-bg); }
  .wt-dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:7px; vertical-align:middle; flex-shrink:0; }
  .wt-branch { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .wt-branchhead { padding:6px var(--space-md) 2px; font-size:var(--type-ui-micro); text-transform:uppercase;
    letter-spacing:.05em; color:var(--text-muted); cursor:pointer; user-select:none; transition:color 150ms ease; }
  .wt-branchhead:hover { color:var(--text-secondary); }
  .wt-branchrow { display:grid; grid-template-columns:${COLS}; gap:var(--space-sm); align-items:center;
    padding:3px var(--space-md); font-family:var(--font-mono); color:var(--text-muted); transition:background 150ms ease; }
  .wt-tag { color:var(--text-muted); }
  .wt-empty { padding:var(--space-md); color:var(--text-muted); }
`

interface RepoGroup { repo: string; worktrees: WorktreeOverviewEntry[]; branches: BranchOverviewEntry[] }

function buildRepos(entries: WorktreeOverviewEntry[], branches: BranchOverviewEntry[]): RepoGroup[] {
  const wt = new Map<string, WorktreeOverviewEntry[]>()
  for (const e of entries) { const a = wt.get(e.projectName) ?? []; a.push(e); wt.set(e.projectName, a) }
  const br = new Map<string, BranchOverviewEntry[]>()
  for (const b of branches) { const a = br.get(b.projectName) ?? []; a.push(b); br.set(b.projectName, a) }
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

  if (entries === null) return <div className="wt-empty">Loading worktrees…</div>
  if (error) return <div className="wt-empty" style={{ color: 'var(--status-error)' }}>Failed to load worktrees: {error}</div>

  return (
    <div className="wt-root" data-testid="worktrees-overview">
      <style>{CSS}</style>
      <div className="wt-summary">
        <b>{wtTotal}</b> worktrees · <b>{repos.length}</b> repos · <b>{branches.length}</b> prunable branches
      </div>
      <div className="wt-colhead">
        <span>Status</span><span>Branch</span><span>↑↓ base</span><span>Changes</span><span>Last commit</span><span />
      </div>
      {wtTotal === 0 && branches.length === 0 && <div className="wt-empty">No managed worktrees.</div>}
      {repos.map((g) => (
        <div key={g.repo}>
          <div className="wt-repohead"><span>{g.repo}</span><span className="count">{g.worktrees.length}</span></div>
          {g.worktrees.map((r) => (
            <div className="wt-row" key={r.worktreePath}>
              <span style={{ color: STATUS_COLOR[r.status] }}><span className="wt-dot" style={{ background: STATUS_COLOR[r.status] }} />{r.status}</span>
              <span className="wt-branch" title={r.branch}>{r.branch}</span>
              <span>{r.status === 'stale' ? '—' : `+${r.ahead} / −${r.behind}`}</span>
              <span style={{ color: r.dirty ? 'var(--status-waiting)' : 'var(--text-muted)' }}>{r.status === 'stale' ? '' : r.dirty ? 'dirty' : 'clean'}</span>
              <span style={{ color: 'var(--text-muted)' }}>{r.lastCommitISO ? r.lastCommitISO.slice(0, 10) : '—'}</span>
              <span title={r.locked ? 'locked' : undefined}>{r.locked ? '🔒' : ''}</span>
            </div>
          ))}
          {g.branches.length > 0 && (
            <div data-testid="orphan-branches">
              <div className="wt-branchhead" data-testid="orphan-branches-header" onClick={() => toggle(g.repo)}>
                {expanded.has(g.repo) ? '▾' : '▸'} merged branches · no worktree · {g.branches.length}
              </div>
              {expanded.has(g.repo) && g.branches.map((b) => (
                <div className="wt-branchrow" key={b.branch}>
                  <span className="wt-tag">merged</span>
                  <span className="wt-branch" data-testid="orphan-branch" title={b.branch}>{b.branch}</span>
                  <span /><span />
                  <span>{b.lastCommitISO ? b.lastCommitISO.slice(0, 10) : '—'}</span>
                  <span />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
