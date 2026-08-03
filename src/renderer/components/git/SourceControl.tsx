import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Workspace, WorkspaceRepoStatus } from '../../../shared/workspace-types'
import type { FileChange, FileChangeType } from '../../../shared/types'
import { useIpcListener } from '../../hooks/app/useIpc'

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

/** Live git status of the workspace's checkouts. Refreshes when the workspace
 *  changes, when the file watcher reports changes, and on window focus (the
 *  watcher only covers the active session's dirs, so focus catches edits made
 *  outside the app — the same trigger VS Code's SCM view uses). */
function useWorkspaceRepoStatuses(workspaceId: string | null): WorkspaceRepoStatus[] {
  const [repos, setRepos] = useState<WorkspaceRepoStatus[]>([])
  const requestIdRef = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const requestId = ++requestIdRef.current
    if (!workspaceId) {
      setRepos([])
      return
    }
    try {
      const result = (await window.electronAPI.invoke('git:workspace-status', workspaceId)) as WorkspaceRepoStatus[]
      // Drop responses that arrive after the workspace selection moved on.
      if (requestId === requestIdRef.current) setRepos(result)
    } catch (err) {
      console.error('[SourceControl] failed to load workspace git status', err)
    }
  }, [workspaceId])

  useEffect(() => { void refresh() }, [refresh])
  useIpcListener('files:changed', () => { void refresh() })
  useIpcListener('workspace:list-changed', () => { void refresh() })
  useEffect(() => {
    const onFocus = (): void => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  return repos
}

/** VS Code-style Source Control view for the selected workspace: one section
 *  per member repo checkout — branch and uncommitted changes — the way VS
 *  Code's SCM view sections a multi-root workspace's repositories. */
export function SourceControl({ workspace, onSelectFile }: SourceControlProps): React.JSX.Element {
  const repos = useWorkspaceRepoStatuses(workspace?.id ?? null)
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
            repo={repo}
            isCollapsed={collapsed.has(repo.projectId)}
            onToggle={() => toggleRepo(repo.projectId)}
            onSelectFile={onSelectFile}
          />
        ))}
        {repos.length === 0 && <div style={styles.empty}>No git repositories in this workspace</div>}
      </div>
    </div>
  )
}

function RepoSection({
  repo,
  isCollapsed,
  onToggle,
  onSelectFile,
}: {
  repo: WorkspaceRepoStatus
  isCollapsed: boolean
  onToggle: () => void
  onSelectFile: (absolutePath: string) => void
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
      <button type="button" style={styles.repoHeader} onClick={onToggle} aria-expanded={!isCollapsed}>
        <span style={{ ...styles.chevron, transform: isCollapsed ? 'rotate(-90deg)' : undefined }} aria-hidden>
          ▾
        </span>
        <span className="truncate" style={styles.repoName}>{repo.projectName}</span>
        {repo.branch && (
          <span style={styles.branch} title={`On branch ${repo.branch}`}>
            <BranchGlyph />
            <span className="truncate">{repo.branch}</span>
          </span>
        )}
        {sorted.length > 0 && <span style={styles.countBadge}>{sorted.length}</span>}
      </button>
      {!isCollapsed && (
        sorted.length === 0 ? (
          <div style={styles.cleanRow}>No changes</div>
        ) : (
          sorted.map((change) => (
            <ChangeRow
              key={change.path}
              change={change}
              onSelect={() => onSelectFile(`${root}/${change.path}`)}
            />
          ))
        )
      )}
    </section>
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

function BranchGlyph(): React.JSX.Element {
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
    padding: '4px 8px',
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
    // The name yields to the branch label only past half the header — the
    // branch truncates first, so "storefront" never renders as "STOREFR…".
    flexShrink: 0,
    maxWidth: '50%',
  },
  branch: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    minWidth: 0,
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
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
