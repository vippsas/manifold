// Folders in the sidebar behave like the folders of a VS Code workspace: a repo
// row opens its own checkout, an agent row opens its worktree, any number can be
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

  it('opens the clicked repo’s files and closes them on a second click', () => {
    renderWithFiles()

    fireEvent.click(screen.getByText('Alpha'))
    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Alpha'))
    expect(screen.queryByTestId('files-project-p1')).not.toBeInTheDocument()
  })

  it('keeps several repos open at once', () => {
    renderWithFiles()

    fireEvent.click(screen.getByText('Alpha'))
    fireEvent.click(screen.getByText('Beta'))

    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
    expect(screen.getByTestId('files-project-p2')).toBeInTheDocument()
  })

  // Opening a folder used to switch sessions, which reloaded the agent, the
  // editor and the tree, and reordered this list under the cursor.
  it('does not select the repo it opens', () => {
    const { props } = renderWithFiles()

    fireEvent.click(screen.getByText('Beta'))

    expect(props.onSelectProject).not.toHaveBeenCalled()
  })

  it('opens an agent’s worktree from its own row, leaving the repo folder alone', () => {
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
