import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { BranchInfo } from '../../../shared/types'

interface BranchSwitcherProps {
  workspaceId: string
  projectId: string
  currentBranch: string
  /** Called after a successful checkout so the owner can refresh its status. */
  onCheckedOut: () => void
  /** Open the picker on mount — for tests and screenshot fixtures. */
  defaultOpen?: boolean
}

/** VS Code's click-the-branch-name flow for one workspace checkout: a branch
 *  label that opens a quick-pick — filter input, the repo's branches (from the
 *  same `git:list-branches` the branch picker used, which already hides
 *  branches held by other worktrees), and a "create new branch" entry when the
 *  typed name matches nothing. Selecting checks the workspace checkout out via
 *  `git:workspace-checkout`. */
export function BranchSwitcher({
  workspaceId,
  projectId,
  currentBranch,
  onCheckedOut,
  defaultOpen,
}: BranchSwitcherProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const [filter, setFilter] = useState('')
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    let cancelled = false
    void window.electronAPI.invoke('git:list-branches', projectId)
      .then((result) => {
        if (!cancelled) setBranches(result as BranchInfo[])
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, projectId])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onMouseDown = (e: MouseEvent): void => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  const close = (): void => {
    setOpen(false)
    setFilter('')
    setError(null)
  }

  const checkout = useCallback(async (branchName: string, createNew: boolean): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await window.electronAPI.invoke('git:workspace-checkout', workspaceId, projectId, branchName, createNew)
      setOpen(false)
      setFilter('')
      onCheckedOut()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [busy, workspaceId, projectId, onCheckedOut])

  const trimmed = filter.trim()
  const filtered = branches.filter((b) => b.name.toLowerCase().includes(trimmed.toLowerCase()))
  const exactMatch = branches.find((b) => b.name === trimmed)
  const offerCreate = trimmed.length > 0 && !exactMatch && trimmed !== currentBranch

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close()
    } else if (e.key === 'Enter' && trimmed) {
      if (exactMatch && exactMatch.name !== currentBranch) void checkout(exactMatch.name, false)
      else if (offerCreate) void checkout(trimmed, true)
    }
  }

  return (
    <div ref={containerRef} style={styles.container}>
      <button
        type="button"
        className="branch-switcher-trigger"
        style={styles.trigger}
        onClick={() => (open ? close() : setOpen(true))}
        title={`On branch ${currentBranch} — click to switch or create a branch`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <BranchGlyph />
        <span className="truncate">{currentBranch}</span>
      </button>
      {open && (
        <div style={styles.popover} onKeyDown={onKeyDown}>
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={loading ? 'Loading branches…' : 'Select or create a branch…'}
            style={styles.filterInput}
            disabled={busy}
          />
          <div style={styles.list} role="listbox" aria-label="Branches">
            {offerCreate && (
              <div
                role="option"
                aria-selected={false}
                onClick={() => void checkout(trimmed, true)}
                style={{ ...styles.row, color: 'var(--accent)' }}
              >
                <span style={styles.createPlus} aria-hidden>＋</span>
                <span className="truncate">Create new branch “{trimmed}”</span>
              </div>
            )}
            {filtered.map((b) => {
              const isCurrent = b.name === currentBranch
              return (
                <div
                  key={b.name}
                  role="option"
                  aria-selected={isCurrent}
                  onClick={isCurrent ? undefined : () => void checkout(b.name, false)}
                  style={{ ...styles.row, ...(isCurrent ? styles.rowCurrent : undefined) }}
                >
                  <span className="truncate" style={styles.rowName}>{b.name}</span>
                  {isCurrent && <span style={styles.currentMark} aria-hidden>✓</span>}
                  {!isCurrent && b.source !== 'both' && (
                    <span style={styles.sourceBadge}>{b.source}</span>
                  )}
                </div>
              )
            })}
            {!loading && !offerCreate && filtered.length === 0 && (
              <div style={styles.emptyRow}>{trimmed ? 'No matching branches' : 'No branches found'}</div>
            )}
          </div>
          {busy && <div style={styles.status}>Checking out…</div>}
          {error && <div style={styles.error}>{error}</div>}
        </div>
      )}
    </div>
  )
}

export function BranchGlyph(): React.JSX.Element {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M6 3v12" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    display: 'flex',
    minWidth: 0,
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    minWidth: 0,
    padding: '0 3px',
    border: 'none',
    background: 'transparent',
    borderRadius: 'var(--radius-xs)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease',
  },
  popover: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    zIndex: 100,
    width: '240px',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-overlay)',
    border: '1px solid var(--overlay-border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-overlay)',
    padding: 'var(--space-xs)',
  },
  filterInput: {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '4px 6px',
    background: 'var(--bg-input)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-xs)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
  },
  list: {
    maxHeight: '192px',
    overflowY: 'auto' as const,
    marginTop: '4px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 6px',
    borderRadius: 'var(--radius-xs)',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  rowCurrent: {
    color: 'var(--text-muted)',
    cursor: 'default',
  },
  rowName: {
    flex: 1,
    minWidth: 0,
  },
  createPlus: {
    flexShrink: 0,
    fontSize: '11px',
  },
  currentMark: {
    flexShrink: 0,
    fontSize: '11px',
  },
  sourceBadge: {
    flexShrink: 0,
    fontSize: 'var(--type-ui-micro)',
    padding: '1px 5px',
    borderRadius: 'var(--radius-xs)',
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
  },
  emptyRow: {
    padding: '4px 6px',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  status: {
    padding: '4px 6px 0',
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  error: {
    padding: '4px 6px 0',
    fontSize: '11px',
    color: 'var(--error)',
    whiteSpace: 'pre-wrap' as const,
    maxHeight: '80px',
    overflowY: 'auto' as const,
  },
}
