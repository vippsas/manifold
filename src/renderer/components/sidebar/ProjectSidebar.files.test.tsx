// Folders in the sidebar behave like the folders of a VS Code workspace: a folder
// row opens its own checkout, a worktree row opens its worktree, any number can be
// open at once, and opening one changes nothing else about the app.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'
import {
  installElectronApi,
  installLocalStorage,
  renderSidebar,
} from './ProjectSidebar.test-helpers'

const STORAGE_KEY = 'manifold.sidebar.openFolders.v1'

function renderWithFiles(overrides: Record<string, unknown> = {}) {
  return renderSidebar({
    renderFolderFiles: (source: FolderSource) => <div data-testid={`files-${source.kind}-${source.id}`} />,
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  installLocalStorage()
  installElectronApi()
})

describe('sidebar folders', () => {
  it('shows no tree until a folder is opened', () => {
    renderWithFiles()

    expect(screen.queryByTestId('files-project-p1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('files-project-p2')).not.toBeInTheDocument()
  })

  it('opens the clicked folder’s files and closes them on a second click', () => {
    renderWithFiles()

    fireEvent.click(screen.getByText('Alpha'))
    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Alpha'))
    expect(screen.queryByTestId('files-project-p1')).not.toBeInTheDocument()
  })

  it('keeps folders in different workspaces open at once', () => {
    renderWithFiles()

    fireEvent.click(screen.getByText('Alpha'))
    fireEvent.click(screen.getByText('Beta'))

    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
    expect(screen.getByTestId('files-project-p2')).toBeInTheDocument()
  })

  it('opens a folder from its chevron without moving the workspace’s home folder', () => {
    const { props } = renderWithFiles()

    fireEvent.click(screen.getByLabelText('Show files in Alpha'))

    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
    expect(props.onSelectWorkspaceRepo).not.toHaveBeenCalled()
  })

  it('selects the folder when the row itself is clicked', () => {
    const { props } = renderWithFiles()

    fireEvent.click(screen.getByText('Alpha'))

    expect(props.onSelectWorkspaceRepo).toHaveBeenCalledWith('w1', 'p1')
    expect(props.onSelectSession).not.toHaveBeenCalled()
  })

  it('opens a worktree from its own row, leaving the folder alone', () => {
    renderWithFiles()

    fireEvent.click(screen.getByLabelText('Show files in alpha/oslo'))

    expect(screen.getByTestId('files-session-s1')).toBeInTheDocument()
    expect(screen.queryByTestId('files-project-p1')).not.toBeInTheDocument()
  })

  // The row is the folder, not just the chevron on it.
  it('opens the worktree when the agent row itself is clicked, and selects the agent', () => {
    const { props } = renderWithFiles()

    fireEvent.click(screen.getByText('oslo'))

    expect(screen.getByTestId('files-session-s1')).toBeInTheDocument()
    expect(props.onSelectSession).toHaveBeenCalledWith('s1', 'p1')
  })

  it('does not select the agent when only its chevron is clicked', () => {
    const { props } = renderWithFiles()

    fireEvent.click(screen.getByLabelText('Show files in alpha/oslo'))

    expect(props.onSelectSession).not.toHaveBeenCalled()
  })

  it('remembers every open folder across a restart', () => {
    const first = renderWithFiles()
    fireEvent.click(screen.getByText('Alpha'))
    fireEvent.click(screen.getByLabelText('Show files in alpha/bergen'))
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual(['project:p1', 'session:s2'])
    first.unmount()

    renderWithFiles()

    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
    expect(screen.getByTestId('files-session-s2')).toBeInTheDocument()
  })

  // The cards are separate components. Each holding its own copy of the open set
  // would mean the later toggle saved a snapshot without the other's.
  it('saves folders opened in different cards into one remembered set', () => {
    renderWithFiles()

    fireEvent.click(screen.getByText('Beta'))
    fireEvent.click(screen.getByText('Alpha'))

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual(['project:p2', 'project:p1'])
    expect(screen.getByTestId('files-project-p2')).toBeInTheDocument()
    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
  })

  it('keeps a folder’s open state when it moves into another workspace', () => {
    const before = renderWithFiles()
    fireEvent.click(screen.getByText('Alpha'))
    before.unmount()

    renderWithFiles({
      workspaces: [{ id: 'ws9', name: 'auth-refactor', projectIds: ['p1', 'p2'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws9',
      sessionsByWorkspace: {},
    })

    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
  })

  it('marks both kinds of row expanded for assistive tech', () => {
    renderWithFiles()
    const row = screen.getByText('Alpha').closest('[role="button"]')
    expect(row).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByText('Alpha'))
    expect(row).toHaveAttribute('aria-expanded', 'true')

    const worktreeToggle = screen.getByLabelText('Show files in alpha/oslo')
    expect(worktreeToggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(worktreeToggle)
    expect(screen.getByLabelText('Hide files in alpha/oslo')).toHaveAttribute('aria-expanded', 'true')
  })
})
