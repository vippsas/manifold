import React, { useEffect, useRef } from 'react'
import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { WorkspaceRepoRow } from './WorkspaceRepoRow'

// The screenshot harness stubs `window.electronAPI` before the bundle runs;
// the fixture adds the static home the preload would carry, so Copy Relative
// Path exercises real home ownership rather than a path-shape guess.
window.electronAPI = { ...window.electronAPI, homeDir: '/Users/tester' }

const project: Project = {
  id: 'p1',
  name: 'manifold-2',
  path: '/Users/tester/projects/manifold-2',
  baseBranch: 'main',
  addedAt: '2024-01-01',
}

const workspace: Workspace = { id: 'w1', name: 'main', projectIds: ['p1'], createdAt: '2024-01-01' }

const noop = (): void => undefined

/**
 * The folder row with its right-click menu open. The fixture dispatches a real
 * `contextmenu` event on mount rather than rendering `ContextMenu` by hand, so
 * a capture exercises the actual wiring: `useContextMenu` →
 * `buildRepoRowContextMenu` → the body-portaled menu.
 */
export default function WorkspaceRepoRowFixture(): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const row = host.current?.querySelector('.sidebar-repo-row')
    row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 150, clientY: 56 }))
  }, [])
  return (
    <div
      ref={host}
      style={{
        width: 340,
        minHeight: 200,
        padding: 20,
        background: 'var(--bg-sidebar)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--type-ui)',
      }}
    >
      <WorkspaceRepoRow
        workspace={workspace}
        projectId="p1"
        repo={project}
        isActive
        filesOpen={false}
        onToggleFiles={noop}
      />
    </div>
  )
}
