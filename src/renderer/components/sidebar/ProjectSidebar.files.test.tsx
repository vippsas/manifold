// Folders in the sidebar behave like the folders of a VS Code workspace: a folder
// row opens the workspace's checkout of that repo, any number can be open at once,
// and opening one changes nothing else about the app. Agents render no sidebar
// rows at all — they are the tabs of the main view's Agent panel.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'
import {
  installElectronApi,
  installLocalStorage,
  renderSidebar,
  folderLabel,
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

    fireEvent.click(folderLabel('Alpha')!)
    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()

    fireEvent.click(folderLabel('Alpha')!)
    expect(screen.queryByTestId('files-project-p1')).not.toBeInTheDocument()
  })

  it('keeps a folder open when its workspace is closed and opened again', () => {
    renderWithFiles()

    fireEvent.click(folderLabel('Alpha')!)
    fireEvent.click(screen.getByLabelText('Collapse alpha-space'))
    expect(screen.queryByTestId('files-project-p1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Expand alpha-space'))

    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
  })

  it('opens a folder from its chevron without moving the workspace’s home folder', () => {
    const { props } = renderWithFiles()

    fireEvent.click(screen.getByLabelText('Show files in Alpha'))

    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
    expect(props.onSelectWorkspaceRepo).not.toHaveBeenCalled()
  })

  it('selects the folder when the row itself is clicked', () => {
    const { props } = renderWithFiles()

    fireEvent.click(folderLabel('Alpha')!)

    expect(props.onSelectWorkspaceRepo).toHaveBeenCalledWith('w1', 'p1')
  })

  it('remembers every open folder across a restart', () => {
    const first = renderWithFiles()
    fireEvent.click(folderLabel('Alpha')!)
    fireEvent.click(screen.getByLabelText('Expand beta-space'))
    fireEvent.click(folderLabel('Beta')!)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual(['project:p1', 'project:p2'])
    first.unmount()

    renderWithFiles()

    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Expand beta-space'))
    expect(screen.getByTestId('files-project-p2')).toBeInTheDocument()
  })

  // The cards are separate components. Each holding its own copy of the open set
  // would mean the later toggle saved a snapshot without the other's.
  it('saves folders opened in different cards into one remembered set', () => {
    renderWithFiles()

    // Both cards stay open at once now, so no re-expanding in between: the
    // point of the test is that the two toggles write to one shared set.
    fireEvent.click(screen.getByLabelText('Expand beta-space'))
    fireEvent.click(folderLabel('Beta')!)
    fireEvent.click(folderLabel('Alpha')!)

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual(['project:p2', 'project:p1'])
    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
  })

  it('keeps a folder’s open state when it moves into another workspace', () => {
    const before = renderWithFiles()
    fireEvent.click(folderLabel('Alpha')!)
    before.unmount()

    renderWithFiles({
      workspaces: [{ id: 'ws9', name: 'auth-refactor', projectIds: ['p1', 'p2'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws9',
      sessionsByWorkspace: {},
    })

    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
  })

  it('marks a folder row expanded for assistive tech', () => {
    renderWithFiles()
    const row = folderLabel('Alpha')!.closest('[role="button"]')
    expect(row).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(folderLabel('Alpha')!)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Hide files in Alpha')).toHaveAttribute('aria-expanded', 'true')
  })
})
