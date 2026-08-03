import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Workspace, WorkspaceRepoStatus } from '../../../shared/workspace-types'
import type { FileChange, FileChangeType } from '../../../shared/types'
import { useIpcListener } from '../../hooks/app/useIpc'
import { BranchSwitcher } from './BranchSwitcher'

interface SourceControlProps {
  workspace: Workspace | null
  onSelectFile: (absolutePath: string) => void
}

const TYPE_ORDER: FileChangeType[] = ['modified', 'added', 'deleted']

const CHANGE_INDICATORS: Record<FileChangeType, { color: string; label: string }> = {
  modified: { color: 'var(--warning)', label: 'M' },
  added: { color: 'var(--success)', label: 'A' },
  deleted: { color: 'var(--error)', label: 'D' },
}

const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

/** Live git status of the workspace's checkouts. Refreshes when the workspace
 *  changes, when the file watcher reports changes, and on window focus (the
 *  watcher only covers the active session's dirs, so focus catches edits made
 *  outside the app — the same trigger VS Code's SCM view uses). */
function useWorkspaceRepoStatuses(workspaceId: string | null): { repos: WorkspaceRepoStatus[]; refresh: () => void } {
  const [repos, setRepos] = useState<WorkspaceRepoStatus[]>([])
  const requestIdRef = useRef(0)

  const refresh = useCallback((): void => {
    const requestId = ++requestIdRef.current
    if (!workspaceId) {
      setRepos([])
      return
    }
    void window.electronAPI.invoke('git:workspace-status', workspaceId)
      .then((result) => {
        // Drop responses that arrive after the workspace selection moved on.
        if (requestId === requestIdRef.current) setRepos(result as WorkspaceRepoStatus[])
      })
      .catch((err: unknown) => {
        console.error('[SourceControl] failed to load workspace git status', err)
      })
  }, [workspaceId])

  useEffect(() => { refresh() }, [refresh])
  useIpcListener('files:changed', () => { refresh() })
  useIpcListener('workspace:list-changed', () => { refresh() })
  useEffect(() => {
    const onFocus = (): void => { refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return { repos, refresh }
}

/** VS Code-style Source Control view for the selected workspace: one section
 *  per member repo checkout — a clickable branch (switch/create, see
 *  `BranchSwitcher`), a commit message input, and the uncommitted changes —
 *  the way VS Code's SCM view sections a multi-root workspace's repositories. */
export function SourceControl({ workspace, onSelectFile }: SourceControlProps): React.JSX.Element {
  const { repos, refresh } = useWorkspaceRepoStatuses(workspace?.id ?? null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleRepo = (projectId: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  if (!workspace) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.empty}>No workspace selected</div>
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.list}>
        {repos.map((repo) => (
          <RepoSection
            key={repo.projectId}
            workspaceId={workspace.id}
            repo={repo}
            isCollapsed={collapsed.has(repo.projectId)}
            onToggle={() => toggleRepo(repo.projectId)}
            onSelectFile={onSelectFile}
            onRefresh={refresh}
          />
        ))}
        {repos.length === 0 && <div style={styles.empty}>No git repositories in this workspace</div>}
      </div>
    </div>
  )
}

function RepoSection({
  workspaceId,
  repo,
  isCollapsed,
  onToggle,
  onSelectFile,
  onRefresh,
}: {
  workspaceId: string
  repo: WorkspaceRepoStatus
  isCollapsed: boolean
  onToggle: () => void
  onSelectFile: (absolutePath: string) => void
  onRefresh: () => void
}): React.JSX.Element {
  const root = repo.checkoutPath.replace(/\/$/, '')
  const sorted = useMemo(() => (
    [...repo.changes].sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type)
      const bi = TYPE_ORDER.indexOf(b.type)
      if (ai !== bi) return ai - bi
      return a.path.localeCompare(b.path)
    })
  ), [repo.changes])

  return (
    <section aria-label={repo.projectName}>
      <div style={styles.repoHeader}>
        <button type="button" style={styles.repoToggle} onClick={onToggle} aria-expanded={!isCollapsed}>
          <span style={{ ...styles.chevron, transform: isCollapsed ? 'rotate(-90deg)' : undefined }} aria-hidden>
            ▾
          </span>
          <span className="truncate" style={styles.repoName}>{repo.projectName}</span>
        </button>
        {repo.branch && (
          <BranchSwitcher
            workspaceId={workspaceId}
            projectId={repo.projectId}
            currentBranch={repo.branch}
            onCheckedOut={onRefresh}
          />
        )}
        {sorted.length > 0 && <span style={styles.countBadge}>{sorted.length}</span>}
      </div>
      {!isCollapsed && (
        <>
          {sorted.length > 0 && (
            <CommitInput
              workspaceId={workspaceId}
              projectId={repo.projectId}
              branch={repo.branch}
              onCommitted={onRefresh}
            />
          )}
          {sorted.length === 0 ? (
            <div style={styles.cleanRow}>No changes</div>
          ) : (
            sorted.map((change) => (
              <ChangeRow
                key={change.path}
                change={change}
                onSelect={() => onSelectFile(`${root}/${change.path}`)}
              />
            ))
          )}
        </>
      )}
    </section>
  )
}

