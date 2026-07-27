import React from 'react'
import { AgentSettingsModal } from './AgentSettingsModal'

export default (
  <AgentSettingsModal
    visible
    session={{
      id: 'session-1',
      projectId: 'storefront',
      runtimeId: 'codex',
      branchName: 'checkout/payment-flow',
      worktreePath: '/worktrees/payment-flow',
      status: 'running',
      pid: 42,
      displayName: 'Payment flow',
      additionalDirs: ['/worktrees/commerce-api'],
    }}
    fallbackName="Payment flow"
    onSave={() => undefined}
    onClose={() => undefined}
  />
)
