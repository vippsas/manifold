import React, { useState } from 'react'
import type { AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { WorkspaceCard, type WorkspaceCardProps } from './WorkspaceCard'
import { RepoGroupHeader } from './RepoGroupHeader'
import { MergedFold } from './MergedFold'
import { groupStatuses, type RepoGroup as RepoGroupModel } from './sidebar-groups'
import { workspaceFoldKey } from './sidebar-fold-state'

/** Everything a card needs that is the same for every card in the list. */
export type CardCommonProps = Omit<
  WorkspaceCardProps,
  'workspace' | 'isActive' | 'expanded' | 'onToggleExpanded' | 'sessions' | 'drafts' | 'nested' | 'summary' | 'labelOverride'
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

/** One repo's family: a `RepoGroupHeader` heads it and every workspace —
 *  the clone first, then its branches — hangs underneath as a peer card.
 *
 *  The header is deliberately *not* the clone. When it was (the shipped shape
 *  of #939/#940), one chevron had to fold both the clone's own contents and the
 *  repo's other branches, so a clone's folder row and a branch card landed at
 *  neighbouring indents and the tree read as a flat run of look-alike rows —
 *  two of them repeating the repo's name. Splitting them gives every chevron
 *  exactly one job, and puts every workspace of a repo at one depth. Merged
 *  branches still sit behind `MergedFold`. */
export function RepoGroup({ group, folds, filtering, activeWorkspaceId, sessionsFor, draftsFor, card }: RepoGroupProps): React.JSX.Element {
  const [showMerged, setShowMerged] = useState(false)
  const expanded = filtering || folds.isOpen(group.foldKey)
  // A branch can be marked merged while you are still sitting in it — its agent
  // only has to be finished, not gone. Folding it away then hides the workspace
  // the user is *in*, so the active row overrides the fold and the disclosure
  // reads as open (it cannot be closed again until they leave).
  const revealMerged = showMerged || group.merged.some((w) => w.id === activeWorkspaceId)
  // The header is not a workspace, so its summary counts every card below it,
  // the clone included — and its dots are drawn from exactly those same
  // members, so the two halves of one summary can never disagree.
  const members = [group.home, ...group.worktrees, ...group.merged].filter((w): w is Workspace => w !== null)
  const summary = { count: members.length, statuses: groupStatuses(members.map(sessionsFor)) }

  const renderCard = (
    workspace: Workspace,
    nested: boolean,
    cardExpanded: boolean,
    onToggle: () => void,
    labelOverride?: string,
  ): React.JSX.Element => (
    <WorkspaceCard
      key={workspace.id}
      {...card}
      workspace={workspace}
      nested={nested}
      labelOverride={labelOverride}
      isActive={workspace.id === activeWorkspaceId}
      expanded={cardExpanded}
      onToggleExpanded={onToggle}
      sessions={sessionsFor(workspace)}
      drafts={draftsFor(workspace)}
    />
  )

  const renderNested = (workspace: Workspace, labelOverride?: string): React.JSX.Element => {
    const key = workspaceFoldKey(workspace.id)
    return renderCard(workspace, true, folds.isOpen(key), () => folds.toggle(key), labelOverride)
  }

  // The clone carries no branch of its own in the model — it sits on whatever
  // is checked out in the folder — so where its name would only repeat the
  // repo's, the row reads as the repo's base branch instead: the one thing we
  // know without a git call per repo, and the question the row is really
  // answering now that the header says the repo.
  //
  // A clone the user *renamed* keeps that name. Their name is information the
  // base branch does not carry, and this row is the only place it appears.
  const cloneLabel = ((): string | undefined => {
    if (!group.home) return undefined
    // No resolved repo means no header naming it, so the override has nothing
    // to de-duplicate and the workspace's own name is the only name it has.
    if (!group.projectId) return undefined
    const named = group.home.name.trim().toLowerCase() !== group.repoName.trim().toLowerCase()
    if (named) return undefined
    // No base branch configured (a plain folder, or a repo added before one was
    // recorded) would otherwise fall back to the workspace's own name — which
    // is the repo's name, the duplication the header exists to remove. Say what
    // the row *is* instead.
    return card.projects.find((p) => p.id === group.projectId)?.baseBranch || 'clone'
  })()

  return (
    <div className="sidebar-repo-group">
      <RepoGroupHeader
        name={group.repoName}
        expanded={expanded}
        onToggle={() => folds.toggle(group.foldKey)}
        summary={summary}
      />
      {expanded && group.home && renderNested(group.home, cloneLabel)}
      {expanded && group.worktrees.map((w) => renderNested(w))}
      {expanded && group.merged.length > 0 && (
        <>
          <MergedFold count={group.merged.length} shown={revealMerged} onToggle={() => setShowMerged((s) => !s)} />
          {revealMerged && <div className="sidebar-merged-cards">{group.merged.map((w) => renderNested(w))}</div>}
        </>
      )}
    </div>
  )
}
