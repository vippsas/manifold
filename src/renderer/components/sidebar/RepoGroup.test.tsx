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

/** The repo header rows, which are folds rather than workspaces and so carry
 *  no `.sidebar-project-row`. */
const headerNames = (): string[] =>
  Array.from(document.querySelectorAll('.sidebar-repo-group-header'))
    .map((row) => row.getAttribute('aria-label')!.replace(/^(Expand|Collapse) /, ''))

const header = (name: string): HTMLElement =>
  screen.getByRole('button', { name: new RegExp(`^(Expand|Collapse) ${name}$`) })

describe('repo tree', () => {
  // The repo is a header, not a workspace: the clone hangs under it as a peer
  // of its branches, so every row inside a group is the same kind of thing.
  it('hangs every workspace of a repo under its header, clone first', () => {
    renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo'), beta], activeWorkspaceId: null, sessionsByWorkspace: {} })

    expect(headerNames()).toEqual(['Alpha', 'Beta'])
    // 'main' is Alpha's base branch: the clone's own name only repeated the
    // repo, so the row answers "which branch?" instead.
    expect(rowNames()).toEqual(['main', 'oslo', 'beta-space'])
    for (const name of ['main', 'oslo']) {
      expect(screen.getByText(name).closest('.sidebar-item-row')!.className).toContain('sidebar-item-row--nested')
    }
  })

  // Repos ship collapsed, so the sidebar opens as an index of repos rather
  // than a wall of every workspace at once. `seedGroupsOpen: false` opts out of
  // the helper's convenience seeding to see the real first-run state.
  it('starts with every repo collapsed and remembers the ones you open', () => {
    const args = { workspaces: [home, wt('w-oslo', 'oslo')], activeWorkspaceId: null, sessionsByWorkspace: {}, seedGroupsOpen: false }
    const first = renderSidebar(args)
    expect(headerNames()).toEqual(['Alpha'])
    expect(rowNames()).toEqual([])

    fireEvent.click(header('Alpha'))
    expect(rowNames()).toEqual(['main', 'oslo'])

    first.unmount()
    renderSidebar(args)
    expect(rowNames()).toEqual(['main', 'oslo'])
  })

  it('collapses every repo at once from the toolbar', () => {
    renderSidebar({
      workspaces: [home, wt('w-oslo', 'oslo'), beta],
      activeWorkspaceId: null,
      sessionsByWorkspace: {},
    })
    expect(rowNames()).toEqual(['main', 'oslo', 'beta-space'])

    fireEvent.click(screen.getByRole('button', { name: 'Collapse all repositories' }))

    expect(rowNames()).toEqual([])
    // The headers stay: collapsing hides workspaces, not the repos themselves.
    expect(headerNames()).toEqual(['Alpha', 'Beta'])
  })

  // A workspace with no repos is a clone of nothing: it keeps its own name,
  // since no header is naming a repo above it.
  it('leaves a workspace with no repos named after itself', () => {
    renderSidebar({
      workspaces: [{ id: 'w-none', name: 'scratch', projectIds: [], createdAt: '2024-01-01' }],
      activeWorkspaceId: null,
      sessionsByWorkspace: {},
    })
    expect(rowNames()).toEqual(['scratch'])
  })

  // With no base branch recorded, falling back to the workspace's own name
  // would reprint the repo's name under a header already showing it.
  it('reads a clone with no base branch as “clone”, not the repo’s name again', () => {
    renderSidebar({
      projects: [{ id: 'p1', name: 'Alpha', path: '/repos/alpha', baseBranch: '', addedAt: '2024-01-01' }],
      workspaces: [home],
      activeWorkspaceId: null,
      sessionsByWorkspace: {},
    })
    expect(rowNames()).toEqual(['clone'])
  })

  // Renaming a clone is information the base branch cannot carry, and this row
  // is the only place that name appears.
  it('keeps a renamed clone’s own name instead of its branch', () => {
    const renamed = { ...home, name: 'main dev' }
    renderSidebar({ workspaces: [renamed], activeWorkspaceId: null, sessionsByWorkspace: {} })
    expect(rowNames()).toEqual(['main dev'])
  })

  // The parent names the repo once; the child must not repeat it.
  it('drops the repo prefix on nested rows', () => {
    renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo')], activeWorkspaceId: 'w-oslo', sessionsByWorkspace: {} })
    const row = screen.getByText('oslo').closest<HTMLElement>('.sidebar-project-row')!
    expect(within(row).queryByText('Alpha')).not.toBeInTheDocument()
  })

  // Entering a workspace has to reveal it, even inside a group the user closed
  // earlier — otherwise the sidebar shows no row for where they are.
  it('reopens a closed group that holds the active workspace', () => {
    const first = renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo')], activeWorkspaceId: null, sessionsByWorkspace: {} })
    fireEvent.click(header('Alpha'))
    expect(rowNames()).toEqual([])
    first.unmount()

    renderSidebar({ workspaces: [home, wt('w-oslo', 'oslo')], activeWorkspaceId: 'w-oslo', sessionsByWorkspace: {} })
    expect(rowNames()).toEqual(['main', 'oslo'])
  })

  it('shows a count on a collapsed header, and a dot only while work is flowing', () => {
    const workspaces = [home, wt('w-oslo', 'oslo'), wt('w-bergen', 'bergen')]
    const sessionsByWorkspace = { 'w-oslo': [{ ...sampleSessions[0], id: 's-oslo', status: 'waiting' as const }] }

    const quiet = renderSidebar({ workspaces, activeWorkspaceId: null, sessionsByWorkspace })
    fireEvent.click(header('Alpha'))
    const row = () => document.querySelector<HTMLElement>('.sidebar-repo-group-header')!
    // Three, not two: the header is not one of the workspaces it counts, so
    // the clone counts as well.
    expect(within(row()).getByText('3')).toBeInTheDocument()
    // A live-but-quiet agent gets no dot — status alone never lights it.
    expect(row().querySelector('.status-dot')).toBeNull()
    quiet.unmount()

    renderSidebar({
      workspaces,
      activeWorkspaceId: null,
      sessionsByWorkspace,
      outputtingSessionIds: new Set(['s-oslo']),
      seedGroupsOpen: false,
    })
    expect(row().querySelector('.status-dot--active.status-dot--small')).not.toBeNull()
  })

  it('heads a repo with a muted, unselectable header — even with no clone', () => {
    const onSelectWorkspace = vi.fn()
    renderSidebar({ workspaces: [wt('w-oslo', 'oslo'), beta], activeWorkspaceId: null, sessionsByWorkspace: {}, onSelectWorkspace })
    const alpha = header('Alpha')
    expect(alpha.className).toContain('sidebar-repo-group-header')
    expect(rowNames()).toEqual(['oslo', 'beta-space'])

    // It folds; it never selects. Clicking it must not enter a workspace.
    fireEvent.click(alpha)
    expect(onSelectWorkspace).not.toHaveBeenCalled()
    expect(rowNames()).toEqual(['beta-space'])
  })

  it('folds merged worktrees behind one row and reveals them on click', async () => {
    mockInvoke.mockImplementation(async (channel: string) => (channel === 'workspace:list-merged' ? ['w-old', 'w-older'] : undefined))
    renderSidebar({
      workspaces: [home, wt('w-oslo', 'oslo'), wt('w-old', 'old'), wt('w-older', 'older')],
      activeWorkspaceId: 'w-home',
      sessionsByWorkspace: {},
    })
    const fold = await screen.findByRole('button', { name: 'Show 2 merged workspaces' })
    expect(rowNames()).toEqual(['main', 'oslo'])
    fireEvent.click(fold)
    expect(rowNames()).toEqual(['main', 'oslo', 'old', 'older'])
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
    expect(rowNames()).toEqual(['main', 'old'])
    expect(fold).toHaveAttribute('aria-expanded', 'true')
  })

  it('never folds a merged workspace that still has a live agent', async () => {
    mockInvoke.mockImplementation(async (channel: string) => (channel === 'workspace:list-merged' ? ['w-old'] : undefined))
    renderSidebar({
      workspaces: [home, wt('w-old', 'old')],
      activeWorkspaceId: 'w-home',
      sessionsByWorkspace: { 'w-old': [{ ...sampleSessions[0], status: 'running' }] },
    })
    // 'old' also names its Working-now row now that it has a live agent, so
    // wait for the tree's own copy — the one the merged-check settles into —
    // rather than the first match.
    await screen.findByText((content, el) => content === 'old' && el?.closest('.sidebar-project-row') != null)
    expect(screen.queryByRole('button', { name: /merged workspaces/ })).not.toBeInTheDocument()
  })
})
