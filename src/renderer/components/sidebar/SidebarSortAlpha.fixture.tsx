import { ProjectSidebar } from './ProjectSidebar'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

// Two repos, four workspaces: enough for A→Z to visibly group a repo's worktrees
// together and to show a home workspace sorting among them by its own name.
const projects: Project[] = [
  { id: 'p-kong', name: 'kong', path: '/repos/kong', baseBranch: 'main', addedAt: '2026-07-10' },
  { id: 'p-apex', name: 'apex', path: '/repos/apex', baseBranch: 'main', addedAt: '2026-07-11' },
]

// `kong` is the home workspace — the clone itself, drawn with a folder. The rest
// own their own checkout and are drawn with a branch, so the shot also proves
// the two kinds are told apart in a flat list.
const workspaces: Workspace[] = [
  { id: 'w-moss', name: 'moss', projectIds: ['p-kong'], createdAt: '2026-07-12', branchName: 'kong/moss', worktreePaths: { 'p-kong': '/worktrees/moss' } },
  { id: 'w-zed', name: 'zed', projectIds: ['p-apex'], createdAt: '2026-07-13', branchName: 'apex/zed', worktreePaths: { 'p-apex': '/worktrees/zed' } },
  { id: 'w-kong', name: 'kong', projectIds: ['p-kong'], createdAt: '2026-07-14' },
  { id: 'w-dune', name: 'dune', projectIds: ['p-kong'], createdAt: '2026-07-15', branchName: 'kong/dune', worktreePaths: { 'p-kong': '/worktrees/dune' } },
]

// The mode is read from localStorage on mount, so seed it before rendering.
localStorage.setItem('manifold.sidebar.sort.v1', 'alpha')

// The active workspace is last alphabetically: it can only sit at the bottom if
// A→Z really has dropped the recency pin.
export default (
  <div style={{ width: 320, height: 480, background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
    <ProjectSidebar
      projects={projects}
      activeProjectId="p-kong"
      outputtingSessionIds={new Set<string>()}
      onNewProject={() => undefined}
      onNewWorkspace={() => undefined}
      workspaces={workspaces}
      activeWorkspaceId="w-moss"
      sessionsByWorkspace={{}}
      onSelectWorkspace={() => undefined}
      onRenameWorkspace={() => undefined}
      onRemoveWorkspace={async () => undefined}
      onCopyWorkspace={() => undefined}
      onSelectWorkspaceRepo={() => undefined}
      onAddProjectToWorkspace={() => undefined}
      onRemoveProjectFromWorkspace={() => undefined}
      onProjectFetched={() => undefined}
      drafts={[]}
      activeDraftId={null}
      onSelectDraft={() => undefined}
      onDiscardDraft={() => undefined}
    />
  </div>
)
