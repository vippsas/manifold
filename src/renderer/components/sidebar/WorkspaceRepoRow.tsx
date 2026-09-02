import React from 'react'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { isGitProject } from '../../../shared/project-kind'
import { sidebarStyles } from './ProjectSidebar.styles'
import { FilesChevronGlyph } from './SidebarCardActionGlyphs'
import { RepoFetchButton } from './RepoFetchButton'
import { useFetchProject } from '../../hooks/project/useFetchProject'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'

export interface WorkspaceRepoRowProps {
  workspace: Workspace
  projectId: string
  repo: Project | undefined
  /** True when this row's workspace is the active one and this is its home folder. */
  isActive: boolean
  /** How far the repo's base branch trails origin, if anyone has measured. */
  behindCount?: number
  filesOpen: boolean
  onToggleFiles: () => void
  onSelectRepo?: (workspaceId: string, projectId: string) => void
  onRemoveProject?: (workspaceId: string, projectId: string) => void
  /** Told once a fetch lands, so whoever owns the behind count can clear it. */
  onFetched?: (projectId: string) => void
  renderFolderFiles?: (source: FolderSource) => React.ReactNode
}

/** One folder of an open workspace card, with its file tree underneath while
 *  disclosed. Like an agent row: the row picks the workspace's home folder and
 *  opens its files, the chevron opens them without moving home. */
export function WorkspaceRepoRow({
  workspace,
  projectId,
  repo,
  isActive,
  behindCount = 0,
  filesOpen,
  onToggleFiles,
  onSelectRepo,
  onRemoveProject,
  onFetched,
  renderFolderFiles,
}: WorkspaceRepoRowProps): React.JSX.Element {
  const repoName = repo?.name ?? projectId
  // In a worktree workspace this row is the workspace's own checkout of the
  // repo, not the clone — that is where its agents' edits land.
  const folderPath = workspace.worktreePaths?.[projectId] ?? repo?.path ?? projectId
  const fetch = useFetchProject(projectId, onFetched)
  const selectAndDisclose = (): void => {
    onSelectRepo?.(workspace.id, projectId)
    onToggleFiles()
  }

  return (
    <>
      <div
        className={`sidebar-item-row sidebar-repo-row${isActive ? ' sidebar-item-row--active' : ''}`}
        style={{
          ...sidebarStyles.item,
          ...(isActive ? sidebarStyles.itemActive : undefined),
          paddingLeft: 'var(--sidebar-indent-repo)',
        }}
        title={folderPath}
        role="button"
        tabIndex={0}
        aria-expanded={filesOpen}
        onClick={selectAndDisclose}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectAndDisclose() } }}
      >
        {/* Outside the label, in the row's own twistie column, so it sits
            directly under the workspace's chevron and directly above its files'. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFiles() }}
          onKeyDown={(e) => e.stopPropagation()}
          className="sidebar-files-toggle"
          aria-expanded={filesOpen}
          aria-label={`${filesOpen ? 'Hide' : 'Show'} files in ${repoName}`}
          title="Folder files"
        >
          <FilesChevronGlyph expanded={filesOpen} />
        </button>
        <span className="truncate sidebar-row-label" style={sidebarStyles.itemName}>
          <span className="truncate">{repoName}</span>
        </span>
        <div className="sidebar-item-actions" style={sidebarStyles.itemRight}>
          {isGitProject(repo) && repo && (
            <RepoFetchButton
              repoName={repoName}
              baseBranch={repo.baseBranch}
              behindCount={behindCount}
              isFetching={fetch.isFetching}
              onFetch={() => { void fetch.fetchProject() }}
            />
          )}
          {onRemoveProject && workspace.projectIds.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemoveProject(workspace.id, projectId) }}
              onKeyDown={(e) => e.stopPropagation()}
              className="sidebar-icon-button"
              style={sidebarStyles.removeButton}
              aria-label={`Remove ${repoName} from workspace`}
              title="Remove folder from workspace"
            >
              &times;
            </button>
          )}
        </div>
      </div>
      {(fetch.result || fetch.error) && (
        <div style={sidebarStyles.fetchMessage}>
          {fetch.error ?? (fetch.result!.commitCount > 0
            ? `Updated ${fetch.result!.updatedBranch}: ${fetch.result!.commitCount} new commit${fetch.result!.commitCount === 1 ? '' : 's'}`
            : `${fetch.result!.updatedBranch} is up to date`)}
        </div>
      )}
      {filesOpen && renderFolderFiles && (
        <div className="sidebar-project-files" style={sidebarStyles.projectFiles}>
          {renderFolderFiles({ kind: 'project', id: projectId, workspaceId: workspace.id })}
        </div>
      )}
    </>
  )
}
