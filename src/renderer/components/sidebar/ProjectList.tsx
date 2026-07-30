import React, { useCallback } from 'react'
import type { Project, AgentSession, AgentSettingsUpdate } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import { DraftAgentItem } from './DraftAgentItem'
import { filterStandaloneProjectSessions } from '../../session-selection'
import { sidebarStyles } from './ProjectSidebar.styles'
import { AgentItem } from './AgentItem'
import { ProjectItem } from './ProjectItem'
import { dedupeSessionsByWorktree } from '../../hooks/agent-session/agent-siblings'
import { sortByRecency, useProjectRecency } from './sidebar-recency'
import { projectFolderKey, useFolderDisclosure, worktreeFolderKey } from './folder-disclosure'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface ProjectListProps {
  projects: Project[]
  activeProjectId: string | null
  activeWorkspaceId?: string | null
  suppressedProjectIds?: ReadonlySet<string>
  allProjectSessions: Record<string, AgentSession[]>
  activeSessionId: string | null
  outputtingSessionIds: Set<string>
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onRequestDeleteAgent: (session: AgentSession, projectPath: string) => void
  onRenameAgent: (sessionId: string, settings: AgentSettingsUpdate) => Promise<void> | void
  onRemove: (e: React.MouseEvent, id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  onNewAgent: (projectId?: string, workspaceId?: string) => void
  onCreateWorkspaceFromProject?: (projectId: string) => Promise<void>
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
  /** Renders a folder's file tree under its row while it is open. Injected by
   *  the dock panel so the sidebar stays free of editor/file plumbing. */
  renderFolderFiles?: (source: FolderSource) => React.ReactNode
}

export function ProjectList({
  projects,
  activeProjectId: activeProjectIdProp,
  activeWorkspaceId,
  suppressedProjectIds,
  allProjectSessions,
  activeSessionId,
  outputtingSessionIds,
  onSelectProject,
  onSelectSession,
  onRequestDeleteAgent,
  onRenameAgent,
  onRemove,
  onUpdateProject,
  onNewAgent,
  onCreateWorkspaceFromProject,
  drafts,
  activeDraftId,
  onSelectDraft,
  onDiscardDraft,
  renderFolderFiles,
}: ProjectListProps): React.JSX.Element {
  const { recency, touchProject } = useProjectRecency()
  const folders = useFolderDisclosure()
  const visibleProjects = projects.filter((project) => !suppressedProjectIds?.has(project.id))

  // While a workspace is focused, its repos and sessions are shown under the
  // Workspaces section. Don't also highlight the workspace's home repo as an
  // active standalone project here — that double-highlights one repo.
  const activeProjectId = activeWorkspaceId ? null : activeProjectIdProp

  // Clicking a repo only opens its folder. It deliberately does not activate the
  // project: that would switch sessions and reload the agent, the editor and the
  // tree, and it would reorder this list under the cursor — a lot of motion for
  // "show me these files". Agent rows still switch sessions.
  const handleProjectClick = useCallback(
    (projectId: string): void => { folders.toggle(projectFolderKey(projectId)) },
    [folders]
  )

  const orderedProjects = sortByRecency(visibleProjects, recency)

  const renderProjectCard = (project: Project): React.JSX.Element => {
    const isActive = project.id === activeProjectId
    const projectSessions = filterStandaloneProjectSessions(allProjectSessions[project.id] ?? [])
    const activeWorktreePath = isActive
      ? projectSessions.find((s) => s.id === activeSessionId)?.worktreePath ?? null
      : null
    const primarySessions = dedupeSessionsByWorktree(projectSessions)
    const checkoutOpen = folders.isOpen(projectFolderKey(project.id))
    return (
      <div className={`sidebar-project-group sidebar-project-group--has-agents${isActive ? ' sidebar-project-group--active' : ''}`}>
        <ProjectItem
          project={project}
          isFilesExpanded={checkoutOpen}
          onSelect={handleProjectClick}
          onRemove={onRemove}
          onRename={(name) => onUpdateProject(project.id, { name })}
          onAddFolder={onCreateWorkspaceFromProject
            ? () => onCreateWorkspaceFromProject(project.id)
            : undefined}
          onAddAgent={() => onNewAgent(project.id)}
        />
        {checkoutOpen && renderFolderFiles && (
          <div className="sidebar-project-files" style={sidebarStyles.projectFiles}>
            {renderFolderFiles({ kind: 'project', id: project.id })}
          </div>
        )}
        {primarySessions.map((session) => {
          const siblingOutputting = projectSessions.some(
            (s) => s.worktreePath === session.worktreePath && outputtingSessionIds.has(s.id),
          )
          // An in-place agent works in the repo's own checkout, which the repo
          // row already opens — it has no second folder of its own.
          const hasOwnWorktree = session.worktreePath !== '' && session.worktreePath !== project.path
          const worktreeOpen = hasOwnWorktree && folders.isOpen(worktreeFolderKey(session.id))
          return (
            <React.Fragment key={session.id}>
              <AgentItem
                session={session}
                projectPath={project.path}
                isActive={session.worktreePath !== '' && session.worktreePath === activeWorktreePath}
                isOutputting={siblingOutputting}
                isFilesExpanded={worktreeOpen}
                onToggleFiles={hasOwnWorktree
                  ? () => folders.toggle(worktreeFolderKey(session.id))
                  : undefined}
                onSelect={(sessionId) => { touchProject(project.id); onSelectSession(sessionId, project.id) }}
                onDelete={() => onRequestDeleteAgent(session, project.path)}
                onRename={(settings) => onRenameAgent(session.id, settings)}
              />
              {worktreeOpen && renderFolderFiles && (
                <div className="sidebar-project-files sidebar-project-files--worktree" style={sidebarStyles.worktreeFiles}>
                  {renderFolderFiles({ kind: 'session', id: session.id })}
                </div>
              )}
            </React.Fragment>
          )
        })}
        {drafts
          .filter((d) => d.projectId === project.id)
          .map((d) => (
            <DraftAgentItem
              key={d.id}
              draft={d}
              isActive={d.id === activeDraftId}
              onSelect={onSelectDraft}
              onDiscard={onDiscardDraft}
            />
          ))}
      </div>
    )
  }

  if (visibleProjects.length === 0) {
    // Repos living inside workspaces are suppressed from this standalone
    // list, so an empty list doesn't mean there are no repositories — only
    // claim that when none exist anywhere.
    if (projects.length > 0) return <></>
    return (
      <div style={sidebarStyles.list}>
        <div style={sidebarStyles.empty}>No repositories yet</div>
      </div>
    )
  }

  return (
    <div style={sidebarStyles.list}>
      {orderedProjects.map((project) => {
        return <React.Fragment key={project.id}>{renderProjectCard(project)}</React.Fragment>
      })}
    </div>
  )
}
