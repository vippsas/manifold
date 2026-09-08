import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { installElectronApi, installLocalStorage, mockInvoke, renderSidebar, sampleSessions } from './ProjectSidebar.test-helpers'

beforeEach(() => { vi.clearAllMocks(); installLocalStorage(); installElectronApi() })

const home = { id: 'w-home', name: 'Alpha', projectIds: ['p1'], createdAt: '2024-01-01' }
const wt = (id: string, name: string) =>
  ({ id, name, projectIds: ['p1'], createdAt: '2024-01-01', branchName: `alpha/${name}`, worktreePaths: { p1: `/wt/${id}` } })
const beta = { id: 'w-beta', name: 'beta-space', projectIds: ['p2'], createdAt: '2024-01-02' }

const rowNames = (): string[] =>
  Array.from(document.querySelectorAll('.sidebar-project-row'))
    .map((row) => within(row as HTMLElement).getByRole('button', { name: /^(Expand|Collapse) / }).getAttribute('aria-label')!.replace(/^(Expand|Collapse) /, ''))

describe('repo tree', () => {
  it('nests a repo’s worktrees under its home card, closed until opened', () => {
    renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo'), beta], activeWorkspaceId: null, sessionsByWorkspace: {} })

    expect(rowNames()).toEqual(['Alpha', 'beta-space'])
    fireEvent.click(screen.getByLabelText('Expand Alpha'))
    expect(rowNames()).toEqual(['Alpha', 'oslo', 'beta-space'])
    expect(screen.getByText('oslo').closest('.sidebar-item-row')!.className).toContain('sidebar-item-row--nested')
  })

  // The parent names the repo once; the child must not repeat it.
  it('drops the repo prefix on nested rows', () => {
    renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo')], activeWorkspaceId: 'w-oslo', sessionsByWorkspace: {} })
    const row = screen.getByText('oslo').closest<HTMLElement>('.sidebar-project-row')!
    expect(within(row).queryByText('Alpha')).not.toBeInTheDocument()
  })

  it('opens the group holding the active workspace', () => {
    renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo')], activeWorkspaceId: 'w-oslo', sessionsByWorkspace: {} })
    expect(rowNames()).toEqual(['Alpha', 'oslo'])
  })

  it('remembers folds across a remount', () => {
    const first = renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo')], activeWorkspaceId: null, sessionsByWorkspace: {} })
    fireEvent.click(screen.getByLabelText('Expand Alpha'))
    first.unmount()
    renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo')], activeWorkspaceId: null, sessionsByWorkspace: {} })
    expect(rowNames()).toEqual(['Alpha', 'oslo'])
  })

  it('shows a count and the agents’ states on a collapsed home card', () => {
    renderSidebar({
      workspaces: [home, wt('w-oslo', 'oslo'), wt('w-bergen', 'bergen')],
      activeWorkspaceId: null,
      sessionsByWorkspace: { 'w-oslo': [{ ...sampleSessions[0], status: 'waiting' }] },
    })
    const row = screen.getByText('Alpha').closest<HTMLElement>('.sidebar-project-row')!
    expect(within(row).getByText('2')).toBeInTheDocument()
    expect(row.querySelector('.status-dot--waiting.status-dot--small')).not.toBeNull()
  })

  it('heads a repo that has branches but no home workspace with a muted, unselectable header', () => {
    const onSelectWorkspace = vi.fn()
    renderSidebar({ workspaces: [wt('w-oslo', 'oslo'), beta], activeWorkspaceId: null, sessionsByWorkspace: {}, onSelectWorkspace })
    const header = screen.getByRole('button', { name: 'Expand Alpha' })
    expect(header.className).toContain('sidebar-repo-group-header')
    fireEvent.click(header)
    expect(onSelectWorkspace).not.toHaveBeenCalled()
    expect(rowNames()).toEqual(['oslo', 'beta-space'])
  })

  it('folds merged worktrees behind one row and reveals them on click', async () => {
    mockInvoke.mockImplementation(async (channel: string) => (channel === 'workspace:list-merged' ? ['w-old', 'w-older'] : undefined))
    renderSidebar({
      workspaces: [home, wt('w-oslo', 'oslo'), wt('w-old', 'old'), wt('w-older', 'older')],
      activeWorkspaceId: 'w-home',
      sessionsByWorkspace: {},
    })
    const fold = await screen.findByRole('button', { name: 'Show 2 merged workspaces' })
    expect(rowNames()).toEqual(['Alpha', 'oslo'])
    fireEvent.click(fold)
    expect(rowNames()).toEqual(['Alpha', 'oslo', 'old', 'older'])
    expect(screen.getByRole('button', { name: 'Hide 2 merged workspaces' })).toBeInTheDocument()
  })

  // A branch can be marked merged while its worktree is still the workspace you
  // are sitting in — the agent only has to be finished, not gone. Folding it
  // away by default would make the user's own workspace vanish from the list.
  it('keeps the active workspace on screen even when its branch is merged', async () => {
    mockInvoke.mockImplementation(async (channel: string) => (channel === 'workspace:list-merged' ? ['w-old'] : undefined))
    renderSidebar({
      workspaces: [home, wt('w-old', 'old')],
      activeWorkspaceId: 'w-old',
      sessionsByWorkspace: {},
    })
    // Waiting on the fold row proves the merged set arrived and moved w-old
    // behind it; the row must still be showing, without anyone clicking.
    const fold = await screen.findByRole('button', { name: /merged workspace/ })
    expect(rowNames()).toEqual(['Alpha', 'old'])
    expect(fold).toHaveAttribute('aria-expanded', 'true')
  })

  it('never folds a merged workspace that still has a live agent', async () => {
    mockInvoke.mockImplementation(async (channel: string) => (channel === 'workspace:list-merged' ? ['w-old'] : undefined))
    renderSidebar({
      workspaces: [home, wt('w-old', 'old')],
      activeWorkspaceId: 'w-home',
      sessionsByWorkspace: { 'w-old': [{ ...sampleSessions[0], status: 'running' }] },
    })
    await screen.findByText('old')
    expect(screen.queryByRole('button', { name: /merged workspaces/ })).not.toBeInTheDocument()
  })
})
