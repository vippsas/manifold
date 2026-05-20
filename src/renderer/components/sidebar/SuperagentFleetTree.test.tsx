import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Superagent } from '../../../shared/superagent-types'
import type { AgentSession, FileTreeNode, Project } from '../../../shared/types'
import { SuperagentFleetTree } from './SuperagentFleetTree'

const mockInvoke = vi.fn()

beforeEach(() => {
  mockInvoke.mockReset()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

const projects: Project[] = [
  { id: 'p2', name: 'vce-terraform', path: '/repos/vce-terraform', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p1', name: 'kong-gateway', path: '/repos/kong-gateway', baseBranch: 'main', addedAt: '2024-01-02' },
]

const rootTree = (path: string): FileTreeNode => ({
  name: 'manifold-123',
  path,
  isDirectory: true,
  children: [
    { name: '.github', path: `${path}/.github`, isDirectory: true, children: [] },
    { name: 'docs', path: `${path}/docs`, isDirectory: true, children: [] },
  ],
})

const superagent: Superagent = {
  id: 'sa-1',
  name: '123',
  taskDescription: '',
  runtimeId: 'claude',
  fleetProjectIds: ['p2', 'p1'],
  fleetWorktreePaths: {
    p2: '/worktrees/vce-terraform/manifold-123',
    p1: '/worktrees/kong-gateway/manifold-123',
  },
  branchName: 'manifold/123',
  childSessionIds: ['s1', 's2'],
  coordinationPath: '/coordination',
  createdAt: '2024-01-01T00:00:00.000Z',
  pid: 1,
  status: 'running',
  autoApprove: false,
}

const allProjectSessions: Record<string, AgentSession[]> = {
  p2: [
    { id: 's1', projectId: 'p2', runtimeId: 'claude', branchName: 'manifold/123', worktreePath: '/worktrees/vce-terraform/manifold-123', status: 'waiting', pid: 1, additionalDirs: [] },
  ],
  p1: [
    { id: 's2', projectId: 'p1', runtimeId: 'codex', branchName: 'manifold/123', worktreePath: '/worktrees/kong-gateway/manifold-123', status: 'running', pid: 2, additionalDirs: [] },
  ],
}

describe('SuperagentFleetTree', () => {
  it('shows repository names instead of worktree directory names', async () => {
    mockInvoke.mockImplementation((channel: string, _superagentId: string, projectId?: string) => {
      if (channel === 'files:tree-for-superagent-project' && projectId) {
        return Promise.resolve(rootTree(superagent.fleetWorktreePaths[projectId]))
      }
      if (channel === 'files:fleet-changes') {
        return Promise.resolve({})
      }
      return Promise.resolve(undefined)
    })

    render(
      <SuperagentFleetTree
        superagent={superagent}
        projects={projects}
        allProjectSessions={allProjectSessions}
        onSelectSession={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getAllByText('kong-gateway').length).toBeGreaterThan(0))
    expect(screen.getAllByText('vce-terraform').length).toBeGreaterThan(0)
    expect(screen.getByText('waiting')).toBeInTheDocument()
    expect(screen.queryByText('manifold-123')).not.toBeInTheDocument()
    expect(screen.queryByText('manifold/123')).not.toBeInTheDocument()
  })

  it('keeps child-session navigation inside the active superagent context', async () => {
    mockInvoke.mockImplementation((channel: string, _superagentId: string, projectId?: string) => {
      if (channel === 'files:tree-for-superagent-project' && projectId) {
        return Promise.resolve(rootTree(superagent.fleetWorktreePaths[projectId]))
      }
      if (channel === 'files:fleet-changes') {
        return Promise.resolve({})
      }
      return Promise.resolve(undefined)
    })

    const onSelectSession = vi.fn()

    render(
      <SuperagentFleetTree
        superagent={superagent}
        projects={projects}
        allProjectSessions={allProjectSessions}
        onSelectSession={onSelectSession}
      />,
    )

    const childRow = await screen.findByTitle('kong-gateway — running')
    fireEvent.click(childRow)

    expect(onSelectSession).toHaveBeenCalledWith(
      's2',
      'p1',
      { preserveSuperagent: true },
    )
  })

  it('lets the fleet header navigate back to the superagent terminal', async () => {
    mockInvoke.mockImplementation((channel: string, _superagentId: string, projectId?: string) => {
      if (channel === 'files:tree-for-superagent-project' && projectId) {
        return Promise.resolve(rootTree(superagent.fleetWorktreePaths[projectId]))
      }
      if (channel === 'files:fleet-changes') {
        return Promise.resolve({})
      }
      return Promise.resolve(undefined)
    })

    const onSelectSuperagentHome = vi.fn()

    render(
      <SuperagentFleetTree
        superagent={superagent}
        projects={projects}
        allProjectSessions={allProjectSessions}
        onSelectSession={vi.fn()}
        onSelectSuperagentHome={onSelectSuperagentHome}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: /123/i }))
    expect(onSelectSuperagentHome).toHaveBeenCalledTimes(1)
  })

  it('keeps child agents visible by default and lets the user collapse them', async () => {
    mockInvoke.mockImplementation((channel: string, _superagentId: string, projectId?: string) => {
      if (channel === 'files:tree-for-superagent-project' && projectId) {
        return Promise.resolve(rootTree(superagent.fleetWorktreePaths[projectId]))
      }
      if (channel === 'files:fleet-changes') {
        return Promise.resolve({})
      }
      return Promise.resolve(undefined)
    })

    render(
      <SuperagentFleetTree
        superagent={superagent}
        projects={projects}
        allProjectSessions={allProjectSessions}
        onSelectSession={vi.fn()}
      />,
    )

    await screen.findByTitle('kong-gateway — running')
    expect(screen.getByTitle('vce-terraform — waiting')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(screen.queryByTitle('kong-gateway — running')).toBeNull()
    expect(screen.getByRole('button', { name: 'Show' })).toBeInTheDocument()
  })
})
