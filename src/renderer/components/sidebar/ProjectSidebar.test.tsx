import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import type { DraftId } from '../../../shared/draft-chat'
import {
  installElectronApi,
  installLocalStorage,
  mockInvoke,
  renderSidebar,
  folderLabel,
} from './ProjectSidebar.test-helpers'

beforeEach(() => {
  vi.clearAllMocks()
  installLocalStorage()
  installElectronApi()
})

afterEach(() => {
  // Don't delete electronAPI — React may still call unsubscribe during unmount cleanup
})

describe('ProjectSidebar', () => {
  it('names every workspace, and shows the folders of the open one', () => {
    renderSidebar()

    expect(screen.getByText('alpha-space')).toBeInTheDocument()
    expect(screen.getByText('beta-space')).toBeInTheDocument()
    expect(folderLabel('Alpha')).toBeInTheDocument()
    expect(folderLabel('Beta')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Expand beta-space'))

    expect(folderLabel('Beta')).toBeInTheDocument()
  })

  // The workspace you are working in sits at the top of the list, so it is
  // always in the same place — you never scroll to find where you are.
  it('puts the active workspace first, ahead of a more recently visited one', () => {
    localStorage.setItem('manifold.sidebar.recency.v1', JSON.stringify({ w2: 200 }))
    renderSidebar({ activeWorkspaceId: 'w1' })

    const rows = document.querySelectorAll('.sidebar-project-row')

    expect(within(rows[0] as HTMLElement).getByText('alpha-space')).toBeInTheDocument()
    expect(within(rows[1] as HTMLElement).getByText('beta-space')).toBeInTheDocument()
  })

  // Going back to where you just were is always the second row, whatever the
  // list looked like before.
  it('drops the workspace you just left to second place', () => {
    const workspaces = [
      { id: 'w1', name: 'alpha-space', projectIds: ['p1'], createdAt: '2024-01-01' },
      { id: 'w2', name: 'beta-space', projectIds: ['p2'], createdAt: '2024-01-02' },
      { id: 'w3', name: 'gamma-space', projectIds: [], createdAt: '2024-01-03' },
    ]
    const { setProps } = renderSidebar({ workspaces, activeWorkspaceId: 'w3' })

    setProps({ activeWorkspaceId: 'w1' })

    const rows = document.querySelectorAll('.sidebar-project-row')
    const names = Array.from(rows).map((row) => row.querySelector('.truncate')?.textContent)
    expect(names).toEqual(['alpha-space', 'gamma-space', 'beta-space'])
  })

  // Which repo a workspace belongs to has to be readable without opening it —
  // the name alone can't say, since only some names carry their branch prefix.
  it('names the repo of a workspace whose own name does not', () => {
    renderSidebar()

    const row = screen.getByText('alpha-space').closest('.sidebar-project-row')

    expect(within(row as HTMLElement).getByText('Alpha')).toBeInTheDocument()
    expect(row).toHaveAttribute('title', 'Alpha/alpha-space')
  })

  it('leaves the repo unsaid when the workspace is already named after it', () => {
    renderSidebar({
      workspaces: [{ id: 'w1', name: 'Alpha', projectIds: ['p1'], createdAt: '2024-01-01' }],
    })

    // Scoped to the workspace row: the folder row inside the open card says
    // "Alpha" too, which is exactly the repetition this rule avoids on the row.
    const row = document.querySelector('.sidebar-project-row')

    expect(within(row as HTMLElement).getAllByText('Alpha')).toHaveLength(1)
    expect(row).toHaveAttribute('title', 'Alpha')
  })

  it('counts the extra folders of a multi-folder workspace', () => {
    renderSidebar({
      workspaces: [{ id: 'w1', name: 'auth-refactor', projectIds: ['p1', 'p2'], createdAt: '2024-01-01' }],
    })

    const row = screen.getByText('auth-refactor').closest('.sidebar-project-row')

    expect(within(row as HTMLElement).getByText('Alpha +1')).toBeInTheDocument()
  })

  it('shows nothing but the workspace names while none is open', () => {
    renderSidebar({ activeWorkspaceId: null })

    expect(screen.getByText('alpha-space')).toBeInTheDocument()
    expect(folderLabel('Alpha')).not.toBeInTheDocument()
    expect(folderLabel('Beta')).not.toBeInTheDocument()
  })

  it('opens one workspace at a time — opening another closes the one before it', () => {
    renderSidebar()

    fireEvent.click(screen.getByLabelText('Expand beta-space'))

    expect(folderLabel('Beta')).toBeInTheDocument()
    expect(folderLabel('Alpha')).not.toBeInTheDocument()
  })

  it('closes a workspace from its chevron without changing the selection', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Collapse alpha-space'))

    expect(folderLabel('Alpha')).not.toBeInTheDocument()
    expect(props.onSelectWorkspace).not.toHaveBeenCalled()
  })

  it('gives a one-folder workspace the same folder row as a multi-folder one', () => {
    renderSidebar({
      workspaces: [
        { id: 'w1', name: 'solo', projectIds: ['p1'], createdAt: '2024-01-01' },
        { id: 'w2', name: 'pair', projectIds: ['p1', 'p2'], createdAt: '2024-01-02' },
      ],
      sessionsByWorkspace: {},
    })

    const solo = screen.getByText('solo').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(solo!).getAllByRole('button', { name: /Show files in/ })).toHaveLength(1)

    fireEvent.click(screen.getByLabelText('Expand pair'))

    const pair = screen.getByText('pair').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(pair!).getAllByRole('button', { name: /Show files in/ })).toHaveLength(2)
  })

  it('shows "No repositories yet" only when there are no workspaces at all', () => {
    renderSidebar({ workspaces: [], sessionsByWorkspace: {} })

    expect(screen.getByText('No repositories yet')).toBeInTheDocument()
  })

  // Agents are the tabs of the main view's Agent panel now; the card only shows
  // where work happens (folders) and that someone is working (the dot).
  it('shows no agent rows — agents live in the main view', () => {
    renderSidebar()

    const card = screen.getByText('alpha-space').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(card!).queryByText('oslo')).not.toBeInTheDocument()
    expect(within(card!).queryByText('bergen')).not.toBeInTheDocument()
    expect(within(card!).queryByText('Claude')).not.toBeInTheDocument()
  })

  it('pulses a dot on the workspace name while one of its agents is outputting', () => {
    renderSidebar({ outputtingSessionIds: new Set(['s1']) })

    const card = screen.getByText('alpha-space').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(card!).getByLabelText('An agent is working in this workspace')).toBeInTheDocument()
  })

  it('shows no dot while its agents are quiet', () => {
    renderSidebar()

    expect(screen.queryByLabelText('An agent is working in this workspace')).not.toBeInTheDocument()
  })

  it('calls onNewProject when Add Repository is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: 'Add Repository' }))

    expect(props.onNewProject).toHaveBeenCalled()
  })

  it('renders only Add Repository in the compact top toolbar', () => {
    renderSidebar()

    const toolbar = screen.getByRole('toolbar', { name: 'Repository actions' })
    const buttons = within(toolbar).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Add Repository'])
  })

  it('puts Copy to new worktree and Add folder on the workspace header, and no New agent', () => {
    const { props } = renderSidebar()

    const header = screen.getByText('alpha-space').closest<HTMLElement>('.sidebar-project-row')
    fireEvent.click(within(header!).getByRole('button', { name: 'Copy alpha-space to a new worktree' }))
    fireEvent.click(within(header!).getByRole('button', { name: 'Add folder to alpha-space' }))

    expect(props.onCopyWorkspace).toHaveBeenCalledWith('w1')
    expect(props.onAddProjectToWorkspace).toHaveBeenCalledWith('w1')
    expect(within(header!).queryByRole('button', { name: /Add agent/ })).not.toBeInTheDocument()
  })

  it('selecting a folder row calls onSelectWorkspaceRepo', () => {
    const { props } = renderSidebar()

    fireEvent.click(folderLabel('Alpha')!)

    expect(props.onSelectWorkspaceRepo).toHaveBeenCalledWith('w1', 'p1')
  })

  it('offers to remove a folder only while the workspace has more than one', () => {
    renderSidebar({
      workspaces: [
        { id: 'w1', name: 'solo', projectIds: ['p1'], createdAt: '2024-01-01' },
        { id: 'w2', name: 'pair', projectIds: ['p1', 'p2'], createdAt: '2024-01-02' },
      ],
      sessionsByWorkspace: {},
    })

    const solo = screen.getByText('solo').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(solo!).queryByRole('button', { name: /Remove Alpha from workspace/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Expand pair'))

    const pair = screen.getByText('pair').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(pair!).getByRole('button', { name: 'Remove Alpha from workspace' })).toBeInTheDocument()
  })

  it('removes a workspace from its header button', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('Remove alpha-space'))

    expect(props.onRemoveWorkspace).toHaveBeenCalledWith('w1')
  })

  it('renames a workspace on double-click and Enter', () => {
    const { props } = renderSidebar()

    fireEvent.doubleClick(screen.getByText('alpha-space'))
    const input = screen.getByLabelText('Workspace name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(props.onRenameWorkspace).toHaveBeenCalledWith('w1', 'Renamed')
  })

  it('keeps the caret at the end while typing a rename (no re-select on each keystroke)', () => {
    renderSidebar()

    fireEvent.doubleClick(screen.getByText('alpha-space'))
    const input = screen.getByLabelText('Workspace name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Re' } })

    // A re-running focus/select ref would select the whole draft after every
    // render, so the next keystroke would overwrite it all.
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(2)
  })

  it('discards a workspace rename on Escape', () => {
    const { props } = renderSidebar()

    fireEvent.doubleClick(screen.getByText('alpha-space'))
    const input = screen.getByLabelText('Workspace name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Nope' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(props.onRenameWorkspace).not.toHaveBeenCalled()
    expect(screen.getByText('alpha-space')).toBeInTheDocument()
  })

  it('ignores a blank workspace rename', () => {
    const { props } = renderSidebar()

    fireEvent.doubleClick(screen.getByText('alpha-space'))
    const input = screen.getByLabelText('Workspace name') as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(props.onRenameWorkspace).not.toHaveBeenCalled()
  })

  it('selects a workspace when its header row is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('alpha-space'))

    expect(props.onSelectWorkspace).toHaveBeenCalledWith('w1')
  })

  it('renders a New Workspace list action that calls onNewWorkspace', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByLabelText('New Workspace'))

    expect(props.onNewWorkspace).toHaveBeenCalled()
  })

  it('keeps a static Workspaces label that is not a collapse control', () => {
    renderSidebar()

    expect(screen.getByText('Workspaces')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Workspaces' })).not.toBeInTheDocument()
  })

  it('renders a draft chat row in the workspace holding its repo', () => {
    renderSidebar({
      drafts: [{ id: 'draft-1' as DraftId, projectId: 'p1', runtimeId: 'claude' }],
    })

    const card = screen.getByText('alpha-space').closest<HTMLElement>('.sidebar-workspace-card')
    expect(within(card!).getByText('New chat')).toBeInTheDocument()
  })

  it('does not render favorite buttons on workspace cards', () => {
    renderSidebar()

    expect(screen.queryByLabelText(/to Favorites/)).not.toBeInTheDocument()
  })

  it('offers a fetch action on a git folder row', () => {
    renderSidebar()

    expect(screen.getByRole('button', { name: 'Fetch Alpha' })).toBeInTheDocument()
  })

  // The fetch acts on the repo's clone and its base branch — not on the
  // workspace's checkout — and must not double as selecting the folder.
  it('fetches the folder’s repo without selecting the row', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: 'Fetch Alpha' }))

    expect(mockInvoke).toHaveBeenCalledWith('git:fetch', 'p1')
    expect(props.onSelectWorkspaceRepo).not.toHaveBeenCalled()
  })

  it('offers no fetch action on a plain folder', () => {
    renderSidebar({
      projects: [{ id: 'p1', name: 'Alpha', path: '/repos/alpha', baseBranch: 'main', addedAt: '2024-01-01', kind: 'folder' }],
    })

    expect(screen.queryByRole('button', { name: /Fetch Alpha/ })).not.toBeInTheDocument()
  })

  it('badges the row with how far behind origin the repo is', () => {
    renderSidebar({ behindCounts: { p1: 2 } })

    expect(screen.getByRole('button', { name: 'Fetch Alpha (2 behind origin)' })).toBeInTheDocument()
  })

  it('reports what the fetch brought in, under the row', async () => {
    mockInvoke.mockResolvedValue({ updatedBranch: 'main', previousRef: 'a', currentRef: 'b', commitCount: 3 })
    renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: 'Fetch Alpha' }))

    expect(await screen.findByText('Updated main: 3 new commits')).toBeInTheDocument()
  })

  it('reports why a fetch failed', async () => {
    mockInvoke.mockRejectedValue(new Error('fatal: unable to access remote'))
    renderSidebar()

    fireEvent.click(screen.getByRole('button', { name: 'Fetch Alpha' }))

    expect(await screen.findByText('fatal: unable to access remote')).toBeInTheDocument()
  })
})
