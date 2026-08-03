import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BranchInfo } from '../../../shared/types'
import { createDialogStyles } from '../workbench-style-primitives'
import { useAutoFocus } from '../../hooks/useAutoFocus'

interface BranchSwitcherProps {
  workspaceId: string
  projectId: string
  /** Named in the modal header — a workspace has several repos, and the centered
   *  modal is detached from the repo section that opened it. */
  repoName: string
  currentBranch: string
  /** Called after a successful checkout so the owner can refresh its status. */
  onCheckedOut: () => void
  /** Open the picker on mount — for tests and screenshot fixtures. */
  defaultOpen?: boolean
}

/** A row of the quick-pick list: the branches, plus the leading "create" entry
 *  when the typed name matches none of them. */
type PickerOption =
  | { kind: 'create'; name: string }
  | { kind: 'branch'; branch: BranchInfo }

/** VS Code's click-the-branch-name flow for one workspace checkout: a branch
 *  label that opens a centered quick-pick modal — filter input, the repo's
 *  branches (from the same `git:list-branches` the branch picker used, which
 *  already hides branches held by other worktrees), and a "create new branch"
 *  entry when the typed name matches nothing. Selecting checks the workspace
 *  checkout out via `git:workspace-checkout`.
 *
 *  Modal rather than a popover anchored to the label: the Source Control panel
 *  is a narrow sidebar column, which cramped the list and clipped long branch
 *  names. Same dialog primitives and keyboard model as the Command Palette. */
export function BranchSwitcher({
  workspaceId,
  projectId,
  repoName,
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
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useAutoFocus(open, inputRef)

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

  const close = useCallback((): void => {
    setOpen(false)
    setFilter('')
    setError(null)
    setActiveIndex(0)
  }, [])

  const checkout = useCallback(async (branchName: string, createNew: boolean): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await window.electronAPI.invoke('git:workspace-checkout', workspaceId, projectId, branchName, createNew)
      setOpen(false)
      setFilter('')
      setActiveIndex(0)
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

  const options: PickerOption[] = [
    ...(offerCreate ? [{ kind: 'create', name: trimmed } as const] : []),
    ...filtered.map((branch) => ({ kind: 'branch', branch } as const)),
  ]
  const clampedIndex = Math.min(activeIndex, Math.max(0, options.length - 1))

  const activate = useCallback((option: PickerOption | undefined): void => {
    if (!option) return
    if (option.kind === 'create') void checkout(option.name, true)
    // The branch already checked out is inert — selecting it is a no-op, as in
    // VS Code's picker.
    else if (option.branch.name !== currentBranch) void checkout(option.branch.name, false)
  }, [checkout, currentBranch])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') { close(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, options.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); activate(options[clampedIndex]) }
  }

  return (
    <>
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
      {open && createPortal(
        <div
          ref={overlayRef}
          style={dialog.overlay}
          onClick={(e) => { if (e.target === overlayRef.current) close() }}
          role="dialog"
          aria-modal="true"
          aria-label="Switch branch"
        >
          <div style={dialog.panel} onClick={(e) => e.stopPropagation()}>
            <div style={dialog.header}>
              <span style={dialog.title}>Switch branch</span>
              <span style={styles.headerContext}>
                <BranchGlyph />
                <span className="truncate">{repoName} · {currentBranch}</span>
              </span>
            </div>
            <div style={dialog.body}>
              <input
                ref={inputRef}
                type="text"
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setActiveIndex(0) }}
                onKeyDown={onKeyDown}
                placeholder={loading ? 'Loading branches…' : 'Select or create a branch…'}
                style={styles.filterInput}
                aria-label="Filter branches"
                autoComplete="off"
                disabled={busy}
              />
              <div style={styles.list} role="listbox" aria-label="Branches">
                {options.map((option, idx) => {
                  const isActive = idx === clampedIndex
                  if (option.kind === 'create') {
                    return (
                      <div
                        key="__create__"
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => activate(option)}
                        style={{ ...styles.row, ...(isActive ? styles.rowActive : undefined), color: 'var(--accent)' }}
                      >
                        <span style={styles.createPlus} aria-hidden>＋</span>
                        <span className="truncate">Create new branch “{option.name}”</span>
                      </div>
                    )
                  }
                  const isCurrent = option.branch.name === currentBranch
                  return (
                    <div
                      key={option.branch.name}
                      role="option"
                      aria-selected={isActive}
                      aria-current={isCurrent || undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => activate(option)}
                      style={{
                        ...styles.row,
                        ...(isActive ? styles.rowActive : undefined),
                        ...(isCurrent ? styles.rowCurrent : undefined),
                      }}
                    >
                      <span className="truncate" style={styles.rowName}>{option.branch.name}</span>
                      {isCurrent && <span style={styles.currentMark}>current</span>}
                      {!isCurrent && option.branch.source !== 'both' && (
                        <span style={styles.sourceBadge}>{option.branch.source}</span>
                      )}
                    </div>
                  )
                })}
                {!loading && options.length === 0 && (
                  <div style={styles.emptyRow}>{trimmed ? 'No matching branches' : 'No branches found'}</div>
                )}
              </div>
              {busy && <div style={styles.status}>Checking out…</div>}
              {error && <div style={styles.error}>{error}</div>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
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

const dialog = createDialogStyles('460px')

const styles: Record<string, React.CSSProperties> = {
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
  headerContext: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-xs)',
    minWidth: 0,
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-caption)',
  },
  filterInput: {
    ...dialog.input,
    width: '100%',
    boxSizing: 'border-box' as const,
    fontFamily: 'var(--font-mono)',
  },
  // Bleeds to the panel edges like the Command Palette's list, so rows read as
  // a full-width list rather than a boxed sub-element.
  list: {
    maxHeight: '320px',
    overflowY: 'auto' as const,
    margin: '0 calc(-1 * var(--space-lg))',
    borderTop: '1px solid var(--border)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    padding: 'var(--space-sm) var(--space-lg)',
    fontSize: 'var(--type-ui-small)',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  rowActive: {
    background: 'var(--selection-bg, color-mix(in srgb, var(--accent), transparent 85%))',
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
  },
  currentMark: {
    flexShrink: 0,
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--type-ui-micro)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
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
    padding: 'var(--space-lg)',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
  },
  status: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
  },
  error: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--error)',
    whiteSpace: 'pre-wrap' as const,
    maxHeight: '80px',
    overflowY: 'auto' as const,
  },
}
