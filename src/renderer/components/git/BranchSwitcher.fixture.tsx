// Screenshot fixture for BranchSwitcher — see scripts/screenshot-component.mjs.
// Renders the quick-pick open (defaultOpen) with a stubbed branch list, typed
// filter text left empty so the full list shows.
import React from 'react'
import type { BranchInfo } from '../../../shared/types'
import { BranchSwitcher } from './BranchSwitcher'

const branches: BranchInfo[] = [
  { name: 'main', source: 'both' },
  { name: 'manifold/checkout-redesign', source: 'local' },
  { name: 'feature/express-pay', source: 'both' },
  { name: 'feature/cart-summary', source: 'remote' },
]

const baseStub = window.electronAPI
window.electronAPI = {
  ...baseStub,
  invoke: (channel: string, ...args: unknown[]) => {
    if (channel === 'git:list-branches') return Promise.resolve(branches)
    return baseStub.invoke(channel, ...args)
  },
}

export default (
  <div style={{ width: 900, height: 560 }}>
    <BranchSwitcher
      workspaceId="ws-fixture"
      projectId="p1"
      repoName="storefront"
      currentBranch="manifold/checkout-redesign"
      onCheckedOut={() => undefined}
      defaultOpen
    />
  </div>
)
