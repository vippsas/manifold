import React, { useEffect, useRef } from 'react'
import type { AgentSession } from '../../../shared/types'
import { StatusBar } from './StatusBar'

const session: AgentSession = {
  id: 'fixture-session',
  projectId: 'p1',
  runtimeId: 'codex',
  branchName: 'feature/checkout-redesign',
  worktreePath: '/worktrees/checkout-redesign',
  status: 'running',
  pid: 1,
  additionalDirs: [],
}

function StatusBarFixture(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    hostRef.current?.querySelector<HTMLButtonElement>('[aria-label^="Sync changes"]')?.click()
  }, [])

  return (
    <div ref={hostRef} style={{ width: 650, height: 120, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <StatusBar
        activeSession={session}
        changedFiles={[{ path: 'src/renderer/App.tsx', type: 'modified' }]}
        baseBranch="main"
        branchTarget={{
          workspaceId: 'ws-fixture',
          projectId: 'p1',
          repoName: 'manifold',
          currentBranch: 'feature/checkout-redesign',
          upstreamAheadBehind: { behind: 2, ahead: 3 },
          onCheckedOut: () => undefined,
          onSync: () => new Promise(() => undefined),
          onShowCommandOutput: () => undefined,
        }}
      />
    </div>
  )
}

export default <StatusBarFixture />
