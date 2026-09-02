import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Workspace, WorkspaceRepoStatus } from '../../../shared/workspace-types'
import type { FileChange } from '../../../shared/types'
import type { ScmFileTarget } from '../editor/file-open-request'
import { useWorkspaceRepoStatuses } from '../../hooks/project/workspace-git-status'
import { ConfirmDialog } from '../ConfirmDialog'
import { ContextMenu, tidy, type MenuItem } from '../common/ContextMenu'
import { BranchSwitcher } from './BranchSwitcher'
import { ScmChangeGroup, type ScmGroupKind, type ScmViewMode } from './ScmChangeGroup'
import { ScmGlyph, ScmIconButton } from './scm-icons'
import { sourceControlStyles as styles } from './SourceControl.styles'

interface SourceControlProps {
  workspace: Workspace | null
  /** Open a changed file in the editor, diffed against its checkout's index. */
  onSelectFile: (absolutePath: string, scm: ScmFileTarget) => void
}

const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')

/** A discard the user has yet to confirm. Held here rather than in the group so
 *  one dialog serves every row and group in the panel. `kind` decides the
 *  wording: discarding tracked work reverts it, while discarding an untracked
 *  file deletes it outright. */
interface PendingDiscard {
  projectId: string
  paths: string[]
  kind: ScmGroupKind
}

/** The panel's single context menu, positioned at the pointer. One instance
 *  serves every repo header, group header, and row. */
interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

/** VS Code-style Source Control view for the selected workspace: one section
 *  per member repo checkout — a clickable branch (switch/create, see
 *  `BranchSwitcher`), a commit message input, and the uncommitted changes split
 *  into staged, unstaged, and untracked groups — the way VS Code's SCM view
 *  sections a multi-root workspace's repositories. */
export function SourceControl({ workspace, onSelectFile }: SourceControlProps): React.JSX.Element {
  const { repos, refresh } = useWorkspaceRepoStatuses(workspace?.id ?? null)
  return <SourceControlContent workspace={workspace} repos={repos} refresh={refresh} onSelectFile={onSelectFile} />
}

/** Presentational half used by the real sidebar, which receives the app-level
 *  status feed shared with the activity-bar badge. */
