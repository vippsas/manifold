import React, { useEffect, useState } from 'react'
import type { AgentSession, FileChange, AheadBehind } from '../../../shared/types'
import type { GitSyncResult } from '../../../shared/workspace-types'
import { BranchSwitcher } from './BranchSwitcher'
import { GitSyncFailureDialog } from './GitSyncFailureDialog'

interface StatusBarBranchTarget {
  workspaceId: string
  projectId: string
  repoName: string
  currentBranch: string
  upstreamAheadBehind?: AheadBehind
  onCheckedOut: () => void
  onSync: () => Promise<GitSyncResult>
  onShowCommandOutput: (output: string) => void
}

interface StatusBarProps {
  activeSession: AgentSession | null
  changedFiles: FileChange[]
  baseBranch: string
  projectIsGit?: boolean
  conflicts?: string[]
  aheadBehind?: AheadBehind
  onCommit?: () => void
  onCreatePR?: () => void
  onShowConflicts?: () => void
  showCommitAndPrButtons?: boolean
  branchTarget?: StatusBarBranchTarget
}

export function StatusBar({
  activeSession,
  changedFiles,
  baseBranch,
  projectIsGit = true,
  conflicts = [],
  aheadBehind,
  onCommit,
  onCreatePR,
  onShowConflicts,
  showCommitAndPrButtons = false,
  branchTarget,
}: StatusBarProps): React.JSX.Element {
  const hasConflicts = conflicts.length > 0
  const hasChanges = changedFiles.length > 0
  const hasAhead = (aheadBehind?.ahead ?? 0) > 0
  const [syncing, setSyncing] = useState(false)
  const [syncFailure, setSyncFailure] = useState<Extract<GitSyncResult, { ok: false }> | null>(null)

  useEffect(() => {
    setSyncFailure(null)
  }, [branchTarget?.workspaceId, branchTarget?.projectId, branchTarget?.currentBranch])

  const syncChanges = async (): Promise<void> => {
    if (!branchTarget || syncing) return
    setSyncing(true)
    setSyncFailure(null)
    try {
      const result = await branchTarget.onSync()
      if (!result.ok) setSyncFailure(result)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setSyncFailure({ ok: false, failedCommand: 'pull', message, output: message })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="layout-status-bar">
      {branchTarget && (
        <>
          <BranchSwitcher
            workspaceId={branchTarget.workspaceId}
            projectId={branchTarget.projectId}
            repoName={branchTarget.repoName}
            currentBranch={branchTarget.currentBranch}
            onCheckedOut={branchTarget.onCheckedOut}
            triggerVariant="statusbar"
          />
          {branchTarget.upstreamAheadBehind && (
            <button
              type="button"
              className={`statusbar-button statusbar-sync-button${syncFailure ? ' statusbar-sync-button--error' : ''}`}
              onClick={() => { void syncChanges() }}
              disabled={syncing}
              title={syncFailure?.message ?? `Sync changes — ${branchTarget.upstreamAheadBehind.behind} commit${branchTarget.upstreamAheadBehind.behind === 1 ? '' : 's'} behind, ${branchTarget.upstreamAheadBehind.ahead} ahead`}
              aria-label={syncing ? 'Syncing changes' : syncFailure ? `Sync failed: ${syncFailure.message}` : `Sync changes: ${branchTarget.upstreamAheadBehind.behind} behind, ${branchTarget.upstreamAheadBehind.ahead} ahead`}
            >
              {syncing
                ? <span className="spinner" aria-hidden="true" />
                : <SyncGlyph />}
              <span className="statusbar-sync-count">
                {branchTarget.upstreamAheadBehind.behind}
                <span aria-hidden="true">↓</span>
              </span>
              <span className="statusbar-sync-count">
                {branchTarget.upstreamAheadBehind.ahead}
                <span aria-hidden="true">↑</span>
              </span>
            </button>
          )}
        </>
      )}
      {activeSession ? (
        <>
          {!branchTarget && (
            <span className="statusbar-item">
              <span className="mono truncate statusbar-branch">{activeSession.branchName}</span>
            </span>
          )}
          <span className="statusbar-item" title={`Agent ${activeSession.status}`}>
            <span className={`status-dot status-dot--${activeSession.status}`} />
            {changedFiles.length} file{changedFiles.length !== 1 ? 's' : ''} changed
          </span>
        </>
      ) : (
        <span className="statusbar-item">No active agent</span>
      )}
      {activeSession && (
        <span className="statusbar-group">
          {hasConflicts && onShowConflicts ? (
            <button
              type="button"
              onClick={onShowConflicts}
              className="statusbar-button statusbar-button--warning"
              title="Resolve merge conflicts"
            >
              Conflicts ({conflicts.length})
            </button>
          ) : showCommitAndPrButtons && hasChanges && onCommit ? (
            <button
              type="button"
              onClick={onCommit}
              className="statusbar-button statusbar-button--success"
              title="Commit changes"
            >
              Commit
            </button>
          ) : null}
          {showCommitAndPrButtons && hasAhead && onCreatePR && (
            <button
              type="button"
              onClick={onCreatePR}
              className="statusbar-button statusbar-button--accent"
              title="Create pull request"
            >
              Create PR
            </button>
          )}
        </span>
      )}
      <span className="statusbar-spacer" />
      {projectIsGit && (
        <span className="statusbar-item">
          base: <span className="mono">{baseBranch}</span>
        </span>
      )}
      {branchTarget && syncFailure && (
        <GitSyncFailureDialog
          repoName={branchTarget.repoName}
          failure={syncFailure}
          onClose={() => setSyncFailure(null)}
          onShowCommandOutput={() => {
            branchTarget.onShowCommandOutput(syncFailure.output)
            setSyncFailure(null)
          }}
        />
      )}
    </div>
  )
}

function SyncGlyph(): React.JSX.Element {
  return (
    <svg
      className="statusbar-sync-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <path d="M14 3.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1h2.08A5 5 0 0 0 3.19 6.64a.5.5 0 0 1-.96-.28A6 6 0 0 1 13 4.69V3.5a.5.5 0 0 1 1 0Zm-.58 5.52a.5.5 0 0 0-.62.35 5 5 0 0 1-9.39.64h2.08a.5.5 0 0 0 0-1h-3a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-1.19A6 6 0 0 0 13.76 9.65a.5.5 0 0 0-.34-.63Z" />
    </svg>
  )
}
