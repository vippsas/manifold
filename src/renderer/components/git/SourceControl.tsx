import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Workspace, WorkspaceRepoStatus } from '../../../shared/workspace-types'
import type { FileChange } from '../../../shared/types'
import type { ScmFileTarget } from '../editor/file-open-request'
import { useIpcListener } from '../../hooks/app/useIpc'
import { ConfirmDialog } from '../ConfirmDialog'
import { BranchSwitcher } from './BranchSwitcher'
import { ScmChangeGroup } from './ScmChangeGroup'
import { ScmGlyph, ScmIconButton } from './scm-icons'
import { sourceControlStyles as styles } from './SourceControl.styles'

interface SourceControlProps {
  workspace: Workspace | null
  /** Open a changed file in the editor, diffed against its checkout's index. */
  onSelectFile: (absolutePath: string, scm: ScmFileTarget) => void
}

const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

/** A discard the user has yet to confirm. Held here rather than in the group so
 *  one dialog serves every row and group in the panel. */
interface PendingDiscard {
  projectId: string
  paths: string[]
}

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
 *  `BranchSwitcher`), a commit message input, and the uncommitted changes split
 *  into staged and unstaged groups — the way VS Code's SCM view sections a
 *  multi-root workspace's repositories. */
export function SourceControl({ workspace, onSelectFile }: SourceControlProps): React.JSX.Element {
  const { repos, refresh } = useWorkspaceRepoStatuses(workspace?.id ?? null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [pendingDiscard, setPendingDiscard] = useState<PendingDiscard | null>(null)
  const workspaceId = workspace?.id ?? null

  const toggleRepo = (projectId: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const runIndexOp = useCallback(async (channel: string, projectId: string, paths: string[]): Promise<void> => {
    if (!workspaceId || paths.length === 0) return
    try {
      await window.electronAPI.invoke(channel, workspaceId, projectId, paths)
    } catch (err: unknown) {
      console.error(`[SourceControl] ${channel} failed`, err)
    }
    refresh()
  }, [workspaceId, refresh])

  const confirmDiscard = useCallback((): void => {
    if (!pendingDiscard) return
    void runIndexOp('git:workspace-discard', pendingDiscard.projectId, pendingDiscard.paths)
    setPendingDiscard(null)
  }, [pendingDiscard, runIndexOp])

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
            onStage={(paths) => void runIndexOp('git:workspace-stage', repo.projectId, paths)}
            onUnstage={(paths) => void runIndexOp('git:workspace-unstage', repo.projectId, paths)}
            onRequestDiscard={(paths) => setPendingDiscard({ projectId: repo.projectId, paths })}
          />
        ))}
        {repos.length === 0 && <div style={styles.empty}>No git repositories in this workspace</div>}
      </div>
      {pendingDiscard && (
        <ConfirmDialog
          title="Discard changes?"
          message={pendingDiscard.paths.length === 1
            ? `Changes to ${pendingDiscard.paths[0]} will be lost. This cannot be undone.`
            : `Changes to ${pendingDiscard.paths.length} files will be lost. This cannot be undone.`}
          confirmLabel="Discard"
          onConfirm={confirmDiscard}
          onCancel={() => setPendingDiscard(null)}
        />
      )}
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
  onStage,
  onUnstage,
  onRequestDiscard,
}: {
  workspaceId: string
  repo: WorkspaceRepoStatus
  isCollapsed: boolean
  onToggle: () => void
  onSelectFile: (absolutePath: string, scm: ScmFileTarget) => void
  onRefresh: () => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onRequestDiscard: (paths: string[]) => void
}): React.JSX.Element {
  const root = repo.checkoutPath.replace(/\/$/, '')
  const commitRef = useRef<(() => void) | null>(null)
  const total = repo.staged.length + repo.unstaged.length

  const openFile = (change: FileChange, staged: boolean): void => {
    onSelectFile(`${root}/${change.path}`, {
      workspaceId,
      projectId: repo.projectId,
      relPath: change.path,
      staged,
    })
  }

  return (
    <section aria-label={repo.projectName}>
      <div style={styles.repoHeader}>
        <button
          type="button"
          style={styles.repoToggle}
          onClick={onToggle}
          aria-expanded={!isCollapsed}
          aria-label={repo.projectName}
        >
          <span style={{ ...styles.chevron, transform: isCollapsed ? 'rotate(-90deg)' : undefined }} aria-hidden>
            ▾
          </span>
          <span className="truncate" style={styles.repoName}>{repo.projectName}</span>
        </button>
        {repo.branch && (
          <BranchSwitcher
            workspaceId={workspaceId}
            projectId={repo.projectId}
            repoName={repo.projectName}
            currentBranch={repo.branch}
            onCheckedOut={onRefresh}
          />
        )}
        <div style={{ ...styles.actionRow, ...styles.actionRowTrailing }}>
          <ScmIconButton glyph="refresh" label={`Refresh ${repo.projectName}`} onClick={onRefresh} />
          <ScmIconButton glyph="check" label={`Commit ${repo.projectName}`} onClick={() => commitRef.current?.()} />
        </div>
        {total > 0 && <span style={styles.countBadge}>{total}</span>}
      </div>
      {!isCollapsed && (
        <>
          {total > 0 && (
            <CommitInput
              workspaceId={workspaceId}
              projectId={repo.projectId}
              branch={repo.branch}
              hasStaged={repo.staged.length > 0}
              onCommitted={onRefresh}
              commitRef={commitRef}
            />
          )}
          {repo.staged.length > 0 && (
            <ScmChangeGroup
              label="Staged Changes"
              changes={repo.staged}
              staged
              onSelectFile={(change) => openFile(change, true)}
              onStage={onStage}
              onUnstage={onUnstage}
              onDiscard={onRequestDiscard}
            />
          )}
          {repo.unstaged.length > 0 && (
            <ScmChangeGroup
              label="Changes"
              changes={repo.unstaged}
              staged={false}
              onSelectFile={(change) => openFile(change, false)}
              onStage={onStage}
              onUnstage={onUnstage}
              onDiscard={onRequestDiscard}
            />
          )}
          {total === 0 && <div style={styles.cleanRow}>No changes</div>}
        </>
      )}
    </section>
  )
}

