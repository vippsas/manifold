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
  isFetching: false,
  fetchResult: null,
  fetchError: null,
  onFetch: vi.fn(),
}

describe('ProjectItem fetch badge', () => {
  it('shows no badge and the default tooltip when up to date', () => {
    render(<ProjectItem {...baseProps} behindCount={0} />)
    const btn = screen.getByRole('button', { name: 'Fetch MANIFOLD' })
    expect(btn).toHaveAttribute('title', 'Fetch latest from remote')
    expect(btn.textContent).not.toMatch(/\d/)
  })

  it('shows the behind count and an explanatory tooltip when behind', () => {
    render(<ProjectItem {...baseProps} behindCount={3} />)
    const btn = screen.getByRole('button', { name: 'Fetch MANIFOLD (3 behind origin)' })
    expect(btn.textContent).toContain('3')
    expect(btn.getAttribute('title')).toBe(
      'main is 3 commits behind origin — fetch before starting a new agent'
    )
  })

  it('uses singular wording for 1 commit', () => {
    render(<ProjectItem {...baseProps} behindCount={1} />)
    const btn = screen.getByRole('button', { name: 'Fetch MANIFOLD (1 behind origin)' })
    expect(btn.getAttribute('title')).toBe(
      'main is 1 commit behind origin — fetch before starting a new agent'
    )
  })

  it('caps the badge at 9+', () => {
    render(<ProjectItem {...baseProps} behindCount={42} />)
    expect(screen.getByText('9+')).toBeInTheDocument()
  })

  it('hides the badge while fetching', () => {
    render(<ProjectItem {...baseProps} behindCount={3} isFetching />)
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })
})
