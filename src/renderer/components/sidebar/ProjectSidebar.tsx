import React, { useCallback, useContext, useState } from 'react'
import type { Project, AgentSession } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { WorkspaceList } from './WorkspaceList'
import { ProjectList } from './ProjectList'
import { FavoritesList } from './FavoritesList'
import { FilesGlyph } from './FilesGlyph'
import { SourceControlGlyph } from './SourceControlGlyph'
import { DockFileTree } from '../editor/file-tree/DockFileTree'
import { SourceControl } from '../git/SourceControl'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'

type SidebarView = 'explorer' | 'sourceControl' | 'repositories'

interface ProjectSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  suppressedProjectIds?: ReadonlySet<string>
  allProjectSessions: Record<string, AgentSession[]>
  activeSessionId: string | null
  outputtingSessionIds: Set<string>
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onRemoveProject: (id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  onRenameAgent: (sessionId: string, displayName: string) => void
  onRequestDeleteAgent: (session: AgentSession, projectPath: string) => void
  onNewAgent: () => void
  onNewProject: () => void
  /** Open a native folder picker and add the chosen folder (VS Code "Open Folder"). */
  onOpenFolder?: () => void
  onNewWorkspace?: () => void
  workspaces?: Workspace[]
  activeWorkspaceId?: string | null
  sessionsByWorkspace?: Record<string, AgentSession[]>
  onSelectWorkspace?: (id: string) => void
  onRemoveWorkspace?: (id: string) => Promise<void>
  onSelectWorkspaceRepo?: (workspaceId: string, projectId: string) => void
  onAddProjectToWorkspace?: (workspaceId: string) => void
  onRemoveProjectFromWorkspace?: (workspaceId: string, projectId: string) => void
  fetchingProjectId: string | null
  lastFetchedProjectId: string | null
  fetchResult: { updatedBranch: string; commitCount: number } | null
  fetchError: string | null
  onFetchProject: (projectId: string) => void
  activeProjectBehindCount?: number
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
  /** Which activity view to show first. Defaults to the VS Code-style file Explorer. */
  initialView?: SidebarView
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  suppressedProjectIds,
  allProjectSessions,
  activeSessionId,
  outputtingSessionIds,
  onSelectProject,
  onSelectSession,
  onRemoveProject,
  onUpdateProject,
  onRenameAgent,
  onRequestDeleteAgent,
  onNewAgent,
  onNewProject,
  onOpenFolder,
  onNewWorkspace,
  workspaces,
  activeWorkspaceId,
  sessionsByWorkspace,
  onSelectWorkspace,
  onRemoveWorkspace,
  onSelectWorkspaceRepo,
  onAddProjectToWorkspace,
  onRemoveProjectFromWorkspace,
  fetchingProjectId,
  lastFetchedProjectId,
  fetchResult,
  fetchError,
  onFetchProject,
  activeProjectBehindCount,
  drafts,
  activeDraftId,
  onSelectDraft,
  onDiscardDraft,
  initialView = 'explorer',
}: ProjectSidebarProps): React.JSX.Element {
  const [view, setView] = useState<SidebarView>(initialView)
  const dockState = useContext(DockStateContext)

  const handleRemove = useCallback(
    (e: React.MouseEvent, id: string): void => {
      e.stopPropagation()
      onRemoveProject(id)
    },
    [onRemoveProject]
  )

  const activeWorkspace = activeWorkspaceId
    ? workspaces?.find((w) => w.id === activeWorkspaceId)
    : undefined

  // The "+" opens a native folder picker (VS Code "Open Folder" / "Add Folder to
  // Workspace") — the host wires the active-workspace nuance.
  const handleAddFolder = useCallback((): void => {
    onOpenFolder?.()
  }, [onOpenFolder])

  return (
    <div style={sidebarStyles.root}>
      <div style={sidebarStyles.activityBar}>
        <div style={sidebarStyles.activityIcons}>
          <button
            type="button"
            aria-label="Explorer"
            aria-current={view === 'explorer' ? 'page' : undefined}
            aria-pressed={view === 'explorer'}
            title="Explorer"
            onClick={() => setView('explorer')}
            className={`sidebar-activity-icon${view === 'explorer' ? ' sidebar-activity-icon--active' : ''}`}
            style={sidebarStyles.activityIcon}
          >
            <FilesGlyph />
          </button>
          <button
            type="button"
            aria-label="Source Control"
            aria-current={view === 'sourceControl' ? 'page' : undefined}
            aria-pressed={view === 'sourceControl'}
            title="Source Control"
            onClick={() => setView('sourceControl')}
            className={`sidebar-activity-icon${view === 'sourceControl' ? ' sidebar-activity-icon--active' : ''}`}
            style={sidebarStyles.activityIcon}
          >
            <SourceControlGlyph />
          </button>
          <button
            type="button"
            aria-label="Repositories"
            aria-current={view === 'repositories' ? 'page' : undefined}
            aria-pressed={view === 'repositories'}
            title="Repositories & Agents"
            onClick={() => setView('repositories')}
            className={`sidebar-activity-icon${view === 'repositories' ? ' sidebar-activity-icon--active' : ''}`}
            style={sidebarStyles.activityIcon}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
          </button>
          {/* Future activity icons (search, source control, …) go here. */}
        </div>
        <button
          type="button"
          onClick={handleAddFolder}
          aria-label={activeWorkspace ? 'Add folder to workspace' : 'Open folder'}
          title={activeWorkspace ? `Add Folder to ${activeWorkspace.name}` : 'Open Folder'}
          className="sidebar-activity-icon"
          style={sidebarStyles.activityIcon}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {view === 'explorer' ? (
        <div style={sidebarStyles.explorer}>
          {dockState ? (
            <DockFileTree />
          ) : (
            <div style={sidebarStyles.empty}>No folder open</div>
          )}
        </div>
      ) : view === 'sourceControl' ? (
        <div style={sidebarStyles.explorer}>
          {dockState ? (
            <SourceControl />
          ) : (
            <div style={sidebarStyles.empty}>No active repository</div>
          )}
        </div>
      ) : (
        <>
          <FavoritesList />
          {workspaces && onSelectWorkspace && onRemoveWorkspace && (
            <WorkspaceList
              workspaces={workspaces}
              projects={projects}
              activeWorkspaceId={activeWorkspaceId ?? null}
              sessionsByWorkspace={sessionsByWorkspace ?? {}}
              activeSessionId={activeSessionId}
              outputtingSessionIds={outputtingSessionIds}
              onSelectWorkspace={onSelectWorkspace}
              onRemoveWorkspace={onRemoveWorkspace}
              onNewWorkspace={onNewWorkspace}
              onSelectSession={onSelectSession}
              onSelectRepo={onSelectWorkspaceRepo}
              activeProjectId={activeProjectId}
              onAddProject={onAddProjectToWorkspace}
              onRemoveProject={onRemoveProjectFromWorkspace}
              onDeleteAgent={onRequestDeleteAgent}
              onRenameAgent={onRenameAgent}
              onFetchProject={onFetchProject}
              fetchingProjectId={fetchingProjectId}
              lastFetchedProjectId={lastFetchedProjectId}
              fetchResult={fetchResult}
              fetchError={fetchError}
            />
          )}
          <ProjectList
            projects={projects}
            activeProjectId={activeProjectId}
            activeWorkspaceId={activeWorkspaceId}
            suppressedProjectIds={suppressedProjectIds}
            allProjectSessions={allProjectSessions}
            activeSessionId={activeSessionId}
            outputtingSessionIds={outputtingSessionIds}
            onSelectProject={onSelectProject}
            onSelectSession={onSelectSession}
            onRequestDeleteAgent={onRequestDeleteAgent}
            onRemove={handleRemove}
            onUpdateProject={onUpdateProject}
            onRenameAgent={onRenameAgent}
            fetchingProjectId={fetchingProjectId}
            lastFetchedProjectId={lastFetchedProjectId}
            fetchResult={fetchResult}
            fetchError={fetchError}
            onFetchProject={onFetchProject}
            activeProjectBehindCount={activeProjectBehindCount}
            onNewAgent={onNewAgent}
            drafts={drafts}
            activeDraftId={activeDraftId}
            onSelectDraft={onSelectDraft}
            onDiscardDraft={onDiscardDraft}
          />
          <div style={sidebarStyles.actions}>
            <div style={sidebarStyles.actionsRow}>
              <button
                type="button"
                onClick={onNewAgent}
                className="sidebar-action-button sidebar-action-button--primary"
                style={sidebarStyles.actionButtonPrimary}
                title={activeWorkspace ? `New Agent in ${activeWorkspace.name}` : 'New Agent'}
              >
                <span className="truncate">{activeWorkspace ? `+ New Agent in ${activeWorkspace.name}` : '+ New Agent'}</span>
              </button>
              <button type="button" onClick={onNewProject} className="sidebar-action-button" style={sidebarStyles.actionButton}>
                + New Repository
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