/** VS Code's SCM message box: a per-repo input that commits on the button or
 *  Cmd/Ctrl+Enter. With something staged it commits exactly that; with nothing
 *  staged it asks first, since committing everything is a different act from
 *  the one the staging UI implies. `commitRef` lets the repo header's ✓ fire
 *  the same path as the button. */
function CommitInput({
  workspaceId,
  projectId,
  branch,
  hasStaged,
  onCommitted,
  commitRef,
}: {
  workspaceId: string
  projectId: string
  branch: string
  hasStaged: boolean
  onCommitted: () => void
  commitRef: React.MutableRefObject<(() => void) | null>
}): React.JSX.Element {
  const [message, setMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingStageAll, setConfirmingStageAll] = useState(false)

  const runCommit = useCallback(async (stageAll: boolean): Promise<void> => {
    const trimmed = message.trim()
    if (!trimmed || committing) return
    setCommitting(true)
    setError(null)
    try {
      await window.electronAPI.invoke('git:workspace-commit', workspaceId, projectId, trimmed, stageAll)
      setMessage('')
      onCommitted()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCommitting(false)
    }
  }, [message, committing, workspaceId, projectId, onCommitted])

  const commit = useCallback((): void => {
    if (!message.trim() || committing) return
    if (hasStaged) void runCommit(false)
    else setConfirmingStageAll(true)
  }, [message, committing, hasStaged, runCommit])

  useEffect(() => {
    commitRef.current = commit
    return () => { commitRef.current = null }
  }, [commit, commitRef])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      commit()
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
        onClick={commit}
        disabled={!message.trim() || committing}
      >
        <ScmGlyph id="check" />
        {committing ? 'Committing…' : 'Commit'}
      </button>
      {error && <div style={styles.commitError}>{error}</div>}
      {confirmingStageAll && (
        <ConfirmDialog
          title="No staged changes"
          message="There are no staged changes to commit. Stage all changes and commit them directly?"
          confirmLabel="Stage all & commit"
          onConfirm={() => {
            setConfirmingStageAll(false)
            void runCommit(true)
          }}
          onCancel={() => setConfirmingStageAll(false)}
        />
      )}
    </div>
  )
}
