/// <reference lib="dom" />
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { WorktreeOverviewEntry, BranchOverviewEntry } from 'manifold'
import { PANEL_CSS } from './panel-css'
import { relativeTime, splitBranch } from './format'
import { activeWorktrees, idleWorktrees, groupBranchesByRepo, computeStats, type RepoBranches } from './board-model'

interface ThemeMsg { type: '__manifold_theme'; vars: Record<string, string> }
type Incoming =
  | { type: 'init'; entries: WorktreeOverviewEntry[]; branches: BranchOverviewEntry[]; focusRepo?: string | null; error?: string | null }
  | ThemeMsg

function Branch({ value }: { value: string }): React.JSX.Element {
  const { ns, rest } = splitBranch(value)
  return <span className="wt-branch" title={value}>{ns && <span className="ns">{ns}</span>}{rest}</span>
}

function DiffStat({ w }: { w: WorktreeOverviewEntry }): React.JSX.Element {
  if (w.status === 'stale') return <span className="wt-diff"><span className="z">—</span></span>
  if (!w.ahead && !w.behind) return <span className="wt-diff"><span className="z">in sync</span></span>
  const bars: React.JSX.Element[] = []
  for (let i = 0; i < Math.min(w.ahead, 4); i++) bars.push(<i key={`a${i}`} className="a" style={{ height: 5 + i * 2 }} />)
  for (let i = 0; i < Math.min(w.behind, 4); i++) bars.push(<i key={`b${i}`} className="b" style={{ height: 5 + i * 2 }} />)
  return (
    <span className="wt-diff">
      <span className="wt-bars">{bars}</span>
      <span>{w.ahead ? <span className="a">+{w.ahead} </span> : null}{w.behind ? <span className="b">−{w.behind}</span> : null}</span>
    </span>
  )
}

function MiniCard({ w, focus, now }: { w: WorktreeOverviewEntry; focus: boolean; now: number }): React.JSX.Element {
  const stale = w.status === 'stale'
  return (
    <div className={`wt-mini${focus ? ' focus' : ''}`} data-testid="worktree-card" data-focus={focus ? '1' : undefined}>
      <div className="r" style={stale ? { color: 'var(--status-error)' } : undefined}>
        <span className="d" style={stale ? { background: 'var(--status-error)' } : undefined} />
        {w.projectName}{stale ? ' · worktree gone' : ` · ${relativeTime(w.lastCommitISO, now)}`}
      </div>
      <Branch value={w.branch} />
      <div className="mf">
        <DiffStat w={w} />
        {!stale && (w.dirty ? <span className="wt-chip dirty">● uncommitted</span> : <span className="wt-chip clean">clean</span>)}
        {w.locked && <span className="wt-lock" title="locked">🔒</span>}
      </div>
    </div>
  )
}

