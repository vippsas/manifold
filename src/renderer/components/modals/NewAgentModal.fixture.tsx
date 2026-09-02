import React from 'react'
import type { AgentRuntime } from '../../../shared/types'
import { NewAgentModal } from './NewAgentModal'

const runtimes: AgentRuntime[] = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
  { id: 'viola', name: 'Viola', binary: '', kind: 'orchestrator', installed: true },
]

const baseStub = window.electronAPI
window.electronAPI = {
  ...baseStub,
  invoke: (channel: string, ...args: unknown[]) => {
    if (channel === 'runtimes:list') return Promise.resolve(runtimes)
    return baseStub.invoke(channel, ...args)
  },
}

export default (
  <NewAgentModal
    visible
    workspace={{
      id: 'checkout',
      name: 'Checkout redesign',
      projectIds: ['storefront', 'commerce-api'],
      createdAt: '2026-07-13',
      branchName: 'manifold/checkout-redesign',
      worktreePaths: { storefront: '/worktrees/checkout/storefront' },
    }}
    defaultRuntime="claude"
    defaultAgentMode="interactive"
    onLaunch={async () => undefined}
    onClose={() => undefined}
  />
)
