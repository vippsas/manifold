import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectItem } from './ProjectItem'
import type { Project } from '../../../shared/types'

const gitProject = { id: 'p1', name: 'MANIFOLD', path: '/p1', baseBranch: 'main', kind: 'git' } as unknown as Project

const baseProps = {
  project: gitProject,
  isActive: true,
  onSelect: vi.fn(),
  onRemove: vi.fn(),
}

describe('ProjectItem', () => {
  it('keeps agent and fetch actions out of the repository header', () => {
    render(<ProjectItem {...baseProps} />)

    expect(screen.queryByRole('button', { name: 'Add agent to MANIFOLD' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Fetch MANIFOLD/ })).not.toBeInTheDocument()
  })
})
