import React, { useState } from 'react'
import type { AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { WorkspaceCard, type WorkspaceCardProps } from './WorkspaceCard'
import { RepoGroupHeader } from './RepoGroupHeader'
import { MergedFold } from './MergedFold'
import { groupMembers, groupStatuses, type RepoGroup as RepoGroupModel } from './sidebar-groups'
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
  const summary = {
    count: group.worktrees.length + group.merged.length,
    statuses: groupStatuses(groupMembers(group).map(sessionsFor)),
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
    return renderCard(workspace, true, filtering || folds.isOpen(key), () => folds.toggle(key))
  }

  return (
    <div className="sidebar-repo-group">
      {group.home
        ? renderCard(group.home, false, expanded, () => folds.toggle(group.foldKey), summary)
        : <RepoGroupHeader name={group.repoName} expanded={expanded} onToggle={() => folds.toggle(group.foldKey)} summary={summary} />}
      {expanded && group.worktrees.map(renderNested)}
      {expanded && group.merged.length > 0 && (
        <>
          <MergedFold count={group.merged.length} shown={showMerged} onToggle={() => setShowMerged((s) => !s)} />
          {showMerged && <div className="sidebar-merged-cards">{group.merged.map(renderNested)}</div>}
        </>
      )}
    </div>
  )
}
