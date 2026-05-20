import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AgentSession, Project } from '../../../shared/types'
import type { Superagent } from '../../../shared/superagent-types'
import { AddSuperagentProjectModal } from './AddSuperagentProjectModal'

const fleetSuperagent: Superagent = {
  id: 'sa-1',
  name: '123',
  taskDescription: '',
  runtimeId: 'codex',
  fleetProjectIds: ['p1'],
  fleetWorktreePaths: { p1: '/worktrees/alpha/manifold-123' },
  branchName: 'manifold/123',
  childSessionIds: [],
  coordinationPath: '/coordination',
  createdAt: '2024-01-01T00:00:00.000Z',
  pid: 1,
  status: 'running',
  autoApprove: false,
}

const initialProjects: Project[] = [
  { id: 'p1', name: 'Alpha', path: '/repos/alpha', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p3', name: 'Zeta', path: '/repos/zeta', baseBranch: 'main', addedAt: '2024-01-03' },
]

function projectAppearsBefore(left: string, right: string): boolean {
  const leftNode = screen.getByText(left)
  const rightNode = screen.getByText(right)
  return Boolean(leftNode.compareDocumentPosition(rightNode) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('AddSuperagentProjectModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('excludes repos already in the fleet and keeps new additions alphabetical', async () => {
    const addedProject: Project = {
      id: 'p2',
      name: 'Beta',
      path: '/repos/beta',
      baseBranch: 'main',
      addedAt: '2024-01-02',
    }
    const onAddToFleet = vi.fn(async () => undefined)

    function Harness(): React.JSX.Element {
      const [projects, setProjects] = React.useState(initialProjects)

      return (
        <AddSuperagentProjectModal
          visible={true}
          superagent={fleetSuperagent}
          projects={projects}
          onAddProject={async () => {
            setProjects((current) => [...current, addedProject])
            return addedProject
          }}
          onResolveStandaloneSessions={vi.fn(async () => [])}
          onAddToFleet={onAddToFleet}
          onClose={vi.fn()}
        />
      )
    }

    render(<Harness />)

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('Zeta')).toBeInTheDocument()

    fireEvent.click(screen.getByText('+ Add repository'))

    await waitFor(() => expect(screen.getByText('Beta')).toBeInTheDocument())
    expect(projectAppearsBefore('Beta', 'Zeta')).toBe(true)

    const betaCheckbox = screen.getByRole('checkbox', { name: /Beta/i })
    expect(betaCheckbox).toBeChecked()

    await waitFor(() => expect(screen.queryByText('Checking for existing standalone agents…')).not.toBeInTheDocument())
    fireEvent.click(screen.getByText('Add to superagent'))

    await waitFor(() => expect(onAddToFleet).toHaveBeenCalledWith('sa-1', [{ projectId: 'p2' }]))
  })

  it('tracks selected repositories so the sidebar can suppress standalone rows while deciding ownership', async () => {
    const onSelectionChange = vi.fn()

    render(
      <AddSuperagentProjectModal
        visible={true}
        superagent={fleetSuperagent}
        projects={initialProjects}
        onAddProject={vi.fn(async () => null)}
        onResolveStandaloneSessions={vi.fn(async () => [])}
        onSelectionChange={onSelectionChange}
        onAddToFleet={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /Zeta/i }))

    await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith(['p3']))
  })

  it('offers explicit reuse when a compatible standalone agent already exists', async () => {
    const compatibleSession: AgentSession = {
      id: 'standalone-1',
      projectId: 'p3',
      runtimeId: 'codex',
      branchName: 'manifold/123',
      worktreePath: '/worktrees/zeta/manifold-123',
      status: 'waiting',
      pid: 1,
      additionalDirs: [],
    }
    const onAddToFleet = vi.fn(async () => undefined)

    render(
      <AddSuperagentProjectModal
        visible={true}
        superagent={fleetSuperagent}
        projects={initialProjects}
        onAddProject={vi.fn(async () => null)}
        onResolveStandaloneSessions={vi.fn(async () => [compatibleSession])}
        onAddToFleet={onAddToFleet}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: /Zeta/i }))

    await waitFor(() => expect(screen.getByText('Reuse existing agent')).toBeInTheDocument())
    expect(screen.getByText('Add as new superagent slot')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Reuse existing agent/i }))
    fireEvent.click(screen.getByText('Add to superagent'))

    await waitFor(() => expect(onAddToFleet).toHaveBeenCalledWith('sa-1', [{
      projectId: 'p3',
      reuseSessionId: 'standalone-1',
    }]))
  })
})
