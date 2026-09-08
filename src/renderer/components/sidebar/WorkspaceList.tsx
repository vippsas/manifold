import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { RepoGroup, type CardCommonProps } from './RepoGroup'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import { useSidebarSectionState } from './sidebar-section-state'
import { useWorkspaceFolds, workspaceFoldKey } from './sidebar-fold-state'
import { filterGroups, groupMembers, groupWorkspaces, liveWorkspaceIds } from './sidebar-groups'
import type { ProjectRecency } from './sidebar-recency'
import type { SidebarSortMode } from './sidebar-sort'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface WorkspaceListProps {
  workspaces: Workspace[]
  projects: Project[]
  /** How the list is ordered. Owned by ProjectSidebar, which renders the toggle. */
  sortMode: SidebarSortMode
  /** Owned by ProjectSidebar so the Working-now section orders by the same clock. */
  recency: ProjectRecency
  touchProject: (workspaceId: string) => void
  /** Worktree workspaces whose branch is merged; folded behind one row per repo. */
  mergedIds: ReadonlySet<string>
  /** Live filter text; blank means no filter. */
  filter: string
  activeWorkspaceId: string | null
  activeProjectId?: string | null
  sessionsByWorkspace: Record<string, AgentSession[]>
  outputtingSessionIds?: Set<string>
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectWorkspace: (id: string) => void
  onRenameWorkspace?: (id: string, name: string) => void
  onRemoveWorkspace: (id: string) => Promise<void>
  onCopyWorkspace?: (id: string) => void
  onSelectRepo?: (workspaceId: string, projectId: string) => void
  onAddProject?: (workspaceId: string) => void | Promise<void>
  onRemoveProject?: (workspaceId: string, projectId: string) => void
  behindCounts?: Record<string, number>
  onProjectFetched?: (projectId: string) => void
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
  /** Renders a folder's file tree under its row while it is open. Injected by
   *  the dock panel so the sidebar stays free of editor/file plumbing. */
  renderFolderFiles?: (source: FolderSource) => React.ReactNode
}

/** The Repositories section: one group per repo, headed by its home workspace
 *  with the worktree workspaces cut off it nested beneath (#939/#940). Every
 *  repo lives in a workspace, so this is still the only list of roots there is. */
export function WorkspaceList({
  workspaces, projects, sortMode, recency, touchProject, mergedIds, filter,
  activeWorkspaceId, activeProjectId, sessionsByWorkspace, outputtingSessionIds,
  drafts, activeDraftId, onSelectWorkspace, onRenameWorkspace, onRemoveWorkspace,
  onCopyWorkspace, onSelectRepo, onAddProject, onRemoveProject, behindCounts,
  onProjectFetched, onSelectDraft, onDiscardDraft, renderFolderFiles,
}: WorkspaceListProps): React.JSX.Element {
  const folds = useWorkspaceFolds()
  const [sectionOpen, toggleSection] = useSidebarSectionState('repositories', true)
  const filtering = filter.trim() !== ''

  const liveIds = useMemo(() => liveWorkspaceIds(sessionsByWorkspace), [sessionsByWorkspace])
  const groups = useMemo(
    () => groupWorkspaces(workspaces, projects, { mode: sortMode, recency, activeId: activeWorkspaceId, mergedIds, liveIds }),
    [workspaces, projects, sortMode, recency, activeWorkspaceId, mergedIds, liveIds],
  )
  const visible = useMemo(() => (filtering ? filterGroups(groups, filter) : groups), [groups, filter, filtering])

  // Entering a workspace leaves the recency trail *and* reveals it: its own
  // card and the group it sits in open, the way an editor reveals a file. Read
  // through a ref so a reorder never re-runs the reveal.
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  useEffect(() => {
    if (!activeWorkspaceId) return
    touchProject(activeWorkspaceId)
    folds.open(workspaceFoldKey(activeWorkspaceId))
    const group = groupsRef.current.find((g) => groupMembers(g).some((w) => w.id === activeWorkspaceId))
    if (group) folds.open(group.foldKey)
  }, [activeWorkspaceId, touchProject, folds.open])

  const handleRemove = useCallback((id: string): void => { void onRemoveWorkspace(id) }, [onRemoveWorkspace])
  const sessionsFor = useCallback((w: Workspace) => sessionsByWorkspace[w.id] ?? [], [sessionsByWorkspace])
  const draftsFor = useCallback((w: Workspace) => drafts.filter((d) => w.projectIds.includes(d.projectId)), [drafts])

  if (workspaces.length === 0) {
    return (
      <div style={sidebarStyles.list}>
        <div style={sidebarStyles.empty}>No repositories yet</div>
      </div>
    )
  }

  const card: CardCommonProps = {
    projects, activeProjectId, outputtingSessionIds, activeDraftId,
    onSelectWorkspace, onRenameWorkspace, onRemoveWorkspace: handleRemove, onCopyWorkspace,
    onSelectRepo, onAddProject, onRemoveProject, behindCounts, onProjectFetched,
    onSelectDraft, onDiscardDraft, renderFolderFiles,
  }

  return (
    <div style={{ paddingTop: 4 }}>
      <SidebarSectionHeader label="Repositories" count={visible.length} expanded={sectionOpen} onToggle={toggleSection} />
      {sectionOpen && filtering && visible.length === 0 && (
        <div style={sidebarStyles.empty}>No matches</div>
      )}
      {sectionOpen && visible.map((group) => (
        <RepoGroup
          key={group.foldKey}
          group={group}
          folds={folds}
          filtering={filtering}
          activeWorkspaceId={activeWorkspaceId}
          sessionsFor={sessionsFor}
          draftsFor={draftsFor}
          card={card}
        />
      ))}
    </div>
  )
}
