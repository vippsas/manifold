import React from 'react'
import type { Project } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { DraftAgentItem } from './DraftAgentItem'
import { WorkspaceRepoRow } from './WorkspaceRepoRow'
import { projectFolderKey } from './folder-disclosure'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface WorkspaceCardChildrenProps {
  workspace: Workspace
  /** The repo this workspace spans, when it spans exactly one — the case that
   *  renders files directly instead of a folder row. */
  soloProjectId: string | null
  projectById: (id: string) => Project | undefined
  isActive: boolean
  activeProjectId?: string | null
  behindCounts?: Record<string, number>
  folders: { isOpen: (key: string) => boolean; toggle: (key: string) => void }
  drafts: DraftChat[]
  activeDraftId: string | null
  onSelectRepo?: (workspaceId: string, projectId: string) => void
  onRemoveProject?: (workspaceId: string, projectId: string) => void
  onProjectFetched?: (projectId: string) => void
  onSelectDraft: (id: string) => void
  onDiscardDraft: (id: string) => void
  renderFolderFiles?: (source: FolderSource) => React.ReactNode
}

/** What an open workspace card shows underneath its own row.
 *
 *  Two shapes, decided by how many repos the workspace spans. **One repo:** its
 *  files, directly — a folder row there could only repeat the repo's name, and
 *  the group header above already says it. **Several repos:** one folder row
 *  per repo, each its own files disclosure, because there the names differ and
 *  a row per repo is the only way to reach them. Drafts follow either shape. */
export function WorkspaceCardChildren({
  workspace, soloProjectId, projectById, isActive, activeProjectId, behindCounts,
  folders, drafts, activeDraftId, onSelectRepo, onRemoveProject, onProjectFetched,
  onSelectDraft, onDiscardDraft, renderFolderFiles,
}: WorkspaceCardChildrenProps): React.JSX.Element {
  return (
    <>
      {soloProjectId && renderFolderFiles && (
        <div className="sidebar-project-files" style={sidebarStyles.projectFiles}>
          {renderFolderFiles({ kind: 'project', id: soloProjectId, workspaceId: workspace.id })}
        </div>
      )}

      {!soloProjectId && workspace.projectIds.map((pid) => (
        <WorkspaceRepoRow
          key={`repo-${pid}`}
          workspace={workspace}
          projectId={pid}
          repo={projectById(pid)}
          isActive={isActive && activeProjectId === pid}
          behindCount={behindCounts?.[pid]}
          filesOpen={folders.isOpen(projectFolderKey(pid))}
          onToggleFiles={() => folders.toggle(projectFolderKey(pid))}
          onSelectRepo={onSelectRepo}
          onRemoveProject={onRemoveProject}
          onFetched={onProjectFetched}
          renderFolderFiles={renderFolderFiles}
        />
      ))}

      {drafts.map((draft) => (
        <DraftAgentItem
          key={draft.id}
          draft={draft}
          isActive={draft.id === activeDraftId}
          onSelect={onSelectDraft}
          onDiscard={onDiscardDraft}
        />
      ))}
    </>
  )
}