export function SourceControlContent({
  workspace,
  repos,
  refresh,
  onSelectFile,
}: SourceControlProps & {
  repos: WorkspaceRepoStatus[]
  refresh: () => void
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [pendingDiscard, setPendingDiscard] = useState<PendingDiscard | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [viewMode, setViewMode] = useState<ScmViewMode>('list')
  const workspaceId = workspace?.id ?? null

  const toggleRepo = (projectId: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const openMenu = useCallback((event: React.MouseEvent, items: MenuItem[]): void => {
    event.preventDefault()
    event.stopPropagation()
    if (items.length === 0) return
    setMenu({ x: event.clientX, y: event.clientY, items })
  }, [])

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
      {repos.length > 0 && (
        <div style={styles.toolbar}>
          <ScmIconButton
            glyph={viewMode === 'list' ? 'tree' : 'list'}
            label={viewMode === 'list' ? 'View as Tree' : 'View as List'}
            onClick={() => setViewMode((mode) => (mode === 'list' ? 'tree' : 'list'))}
          />
        </div>
      )}
      <div style={styles.list}>
        {repos.map((repo) => (
          <RepoSection
            key={repo.projectId}
            workspaceId={workspace.id}
            repo={repo}
            isCollapsed={collapsed.has(repo.projectId)}
            viewMode={viewMode}
            onSetViewMode={setViewMode}
            onToggle={() => toggleRepo(repo.projectId)}
            onSelectFile={onSelectFile}
            onRefresh={refresh}
            onOpenMenu={openMenu}
            onStage={(paths) => void runIndexOp('git:workspace-stage', repo.projectId, paths)}
            onUnstage={(paths) => void runIndexOp('git:workspace-unstage', repo.projectId, paths)}
            onRequestDiscard={(paths, kind) => setPendingDiscard({ projectId: repo.projectId, paths, kind })}
          />
        ))}
        {repos.length === 0 && <div style={styles.empty}>No git repositories in this workspace</div>}
      </div>
      {pendingDiscard && (
        <ConfirmDialog
          title={pendingDiscard.kind === 'untracked' ? 'Delete untracked files?' : 'Discard changes?'}
          message={discardMessage(pendingDiscard)}
          confirmLabel={pendingDiscard.kind === 'untracked' ? 'Delete' : 'Discard'}
          onConfirm={confirmDiscard}
          onCancel={() => setPendingDiscard(null)}
        />
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  )
}

/** Untracked files have no committed version to fall back to, so the dialog
 *  says "deleted" rather than "lost" — the outcome the user actually gets. */
function discardMessage({ paths, kind }: PendingDiscard): string {
  const subject = paths.length === 1 ? paths[0] : `${paths.length} files`
  return kind === 'untracked'
    ? `${paths.length === 1 ? subject : `These ${subject}`} will be deleted from disk. This cannot be undone.`
    : `Changes to ${subject} will be lost. This cannot be undone.`
}

function RepoSection({
  workspaceId,
  repo,
  isCollapsed,
  viewMode,
  onSetViewMode,
  onToggle,
  onSelectFile,
  onRefresh,
  onOpenMenu,
  onStage,
  onUnstage,
  onRequestDiscard,
}: {
  workspaceId: string
  repo: WorkspaceRepoStatus
  isCollapsed: boolean
  viewMode: ScmViewMode
  onSetViewMode: (mode: ScmViewMode) => void
  onToggle: () => void
  onSelectFile: (absolutePath: string, scm: ScmFileTarget) => void
  onRefresh: () => void
  onOpenMenu: (event: React.MouseEvent, items: MenuItem[]) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onRequestDiscard: (paths: string[], kind: ScmGroupKind) => void
}): React.JSX.Element {
  const root = repo.checkoutPath.replace(/\/$/, '')
  const commitRef = useRef<(() => void) | null>(null)
  const untracked = repo.untracked ?? []
  const total = repo.staged.length + repo.unstaged.length + untracked.length

  const openFile = (change: FileChange, staged: boolean): void => {
    onSelectFile(`${root}/${change.path}`, {
      workspaceId,
      projectId: repo.projectId,
      relPath: change.path,
      staged,
    })
  }

  const repoMenu = (): MenuItem[] => tidy([
    { label: 'Commit', action: () => commitRef.current?.() },
    { label: 'Refresh', action: onRefresh },
    'separator',
    { label: 'View as List', action: () => onSetViewMode('list'), disabled: viewMode === 'list' },
    { label: 'View as Tree', action: () => onSetViewMode('tree'), disabled: viewMode === 'tree' },
  ])

  const groupProps = {
    viewMode,
    onSetViewMode,
    onStage,
    onUnstage,
    onDiscard: onRequestDiscard,
    onOpenMenu,
  }

  return (
    <section aria-label={repo.projectName}>
      <div style={styles.repoHeader} onContextMenu={(e) => onOpenMenu(e, repoMenu())}>
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
          <CommitInput
            workspaceId={workspaceId}
            projectId={repo.projectId}
            branch={repo.branch}
            hasStaged={repo.staged.length > 0}
            onCommitted={onRefresh}
            commitRef={commitRef}
          />
          {repo.staged.length > 0 && (
            <ScmChangeGroup
              label="Staged Changes"
              changes={repo.staged}
              kind="staged"
              onSelectFile={(change) => openFile(change, true)}
              {...groupProps}
            />
          )}
          {repo.unstaged.length > 0 && (
            <ScmChangeGroup
              label="Changes"
              changes={repo.unstaged}
              kind="unstaged"
              onSelectFile={(change) => openFile(change, false)}
              {...groupProps}
            />
          )}
          {untracked.length > 0 && (
            <ScmChangeGroup
              label="Untracked Changes"
              changes={untracked}
              kind="untracked"
              onSelectFile={(change) => openFile(change, false)}
              {...groupProps}
            />
          )}
          {total === 0 && <div style={styles.cleanRow}>No changes</div>}
        </>
      )}
    </section>
  )
}

/** VS Code's SCM message box: a per-repo input that commits on the button or
 *  Cmd/Ctrl+Enter. It is always present, even on a clean checkout, so the box
 *  never moves out from under a half-typed message when the last change is
 *  staged or discarded. With something staged it commits exactly that; with
 *  nothing staged it asks first, since committing everything is a different act
 *  from the one the staging UI implies. `commitRef` lets the repo header's ✓
 *  fire the same path as the button. */
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
