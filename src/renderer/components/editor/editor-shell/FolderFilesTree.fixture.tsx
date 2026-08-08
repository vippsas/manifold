// Screenshot fixture for the sidebar's folder trees, side by side: the folder
// the selected agent works in — watched, so its changed files carry A/M/D
// badges — and a folder no watcher follows, a plain listing.
// `npm run screenshot:component FolderFilesTree`.
import React from 'react'
import type { FileTreeNode, Project } from '../../../../shared/types'
import type { Workspace } from '../../../../shared/workspace-types'
import type { DockAppState } from './dock-panel-types'
import { DockStateContext } from './dock-panel-types'
import { FolderFilesTree } from './FolderFilesTree'

function node(path: string, name: string, children?: FileTreeNode[]): FileTreeNode {
  return { path, name, isDirectory: children !== undefined, children }
}

const projects: Project[] = [
  { id: 'storefront', name: 'storefront', path: '/projects/storefront', baseBranch: 'main', addedAt: '2026-08-01' },
  { id: 'docs', name: 'product-docs', path: '/projects/product-docs', baseBranch: 'main', addedAt: '2026-08-01' },
]

// One workspace over both folders. Its agent runs in the first one, so that is
// the folder the watcher follows.
const workspace: Workspace = {
  id: 'checkout',
  name: 'Checkout redesign',
  projectIds: ['storefront', 'docs'],
  createdAt: '2026-08-01',
}

const watchedTree = node('/projects/storefront', 'storefront', [
  node('/projects/storefront/src', 'src', [
    node('/projects/storefront/src/checkout.ts', 'checkout.ts'),
    node('/projects/storefront/src/payments.ts', 'payments.ts'),
  ]),
  node('/projects/storefront/README.md', 'README.md'),
  node('/projects/storefront/notes.md', 'notes.md'),
])

const listedTree = node('/projects/product-docs', 'product-docs', [
  node('/projects/product-docs/guides', 'guides', [
    node('/projects/product-docs/guides/checkout.md', 'checkout.md'),
  ]),
  node('/projects/product-docs/README.md', 'README.md'),
])

// The unwatched folder fetches its own tree; every other channel answers empty.
;(window as unknown as { electronAPI: unknown }).electronAPI = {
  invoke: (channel: string) =>
    Promise.resolve(channel === 'files:tree-by-project' ? listedTree : []),
  on: () => () => undefined,
}

const dockState = {
  sessionId: 'session-1',
  worktreeRootPath: watchedTree.path,
  tree: watchedTree,
  changes: [
    { path: 'notes.md', type: 'added', worktreeDirty: true },
    { path: 'src/checkout.ts', type: 'modified', worktreeDirty: true },
    // Committed on this branch, clean in the working tree: a faint dot, not a letter.
    { path: 'src/payments.ts', type: 'modified', worktreeDirty: false },
  ],
  openFiles: [],
  activeFilePath: null,
  expandedPaths: new Set([watchedTree.path, '/projects/storefront/src']),
  onToggleExpand: () => undefined,
  onSelectFileFromFileTree: () => undefined,
  onOpenSearchResultInSplit: () => undefined,
  workspaces: [workspace],
  projects,
} as unknown as DockAppState

function Row({ label, projectId }: { label: string; projectId: string }): React.JSX.Element {
  return (
    <div>
      <div style={{ padding: '4px 8px', color: 'var(--text-secondary)', fontSize: 'var(--type-ui-small)' }}>
        {label}
      </div>
      <FolderFilesTree source={{ kind: 'project', id: projectId, workspaceId: workspace.id }} />
    </div>
  )
}

export default (
  <DockStateContext.Provider value={dockState}>
    <div style={{ width: 300, background: 'var(--bg-sidebar)', border: '1px solid var(--border)' }}>
      <Row label="storefront — the agent works here" projectId="storefront" />
      <Row label="product-docs — listed only" projectId="docs" />
    </div>
  </DockStateContext.Provider>
)
