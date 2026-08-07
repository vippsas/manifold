// Screenshot fixture for SourceControl — see scripts/screenshot-component.mjs.
// `npm run screenshot:component SourceControl` renders the multi-repo view:
// we override `git:workspace-status` so both sections show a branch, one with
// changes of every type and one clean.
import React from 'react'
import type { Workspace, WorkspaceRepoStatus } from '../../../shared/workspace-types'
import { SourceControl } from './SourceControl'

const workspace: Workspace = {
  id: 'ws-fixture',
  name: 'Checkout redesign',
  projectIds: ['p1', 'p2'],
  createdAt: '2024-01-01',
  branchName: 'manifold/checkout-redesign',
  worktreePaths: { p1: '/worktrees/storefront', p2: '/worktrees/payments' },
}

const statuses: WorkspaceRepoStatus[] = [
  {
    projectId: 'p1',
    projectName: 'storefront',
    checkoutPath: '/worktrees/storefront',
    branch: 'manifold/checkout-redesign',
    changes: [
      { path: 'src/checkout/CartSummary.tsx', type: 'modified' },
      { path: 'src/checkout/checkout-flow.ts', type: 'modified' },
      { path: 'src/checkout/ExpressPay.tsx', type: 'added' },
      { path: 'src/legacy/one-page-checkout.ts', type: 'deleted' },
    ],
  },
  {
    projectId: 'p2',
    projectName: 'payments',
    checkoutPath: '/worktrees/payments',
    branch: 'manifold/checkout-redesign',
    changes: [],
  },
]

const baseStub = window.electronAPI
window.electronAPI = {
  ...baseStub,
  invoke: (channel: string, ...args: unknown[]) => {
    if (channel === 'git:workspace-status') return Promise.resolve(statuses)
    return baseStub.invoke(channel, ...args)
  },
}

export default (
  <div style={{ width: 280, height: 420 }}>
    <SourceControl workspace={workspace} onSelectFile={() => undefined} />
  </div>
)
