import { ProjectSidebar } from './ProjectSidebar'
import { FileTree } from '../editor/file-tree/FileTree'
import type { AgentSession, FileTreeNode, Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

const projects: Project[] = [
  { id: 'frontend', name: 'storefront', path: '/projects/storefront', baseBranch: 'main', addedAt: '2026-07-10' },
  { id: 'backend', name: 'commerce-api', path: '/projects/commerce-api', baseBranch: 'main', addedAt: '2026-07-11' },
  { id: 'docs', name: 'product-docs', path: '/projects/product-docs', baseBranch: 'main', addedAt: '2026-07-12' },
]

const workspace: Workspace = {
  id: 'checkout',
  name: 'Checkout redesign',
  projectIds: ['frontend', 'backend'],
  createdAt: '2026-07-13',
}

const workspaceSession: AgentSession = {
  id: 'session-1',
  projectId: 'frontend',
  workspaceId: workspace.id,
  runtimeId: 'codex',
  branchName: 'checkout/payment-flow',
  worktreePath: '/worktrees/payment-flow',
  status: 'running',
  pid: 42,
  additionalDirs: ['/worktrees/commerce-api'],
}

const docsSession: AgentSession = {
  id: 'session-2',
  projectId: 'docs',
  runtimeId: 'claude',
  branchName: 'docs/navigation',
  worktreePath: '/worktrees/docs-navigation',
  status: 'waiting',
  pid: 43,
  additionalDirs: [],
}

function node(path: string, name: string, children?: FileTreeNode[]): FileTreeNode {
  return { path, name, isDirectory: children !== undefined, children }
}

const checkoutTree = node('/projects/product-docs', 'product-docs', [
  node('/projects/product-docs/guides', 'guides', [
    node('/projects/product-docs/guides/checkout.md', 'checkout.md'),
  ]),
  node('/projects/product-docs/README.md', 'README.md'),
])

const worktreeTree = node('/worktrees/docs-navigation', 'docs-navigation', [
  node('/worktrees/docs-navigation/guides', 'guides', [
    node('/worktrees/docs-navigation/guides/checkout.md', 'checkout.md'),
    node('/worktrees/docs-navigation/guides/payments.md', 'payments.md'),
  ]),
  node('/worktrees/docs-navigation/README.md', 'README.md'),
])

// Disclosure state is read from localStorage on mount, so the fixture seeds both
// kinds of folder open at once: the repo's checkout and one agent's worktree.
localStorage.setItem('manifold.sidebar.openFolders.v1', JSON.stringify(['project:docs', 'session:session-2']))

export default (
  <div style={{ width: 320, height: 720, background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
    <ProjectSidebar
      projects={projects}
      activeProjectId="frontend"
      suppressedProjectIds={new Set(['frontend', 'backend'])}
      allProjectSessions={{ frontend: [workspaceSession], backend: [], docs: [docsSession] }}
      activeSessionId={workspaceSession.id}
      outputtingSessionIds={new Set([workspaceSession.id])}
      onSelectProject={() => undefined}
      onSelectSession={() => undefined}
      onRemoveProject={() => undefined}
      onUpdateProject={() => undefined}
      onRenameAgent={() => undefined}
      onRequestDeleteAgent={() => undefined}
      onNewAgent={() => undefined}
      onNewProject={() => undefined}
      onCreateWorkspaceFromProject={async () => undefined}
      onNewWorkspace={() => undefined}
      workspaces={[workspace]}
      activeWorkspaceId={workspace.id}
      sessionsByWorkspace={{ [workspace.id]: [workspaceSession] }}
      onSelectWorkspace={() => undefined}
      onRemoveWorkspace={async () => undefined}
      onSelectWorkspaceRepo={() => undefined}
      onAddProjectToWorkspace={() => undefined}
      onRemoveProjectFromWorkspace={() => undefined}
      drafts={[]}
      activeDraftId={null}
      onSelectDraft={() => undefined}
      onDiscardDraft={() => undefined}
      renderFolderFiles={(source) => (source.kind === 'project' ? (
        <FileTree
          showToolbar={false}
          flattenRoots
          tree={checkoutTree}
          changes={[]}
          activeFilePath={null}
          openFilePaths={new Set<string>()}
          expandedPaths={new Set(['/projects/product-docs'])}
          onToggleExpand={() => undefined}
          onSelectFile={() => undefined}
        />
      ) : (
        <FileTree
          showToolbar={false}
          flattenRoots
          tree={worktreeTree}
          changes={[{ path: 'guides/checkout.md', type: 'modified' }]}
          activeFilePath="/worktrees/docs-navigation/guides/checkout.md"
          openFilePaths={new Set(['/worktrees/docs-navigation/guides/checkout.md'])}
          expandedPaths={new Set(['/worktrees/docs-navigation', '/worktrees/docs-navigation/guides'])}
          onToggleExpand={() => undefined}
          onSelectFile={() => undefined}
        />
      ))}
    />
  </div>
)