/** VS Code's SCM message box: a per-repo input that commits the checkout's
 *  changes (stage-all, same managed commit the Commit overlay uses) on the
 *  button or Cmd/Ctrl+Enter. */
function CommitInput({
  workspaceId,
  projectId,
  branch,
  onCommitted,
}: {
  workspaceId: string
  projectId: string
  branch: string
  onCommitted: () => void
}): React.JSX.Element {
  const [message, setMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const commit = async (): Promise<void> => {
    const trimmed = message.trim()
    if (!trimmed || committing) return
    setCommitting(true)
    setError(null)
    try {
      await window.electronAPI.invoke('git:workspace-commit', workspaceId, projectId, trimmed)
      setMessage('')
      onCommitted()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCommitting(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void commit()
    }
  }

  return (
    <div style={styles.commitArea}>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={`Message (${IS_MAC ? '⌘⏎' : 'Ctrl+Enter'} to commit on "${branch}")`}
        rows={2}
        style={styles.commitTextarea}
        disabled={committing}
      />
      <button
        type="button"
        style={{ ...styles.commitButton, ...(message.trim() && !committing ? undefined : styles.commitButtonDisabled) }}
        onClick={() => void commit()}
        disabled={!message.trim() || committing}
      >
        {committing ? 'Committing…' : '✓ Commit'}
      </button>
      {error && <div style={styles.commitError}>{error}</div>}
    </div>
  )
}

function ChangeRow({ change, onSelect }: { change: FileChange; onSelect: () => void }): React.JSX.Element {
  const parts = change.path.split('/')
  const filename = parts[parts.length - 1]
  const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
  const indicator = CHANGE_INDICATORS[change.type]

  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      style={styles.row}
      title={change.path}
    >
      <span style={{ ...styles.indicator, color: indicator.color }}>{indicator.label}</span>
      <span className="truncate" style={styles.filename}>{filename}</span>
      {dir && <span className="truncate" style={styles.dir}>{dir}</span>}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
  repoHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '4px 8px',
  },
  repoToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    // The name yields to the branch label only past half the header — the
    // branch truncates first, so "storefront" never renders as "STOREFR…".
    flexShrink: 0,
    maxWidth: '50%',
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontSize: '11px',
  },
  chevron: {
    flexShrink: 0,
    fontSize: '9px',
    transition: 'transform 0.1s ease',
  },
  repoName: {
    color: 'var(--text-primary)',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    fontSize: '11px',
  },
  countBadge: {
    flexShrink: 0,
    marginLeft: 'auto',
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--type-ui-micro)',
  },
  commitArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '2px 8px 6px 24px',
  },
  commitTextarea: {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '4px 6px',
    background: 'var(--bg-input)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-xs)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    fontFamily: 'var(--font-sans)',
    lineHeight: '16px',
    resize: 'none' as const,
    outline: 'none',
  },
  commitButton: {
    width: '100%',
    padding: '3px 6px',
    background: 'linear-gradient(135deg, var(--btn-bg), var(--btn-hover))',
    border: 'none',
    borderRadius: 'var(--radius-xs)',
    color: 'var(--btn-text)',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'filter 200ms ease',
  },
  commitButtonDisabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  commitError: {
    fontSize: '11px',
    color: 'var(--error)',
    whiteSpace: 'pre-wrap' as const,
    maxHeight: '80px',
    overflowY: 'auto' as const,
  },
  cleanRow: {
    padding: '2px 8px 6px 24px',
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    padding: '2px 8px 2px 24px',
    cursor: 'pointer',
    fontSize: '12px',
    lineHeight: '16px',
    color: 'var(--text-primary)',
  },
  indicator: {
    flexShrink: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    fontWeight: 700,
  },
  filename: {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
  },
  dir: {
    flexShrink: 1,
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    color: 'var(--text-muted)',
  },
}
