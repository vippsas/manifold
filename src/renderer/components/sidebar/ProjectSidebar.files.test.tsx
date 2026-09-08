// Folders in the sidebar behave like the folders of a VS Code workspace: a folder
// row opens the workspace's checkout of that repo, any number can be open at once,
// and opening one changes nothing else about the app. Agents render no sidebar
// rows at all — they are the tabs of the main view's Agent panel.
//
// A workspace spanning exactly one repo (the common case) no longer has a
// separate folder row: its own card chevron opens the file tree directly, so
// "the folder" and "the card" are the same control. A workspace spanning
// several repos still gets one folder row per repo, each independently
// disclosable and persisted via `manifold.sidebar.openFolders.v1` — those
// cases below use a two-repo workspace fixture to keep exercising that row.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import type { FolderSource } from '../../hooks/editor/useWorkspaceTree'
import {
  installElectronApi,
  installLocalStorage,
  renderSidebar,
  folderLabel,
  sampleProjects,
} from './ProjectSidebar.test-helpers'

const STORAGE_KEY = 'manifold.sidebar.openFolders.v1'

// A workspace spanning both sample repos, so it still renders a folder row per
// repo (id kept as 'w1' so it stays the default active workspace).
const twoRepoWorkspace = { id: 'w1', name: 'alpha-space', projectIds: ['p1', 'p2'], createdAt: '2024-01-01' }

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
    // Both sample workspaces are one-repo, so their own cards are the folder
    // disclosure now; keep them collapsed by starting with no active workspace.
    renderWithFiles({ activeWorkspaceId: null })

    expect(screen.queryByTestId('files-project-p1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('files-project-p2')).not.toBeInTheDocument()
  })

  // A one-repo workspace has no folder row of its own anymore — its card
  // chevron opens the file tree directly, so that chevron is now "the folder".
  it('opens the clicked folder’s files and closes them on a second click', () => {
    renderWithFiles({ activeWorkspaceId: null })

    fireEvent.click(screen.getByLabelText('Expand alpha-space'))
    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Collapse alpha-space'))
    expect(screen.queryByTestId('files-project-p1')).not.toBeInTheDocument()
  })

  // For a one-repo workspace the file tree and the card are the same control,
  // so there is no longer a folder state that can outlive the card being
  // closed. The equivalent guarantee lives in a multi-repo workspace instead:
  // its folder rows keep their own open state (in the openFolders store)
  // independent of the card's own expand/collapse.
  it('keeps a folder open when its workspace is closed and opened again', () => {
    renderWithFiles({ workspaces: [twoRepoWorkspace] })

    fireEvent.click(folderLabel('Alpha')!)
    fireEvent.click(screen.getByLabelText('Collapse alpha-space'))
    expect(screen.queryByTestId('files-project-p1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Expand alpha-space'))

    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
  })

  it('opens a folder from its chevron without moving the workspace’s home folder', () => {
    const { props } = renderWithFiles({ workspaces: [twoRepoWorkspace] })

    fireEvent.click(screen.getByLabelText('Show files in Alpha'))

    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
    expect(props.onSelectWorkspaceRepo).not.toHaveBeenCalled()
  })

  it('selects the folder when the row itself is clicked', () => {
    const { props } = renderWithFiles({ workspaces: [twoRepoWorkspace] })

    fireEvent.click(folderLabel('Alpha')!)

    expect(props.onSelectWorkspaceRepo).toHaveBeenCalledWith('w1', 'p1')
  })

  it('remembers every open folder across a restart', () => {
    const first = renderWithFiles({ workspaces: [twoRepoWorkspace] })
    fireEvent.click(folderLabel('Alpha')!)
    fireEvent.click(folderLabel('Beta')!)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual(['project:p1', 'project:p2'])
    first.unmount()

    renderWithFiles({ workspaces: [twoRepoWorkspace] })

    // Which cards are open is remembered too now (#902), so both remembered
    // folders are showing again without re-opening the card above them.
    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
    expect(screen.getByTestId('files-project-p2')).toBeInTheDocument()
  })

  // The cards are separate components. Each holding its own copy of the open set
  // would mean the later toggle saved a snapshot without the other's. Each
  // workspace here gets a second, shared repo (Gamma) purely so it renders a
  // folder row at all — the real assertion is still about Alpha's and Beta's
  // folders, one per card.
  it('saves folders opened in different cards into one remembered set', () => {
    const gamma = { id: 'p3', name: 'Gamma', path: '/repos/gamma', baseBranch: 'main', addedAt: '2024-01-03' }
    const alpha = { id: 'w1', name: 'alpha-space', projectIds: ['p1', 'p3'], createdAt: '2024-01-01' }
    const beta = { id: 'w2', name: 'beta-space', projectIds: ['p2', 'p3'], createdAt: '2024-01-02' }
    // No active workspace, so neither card starts open and each is opened here.
    renderWithFiles({
      projects: [...sampleProjects, gamma],
      workspaces: [alpha, beta],
      activeWorkspaceId: null,
    })

    fireEvent.click(screen.getByLabelText('Expand beta-space'))
    fireEvent.click(folderLabel('Beta')!)
    fireEvent.click(screen.getByLabelText('Expand alpha-space'))
    fireEvent.click(folderLabel('Alpha')!)

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual(['project:p2', 'project:p1'])
    expect(screen.getByTestId('files-project-p1')).toBeInTheDocument()
  })

  it('keeps a folder’s open state when it moves into another workspace', () => {
    // The "before" workspace has to be multi-repo too: a one-repo card never
    // writes into the openFolders store at all, since its file tree follows the
    // card's own expand state instead.
    const before = renderWithFiles({ workspaces: [twoRepoWorkspace] })
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
    renderWithFiles({ workspaces: [twoRepoWorkspace] })
    const row = folderLabel('Alpha')!.closest('[role="button"]')
    expect(row).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(folderLabel('Alpha')!)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Hide files in Alpha')).toHaveAttribute('aria-expanded', 'true')
  })
})
