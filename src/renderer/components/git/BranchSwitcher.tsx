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
  /** The status bar uses the same modal with a flatter VS Code-style trigger. */
  triggerVariant?: 'pill' | 'statusbar'
}

type PickerMode = 'switch' | 'create' | 'createFromName' | 'createFromSource' | 'detach'

type BranchLocation = {
  branch: BranchInfo
  source: 'local' | 'remote'
  displayName: string
  ref: string
}

type PickerOption =
  | { kind: 'action'; action: 'create' | 'createFrom' | 'detach' | 'createTyped'; label: string }
  | ({ kind: 'branch' } & BranchLocation)

/** VS Code's click-the-branch-name flow for one workspace checkout: a branch
 *  label that opens a centered quick-pick modal — filter input, the repo's
 *  local/remote branches (from the same `git:list-branches` the branch picker
 *  used), plus create, create-from, and detached-checkout flows. Selecting
 *  checks the workspace checkout out via `git:workspace-checkout`; branches
 *  held by other worktrees are already hidden by the main process.
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
  triggerVariant = 'pill',
}: BranchSwitcherProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const [filter, setFilter] = useState('')
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [mode, setMode] = useState<PickerMode>('switch')
  const [pendingBranchName, setPendingBranchName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useAutoFocus(open, inputRef)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    let cancelled = false
    void window.electronAPI.invoke('git:list-branches', projectId, currentBranch)
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
  }, [open, projectId, currentBranch])

  const close = useCallback((): void => {
    setOpen(false)
    setFilter('')
    setError(null)
    setActiveIndex(0)
    setMode('switch')
    setPendingBranchName('')
  }, [])

  const checkout = useCallback(async (
    target: string,
    checkoutMode: 'switch' | 'create' | 'detach',
    startPoint?: string,
  ): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (startPoint) {
        await window.electronAPI.invoke('git:workspace-checkout', workspaceId, projectId, target, checkoutMode, startPoint)
      } else {
        await window.electronAPI.invoke('git:workspace-checkout', workspaceId, projectId, target, checkoutMode)
      }
      setOpen(false)
      setFilter('')
      setActiveIndex(0)
      setMode('switch')
      setPendingBranchName('')
      onCheckedOut()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [busy, workspaceId, projectId, onCheckedOut])

  const trimmed = filter.trim()
  const branchesWithCurrent = currentBranch && currentBranch !== 'HEAD' && !branches.some((branch) => branch.name === currentBranch)
    ? [{ name: currentBranch, source: 'local' as const }, ...branches]
    : branches
  const locations: BranchLocation[] = branchesWithCurrent.flatMap((branch) => [
    ...(branch.source !== 'remote' ? [{
      branch,
      source: 'local' as const,
      displayName: branch.name,
      ref: branch.name,
    }] : []),
    ...(branch.source !== 'local' ? [{
      branch,
      source: 'remote' as const,
      displayName: `${branch.remote ?? 'origin'}/${branch.name}`,
      ref: `${branch.remote ?? 'origin'}/${branch.name}`,
    }] : []),
  ]).sort((left, right) => left.source === right.source ? 0 : left.source === 'local' ? -1 : 1)
  const filteredLocations = locations.filter((location) => location.displayName.toLowerCase().includes(trimmed.toLowerCase()))
  const exactMatch = branches.some((branch) => branch.name === trimmed)
  const branchOptions = filteredLocations.map((location) => ({ kind: 'branch' as const, ...location }))
  const options: PickerOption[] = mode === 'switch'
    ? trimmed
      ? [
          ...(!exactMatch && trimmed !== currentBranch
            ? [{ kind: 'action' as const, action: 'createTyped' as const, label: `Create new branch “${trimmed}”` }]
            : []),
          ...branchOptions,
        ]
      : [
          { kind: 'action', action: 'create', label: 'Create new branch…' },
          { kind: 'action', action: 'createFrom', label: 'Create new branch from…' },
          { kind: 'action', action: 'detach', label: 'Checkout detached…' },
          ...branchOptions,
        ]
    : mode === 'createFromSource' || mode === 'detach'
      ? branchOptions
      : []
  const clampedIndex = Math.min(activeIndex, Math.max(0, options.length - 1))

  const activate = useCallback((option: PickerOption | undefined): void => {
    if (!option) return
    if (option.kind === 'action') {
      if (option.action === 'createTyped') void checkout(trimmed, 'create')
      else {
        setMode(option.action === 'create' ? 'create' : option.action === 'createFrom' ? 'createFromName' : 'detach')
        setFilter('')
        setActiveIndex(0)
      }
      return
    }
    if (mode === 'createFromSource') void checkout(pendingBranchName, 'create', option.ref)
    else if (mode === 'detach') void checkout(option.ref, 'detach')
    // The local branch already checked out is inert, as in VS Code's picker.
    else if (option.source !== 'local' || option.branch.name !== currentBranch) {
      void checkout(option.branch.name, 'switch')
    }
  }, [checkout, currentBranch, mode, pendingBranchName, trimmed])

  const submitBranchName = (): void => {
    if (!trimmed || exactMatch || trimmed === currentBranch) return
    if (mode === 'create') void checkout(trimmed, 'create')
    else if (mode === 'createFromName') {
      setPendingBranchName(trimmed)
      setMode('createFromSource')
      setFilter('')
      setActiveIndex(0)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') { close(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, options.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (mode === 'create' || mode === 'createFromName') submitBranchName()
      else activate(options[clampedIndex])
    }
  }

  const pickerTitle = mode === 'switch'
    ? 'Switch branch'
    : mode === 'create'
      ? 'Create new branch'
      : mode === 'createFromName'
        ? 'Create new branch from…'
        : mode === 'createFromSource'
          ? `Select a starting point for ${pendingBranchName}`
          : 'Checkout detached'
  const placeholder = loading
    ? 'Loading branches…'
    : mode === 'create' || mode === 'createFromName'
      ? 'Enter a new branch name…'
      : mode === 'createFromSource'
        ? 'Select a branch or tag to start from…'
        : mode === 'detach'
          ? 'Select a branch or tag to checkout detached…'
          : 'Select a branch or tag to checkout…'

  return (
    <>
      <button
        type="button"
        className={triggerVariant === 'statusbar' ? 'statusbar-button statusbar-branch-button' : 'branch-switcher-trigger'}
        style={triggerVariant === 'statusbar' ? styles.statusTrigger : styles.trigger}
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
              <span style={styles.headerTitle}>
                {mode !== 'switch' && (
                  <button
                    type="button"
                    style={styles.backButton}
                    onClick={() => { setMode('switch'); setPendingBranchName(''); setFilter(''); setActiveIndex(0) }}
                    aria-label="Back to branch picker"
                  >
                    ←
                  </button>
                )}
                <span style={dialog.title}>{pickerTitle}</span>
              </span>
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
                placeholder={placeholder}
                style={styles.filterInput}
                aria-label="Filter branches"
                autoComplete="off"
                disabled={busy}
              />
              <div style={styles.list} role="listbox" aria-label="Branches">
                {options.map((option, idx) => {
                  const isActive = idx === clampedIndex
                  const previous = options[idx - 1]
                  const showSection = option.kind === 'branch'
                    && (previous?.kind !== 'branch' || previous.source !== option.source)
                  if (option.kind === 'action') {
                    return (
                      <div
                        key={option.action}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => activate(option)}
                        style={{ ...styles.row, ...styles.actionRow, ...(isActive ? styles.rowActive : undefined) }}
                      >
                        <span style={styles.createPlus} aria-hidden>＋</span>
                        <span className="truncate">{option.label}</span>
                      </div>
                    )
                  }
                  const isCurrent = option.source === 'local' && option.branch.name === currentBranch
                  return (
                    <React.Fragment key={`${option.source}:${option.displayName}`}>
                      {showSection && <div role="presentation" style={styles.sectionHeader}>{option.source === 'local' ? 'branches' : 'remote branches'}</div>}
                      <div
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
                        <BranchGlyph />
                        <span className="truncate" style={styles.rowName}>{option.displayName}</span>
                        {isCurrent && <span style={styles.currentMark}>current</span>}
                      </div>
                    </React.Fragment>
                  )
                })}
                {!loading && options.length === 0 && mode !== 'create' && mode !== 'createFromName' && (
                  <div style={styles.emptyRow}>{trimmed ? 'No matching branches' : 'No branches found'}</div>
                )}
                {(mode === 'create' || mode === 'createFromName') && (
                  <div style={styles.emptyRow}>
                    {exactMatch || trimmed === currentBranch ? 'That branch already exists' : 'Type a branch name and press Enter'}
                  </div>
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
  // A pill rather than a bare label: the click that switches branches has to
  // look like a control, or nobody finds it (see .branch-switcher-trigger).
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    minWidth: 0,
    padding: '1px 7px',
    border: '1px solid var(--control-border)',
    background: 'var(--control-bg)',
    borderRadius: 'var(--radius-pill)',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-caption)',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease',
  },
  statusTrigger: {
    minWidth: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-caption)',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    minWidth: 0,
  },
  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'calc(var(--control-height) - 6px)',
    height: 'calc(var(--control-height) - 6px)',
    borderRadius: 'var(--radius-xs)',
    color: 'var(--text-secondary)',
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
  actionRow: {
    color: 'var(--text-secondary)',
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
    color: 'var(--accent)',
  },
  currentMark: {
    flexShrink: 0,
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--type-ui-micro)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  sectionHeader: {
    padding: 'var(--space-xs) var(--space-lg)',
    borderTop: '1px solid var(--border)',
    color: 'var(--accent)',
    fontSize: 'var(--type-ui-micro)',
    fontWeight: 600,
    letterSpacing: 'var(--tracking-wide)',
    textTransform: 'uppercase' as const,
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
