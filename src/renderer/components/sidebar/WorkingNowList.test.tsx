import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { AgentSession, Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { WorkingNowList, workingNowRows } from './WorkingNowList'

const projects: Project[] = [{ id: 'p1', name: 'kong', path: '/repos/kong', baseBranch: 'main', addedAt: '' }]
const ws = (id: string, name: string): Workspace =>
  ({ id, name, projectIds: ['p1'], createdAt: '', branchName: name, worktreePaths: { p1: `/wt/${id}` } })
const s = (id: string, status: AgentSession['status']): AgentSession =>
  ({ id, projectId: 'p1', runtimeId: 'claude', branchName: 'b', worktreePath: '/', status, pid: 1, additionalDirs: [] })

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined } as unknown as Storage)
})

describe('workingNowRows', () => {
  it('lists live workspaces, waiting first, then most recent', () => {
    const rows = workingNowRows(
      [ws('a', 'a'), ws('b', 'b'), ws('c', 'c'), ws('d', 'd')],
      { a: [s('1', 'running')], b: [s('2', 'done')], c: [s('3', 'waiting')], d: [s('4', 'running')] },
      { a: 100, d: 900 },
    )
    expect(rows.map((r) => [r.workspace.id, r.status])).toEqual([['c', 'waiting'], ['d', 'running'], ['a', 'running']])
  })
})

describe('WorkingNowList', () => {
  it('renders nothing when no agent is alive', () => {
    const { container } = render(
      <WorkingNowList workspaces={[ws('a', 'a')]} projects={projects} sessionsByWorkspace={{ a: [s('1', 'done')] }} recency={{}} onSelectWorkspace={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('names the repo on every row and selects the workspace on click', () => {
    const onSelect = vi.fn()
    render(
      <WorkingNowList workspaces={[ws('a', 'moss')]} projects={projects} sessionsByWorkspace={{ a: [s('1', 'waiting')] }} recency={{}} onSelectWorkspace={onSelect} />,
    )
    expect(screen.getByText('Working now')).toBeInTheDocument()
    expect(screen.getByText('kong')).toBeInTheDocument()
    // Membership comes from status; the dot comes from output. A workspace can
    // legitimately be listed here with no dot on it.
    expect(screen.queryByLabelText('An agent is working in this workspace')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('moss'))
    expect(onSelect).toHaveBeenCalledWith('a')
  })
})
