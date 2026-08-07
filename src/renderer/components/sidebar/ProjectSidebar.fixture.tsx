import { ProjectSidebar } from './ProjectSidebar'
import { FileTree } from '../editor/file-tree/FileTree'
import type { AgentSession, FileTreeNode, Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

const projects: Project[] = [
  { id: 'frontend', name: 'storefront', path: '/projects/storefront', baseBranch: 'main', addedAt: '2026-07-10' },
  { id: 'backend', name: 'commerce-api', path: '/projects/commerce-api', baseBranch: 'main', addedAt: '2026-07-11' },
  { id: 'docs', name: 'product-docs', path: '/projects/product-docs', baseBranch: 'main', addedAt: '2026-07-12' },
  // Long enough that its row label has to truncate — the case that catches a
  // repo segment which wraps instead of ellipsizing.
  { id: 'platform', name: 'commerce-platform-services', path: '/projects/commerce-platform-services', baseBranch: 'main', addedAt: '2026-07-15' },
]

// Two workspaces side by side: one spanning two folders, one spanning a single
// folder. They render through the same path — a lone repo is just a workspace of
// one folder.
const workspace: Workspace = {
  id: 'checkout',
  name: 'Checkout redesign',
  projectIds: ['frontend', 'backend'],
  createdAt: '2026-07-13',
}

const docsWorkspace: Workspace = {
  id: 'product-docs',
  name: 'product-docs',
  projectIds: ['docs'],
  createdAt: '2026-07-14',
}

const longRepoWorkspace: Workspace = {
  id: 'billing',
  name: 'billing-retries',
  projectIds: ['platform'],
  createdAt: '2026-07-15',
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

// Works in commerce-api's own checkout rather than a worktree (noWorktree).
const inPlaceSession: AgentSession = {
  id: 'session-3',
  projectId: 'backend',
  runtimeId: 'claude',
  branchName: 'commerce-api/refund-webhook',
  worktreePath: '/projects/commerce-api',
  status: 'running',
  pid: 44,
  additionalDirs: [],
  noWorktree: true,
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

// Disclosure state is read from localStorage on mount, so the fixture seeds two
// workspace folders open at once.
localStorage.setItem(
  'manifold.sidebar.openFolders.v1',
  JSON.stringify(['project:frontend', 'project:docs']),
)

// The active workspace is the least recently visited one, so the list can only
// lead with it if the active row is pinned first.
localStorage.setItem(
  'manifold.sidebar.recency.v1',
  JSON.stringify({ billing: 300, 'product-docs': 200, checkout: 100 }),
)

export default (
  <div style={{ width: 320, height: 720, background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
    <ProjectSidebar
      projects={projects}
      activeProjectId="frontend"
      outputtingSessionIds={new Set([workspaceSession.id])}
      onNewProject={() => undefined}
      onNewWorkspace={() => undefined}
      workspaces={[workspace, docsWorkspace, longRepoWorkspace]}
      activeWorkspaceId={workspace.id}
      sessionsByWorkspace={{
        [workspace.id]: [workspaceSession, inPlaceSession],
        [docsWorkspace.id]: [docsSession],
      }}
      onSelectWorkspace={() => undefined}
      onRenameWorkspace={() => undefined}
      onRemoveWorkspace={async () => undefined}
      onCopyWorkspace={() => undefined}
      onSelectWorkspaceRepo={() => undefined}
      onAddProjectToWorkspace={() => undefined}
      onRemoveProjectFromWorkspace={() => undefined}
      // storefront trails origin, product-docs is level: both states of the
      // folder row's fetch action in one shot.
      behindCounts={{ frontend: 3 }}
      onProjectFetched={() => undefined}
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
