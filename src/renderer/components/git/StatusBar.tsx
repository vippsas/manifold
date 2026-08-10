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
                <ArrowGlyph direction="down" />
                {branchTarget.upstreamAheadBehind.behind}
              </span>
              <span className="statusbar-sync-count">
                <ArrowGlyph direction="up" />
                {branchTarget.upstreamAheadBehind.ahead}
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
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 7h-5V2" />
      <path d="M4 17h5v5" />
      <path d="M5.1 9a8 8 0 0 1 13.2-3L20 7" />
      <path d="M18.9 15a8 8 0 0 1-13.2 3L4 17" />
    </svg>
  )
}

function ArrowGlyph({ direction }: { direction: 'up' | 'down' }): React.JSX.Element {
  return (
    <svg
      className="statusbar-sync-arrow"
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {direction === 'down'
        ? <path d="M6 1.5v9m0 0L2.5 7M6 10.5 9.5 7" />
        : <path d="M6 10.5v-9m0 0L2.5 5M6 1.5 9.5 5" />}
    </svg>
  )
}
