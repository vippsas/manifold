import React, { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Project } from '../../../shared/types'
import { NewSuperagentModal } from './NewSuperagentModal'

const mockInvoke = vi.fn()

beforeEach(() => {
  mockInvoke.mockReset()
  mockInvoke.mockResolvedValue([
    { id: 'claude', name: 'Claude', orchestratorCapable: true, installed: true },
  ])
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

const initialProjects: Project[] = [
  { id: 'p2', name: 'Zeta', path: '/repos/zeta', baseBranch: 'main', addedAt: '2024-01-02' },
  { id: 'p1', name: 'Alpha', path: '/repos/alpha', baseBranch: 'main', addedAt: '2024-01-01' },
]

function projectAppearsBefore(left: string, right: string): boolean {
  const leftNode = screen.getByText(left)
  const rightNode = screen.getByText(right)
  return Boolean(leftNode.compareDocumentPosition(rightNode) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('NewSuperagentModal', () => {
  it('keeps the fleet list alphabetical after adding a repository inline', async () => {
    const addedProject: Project = {
      id: 'p3',
      name: 'Beta',
      path: '/repos/beta',
      baseBranch: 'main',
      addedAt: '2024-01-03',
    }
    const onLaunch = vi.fn()
    const onAddProject = vi.fn()

    function Harness(): React.JSX.Element {
      const [projects, setProjects] = useState(initialProjects)

      return (
        <NewSuperagentModal
          visible={true}
          projects={projects}
          defaultRuntime="claude"
          onAddProject={async () => {
            onAddProject()
            setProjects((current) => [...current, addedProject])
            return addedProject
          }}
          onLaunch={onLaunch}
          onClose={vi.fn()}
        />
      )
    }

    render(<Harness />)

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))
    expect(projectAppearsBefore('Alpha', 'Zeta')).toBe(true)

    fireEvent.click(screen.getByText('+ Add repository'))

    await waitFor(() => expect(onAddProject).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('Beta')).toBeInTheDocument())

    expect(projectAppearsBefore('Alpha', 'Beta')).toBe(true)
    expect(projectAppearsBefore('Beta', 'Zeta')).toBe(true)
  })
})
