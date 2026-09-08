import React, { useEffect, useRef } from 'react'
import { WorkspaceRepoRow } from './WorkspaceRepoRow'

window.electronAPI = {
  ...window.electronAPI,
  invoke: async () => { throw new Error('fatal: unable to access remote: Could not resolve host: github.com') },
}

export default function RepoRefreshFailureFixture(): React.JSX.Element {
  const sidebar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    sidebar.current?.querySelector<HTMLButtonElement>('[aria-label="Fetch manifold"]')?.click()
  }, [])

  return (
    <div ref={sidebar} style={{ width: 320, height: '100%', background: 'var(--bg-sidebar)' }}>
      <WorkspaceRepoRow
        workspace={{ id: 'w1', name: 'manifold', projectIds: ['p1'], createdAt: '2026-09-08' }}
        projectId="p1"
        repo={{ id: 'p1', name: 'manifold', path: '/projects/manifold', baseBranch: 'main', addedAt: '2026-09-08' }}
        isActive
        filesOpen={false}
        onToggleFiles={() => undefined}
      />
    </div>
  )
}
