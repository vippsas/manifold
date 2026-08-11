import React from 'react'
import type { WorkingSetNotice } from '../../shared/types'
import { WorkingSetToast } from '../../shared/WorkingSetToast'

// One of each outcome the user has to act on. A folder that landed cleanly
// ('live') never reaches the toast, so it has no fixture row.
const notices: WorkingSetNotice[] = [
  {
    sessionId: 'a',
    agentName: 'checkout-redesign',
    dir: '/worktrees/manifold/auth/design-system',
    delivery: 'manual',
    error: 'the agent was busy or holding a prompt',
    command: '/add-dir /worktrees/manifold/auth/design-system',
  },
  {
    sessionId: 'b',
    agentName: 'payments-api',
    dir: '/worktrees/manifold/auth/design-system',
    delivery: 'restart-required',
  },
  {
    sessionId: 'c',
    agentName: 'docs-sweep',
    dir: '/worktrees/manifold/auth/design-system',
    delivery: 'next-turn',
  },
]

export default function WorkingSetToastFixture(): React.JSX.Element {
  return (
    <div style={{ width: 420, height: 380, position: 'relative' }}>
      <WorkingSetToast notices={notices} onDismiss={() => {}} />
    </div>
  )
}