export function WorktreesPanel(): React.JSX.Element {
  const [entries, setEntries] = useState<WorktreeOverviewEntry[] | null>(null)
  const [branches, setBranches] = useState<BranchOverviewEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [focusRepo, setFocusRepo] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const rootRef = useRef<HTMLDivElement | null>(null)
  const focusedOnce = useRef(false)

  useEffect(() => {
    const onMsg = (e: MessageEvent): void => {
      const m = e.data as Incoming | null
      if (!m || typeof m !== 'object') return
      if (m.type === '__manifold_theme') {
        for (const [k, v] of Object.entries(m.vars)) document.documentElement.style.setProperty(k, v)
        return
      }
      if (m.type === 'init') { setEntries(m.entries); setBranches(m.branches ?? []); setFocusRepo(m.focusRepo ?? null); setError(m.error ?? null) }
    }
    window.addEventListener('message', onMsg)
    parent.postMessage({ type: 'ready' }, '*')
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // On first load, default-expand the repo the user came from and scroll it into view.
  useEffect(() => {
    if (entries === null || focusedOnce.current || !focusRepo) return
    focusedOnce.current = true
    setExpanded((prev) => new Set([...prev, focusRepo]))
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('[data-focus="1"]')?.scrollIntoView({ block: 'center' }))
  }, [entries, focusRepo])

  const now = Date.now()
  const actives = useMemo(() => activeWorktrees(entries ?? []), [entries])
  const idles = useMemo(() => idleWorktrees(entries ?? []), [entries])
  const pruneGroups = useMemo(() => groupBranchesByRepo(branches), [branches])
  const stats = useMemo(() => computeStats(entries ?? [], branches), [entries, branches])

  const toggle = (repo: string): void => setExpanded((prev) => {
    const next = new Set(prev)
    if (next.has(repo)) next.delete(repo); else next.add(repo)
    return next
  })
  const onDelete = (b: BranchOverviewEntry): void => {
    setBranches((prev) => prev.filter((x) => !(x.projectId === b.projectId && x.branch === b.branch)))
    parent.postMessage({ type: 'deleteBranch', projectId: b.projectId, branch: b.branch }, '*')
  }
  const onDeleteAll = (g: RepoBranches): void => {
    // Confirmation + the actual delete happen host-side; re-init updates the list.
    parent.postMessage({ type: 'deleteAllBranches', projectId: g.projectId, repo: g.projectName, count: g.branches.length }, '*')
  }

  if (entries === null) return <div className="wt-empty">Loading worktrees…</div>
  if (error) return <div className="wt-empty" style={{ color: 'var(--status-error)' }}>Failed to load worktrees: {error}</div>

  return (
    <div className="wt-root" ref={rootRef} data-testid="worktrees-overview">
      <style>{PANEL_CSS}</style>

      <div className="wt-kpis">
        <div className="wt-kpi active"><span className="glow" /><div className="v">{stats.active}</div>
          <div className="l"><span className="dot" style={{ background: 'var(--status-running)' }} />Active worktrees</div></div>
        <div className="wt-kpi idle"><span className="glow" /><div className="v">{stats.idle}</div>
          <div className="l">Idle · safe to resume or remove</div></div>
        <div className="wt-kpi dirty"><span className="glow" /><div className="v">{stats.dirty}</div>
          <div className="l">With uncommitted changes</div></div>
        <div className="wt-kpi prune"><span className="glow" /><div className="v">{stats.prunable}</div>
          <div className="l">Prunable branches</div></div>
      </div>

      {actives.length === 0 && idles.length === 0 && pruneGroups.length === 0 ? (
        <div className="wt-empty">No managed worktrees.</div>
      ) : (
        <div className="wt-board">
          <div className="wt-col">
            <div className="wt-colhead"><span className="wt-pill active"><span className="d" />Active</span><span className="ct">{actives.length}</span></div>
            {actives.length === 0 && <div className="wt-colempty">No active worktrees</div>}
            {actives.map((w) => <MiniCard key={w.worktreePath} w={w} focus={w.projectName === focusRepo} now={now} />)}
          </div>

          <div className="wt-col">
            <div className="wt-colhead"><span className="wt-pill idle"><span className="d" />Idle</span><span className="ct">{idles.length}</span></div>
            {idles.length === 0 && <div className="wt-colempty">Nothing idle</div>}
            {idles.map((w) => <MiniCard key={w.worktreePath} w={w} focus={w.projectName === focusRepo} now={now} />)}
          </div>

          <div className="wt-col">
            <div className="wt-colhead"><span className="wt-pill stale"><span className="d" />Prune</span><span className="ct">{pruneGroups.length}</span></div>
            {pruneGroups.length === 0 && <div className="wt-colempty">No prunable branches 🎉</div>}
            {pruneGroups.map((g) => {
              const open = expanded.has(g.projectName)
              return (
                <div className="wt-prunerow" key={g.projectName} data-testid="orphan-branches" data-focus={g.projectName === focusRepo ? '1' : undefined}>
                  <div className={`wt-prunehead${open ? ' open' : ''}`} data-testid="orphan-branches-header" onClick={() => toggle(g.projectName)}>
                    <span className="caret">▸</span>
                    <span className="nm" title={g.projectName}>{g.projectName}</span>
                    <button
                      type="button"
                      className="wt-pruneall"
                      data-testid="delete-all-branches"
                      title={`Delete all ${g.branches.length} merged branches in ${g.projectName}`}
                      onClick={(e) => { e.stopPropagation(); onDeleteAll(g) }}
                    >Prune all</button>
                    <span className="n">{g.branches.length}</span>
                  </div>
                  {open && (
                    <div className="wt-prunelist">
                      {g.branches.map((b) => (
                        <div className="wt-branchrow" key={b.branch} data-testid="orphan-branch">
                          <span className="bn" title={b.branch}>{b.branch}</span>
                          <span className="ago">{relativeTime(b.lastCommitISO, now)}</span>
                          <button
                            type="button"
                            className="wt-del"
                            data-testid="delete-branch"
                            aria-label={`Delete branch ${b.branch}`}
                            title="Delete merged branch"
                            onClick={() => onDelete(b)}
                          >🗑</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
