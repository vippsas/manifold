import React, { useState } from 'react'
import type { AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { WorkspaceCard, type WorkspaceCardProps } from './WorkspaceCard'
import { RepoGroupHeader } from './RepoGroupHeader'
import { MergedFold } from './MergedFold'
import { groupStatuses, type RepoGroup as RepoGroupModel } from './sidebar-groups'
import { workspaceFoldKey } from './sidebar-fold-state'
import type { RowStatus } from './agent-labels'

/** Everything a card needs that is the same for every card in the list. */
export type CardCommonProps = Omit<
  WorkspaceCardProps,
  'workspace' | 'isActive' | 'expanded' | 'onToggleExpanded' | 'sessions' | 'drafts' | 'nested' | 'summary'
>

export interface RepoGroupProps {
  group: RepoGroupModel
  folds: { isOpen: (key: string) => boolean; toggle: (key: string) => void }
  /** Filtering forces the group open; the merged fold is already gone from a
   *  filtered group (filterGroups moves hits inline). */
  filtering: boolean
  activeWorkspaceId: string | null
  sessionsFor: (workspace: Workspace) => AgentSession[]
  draftsFor: (workspace: Workspace) => DraftChat[]
  card: CardCommonProps
}

/** One repo's family: the home card heads it and its disclosure folds the
 *  worktree cards beneath (spec decision 2). A repo with branches but no home
 *  gets a synthetic header instead. Merged branches sit behind `MergedFold`. */
export function RepoGroup({ group, folds, filtering, activeWorkspaceId, sessionsFor, draftsFor, card }: RepoGroupProps): React.JSX.Element {
  const [showMerged, setShowMerged] = useState(false)
  const expanded = filtering || folds.isOpen(group.foldKey)
  // A branch can be marked merged while you are still sitting in it — its agent
  // only has to be finished, not gone. Folding it away then hides the workspace
  // the user is *in*, so the active row overrides the fold and the disclosure
  // reads as open (it cannot be closed again until they leave).
  const revealMerged = showMerged || group.merged.some((w) => w.id === activeWorkspaceId)
  const summary = {
    count: group.worktrees.length + group.merged.length,
    statuses: groupStatuses([...group.worktrees, ...group.merged].map(sessionsFor)),
  }

  const renderCard = (
    workspace: Workspace,
    nested: boolean,
    cardExpanded: boolean,
    onToggle: () => void,
    cardSummary?: { count: number; statuses: RowStatus[] },
  ): React.JSX.Element => (
    <WorkspaceCard
      key={workspace.id}
      {...card}
      workspace={workspace}
      nested={nested}
      summary={cardSummary}
      isActive={workspace.id === activeWorkspaceId}
      expanded={cardExpanded}
      onToggleExpanded={onToggle}
      sessions={sessionsFor(workspace)}
      drafts={draftsFor(workspace)}
    />
  )

  const renderNested = (workspace: Workspace): React.JSX.Element => {
    const key = workspaceFoldKey(workspace.id)
    return renderCard(workspace, true, folds.isOpen(key), () => folds.toggle(key))
  }

  return (
    <div className="sidebar-repo-group">
      {group.home
        ? renderCard(group.home, false, expanded, () => folds.toggle(group.foldKey), summary)
        : <RepoGroupHeader name={group.repoName} expanded={expanded} onToggle={() => folds.toggle(group.foldKey)} summary={summary} />}
      {expanded && group.worktrees.map(renderNested)}
      {expanded && group.merged.length > 0 && (
        <>
          <MergedFold count={group.merged.length} shown={revealMerged} onToggle={() => setShowMerged((s) => !s)} />
          {revealMerged && <div className="sidebar-merged-cards">{group.merged.map(renderNested)}</div>}
        </>
      )}
    </div>
  )
}
