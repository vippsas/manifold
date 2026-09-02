import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import {
  folderLabel,
  installElectronApi,
  installLocalStorage,
  renderSidebar,
  sampleProjects,
  sampleWorkspaces,
} from './ProjectSidebar.test-helpers'

/** The folder row's label inside the expanded `alpha-space` card — the element
 *  the right-click lands on. */
function folderRow(name = 'Alpha'): HTMLElement {
  const label = folderLabel(name)
  if (!label) throw new Error(`no folder row rendered for ${name}`)
  return label
}

function menuLabels(): string[] {
  return Array.from(document.querySelectorAll('.context-menu-item')).map((el) => el.textContent ?? '')
}

describe('WorkspaceRepoRow context menu', () => {
  const writeText = vi.fn()
  const originalClipboard = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard')

  beforeEach(() => {
    installLocalStorage()
    installElectronApi()
    // The row reads the preload's static home to tilde-shorten; the stub from
    // installElectronApi carries none, so the tests establish one explicitly.
    window.electronAPI.homeDir = '/Users/tester'
    writeText.mockReset()
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
  })

  afterEach(() => {
    if (originalClipboard) Object.defineProperty(window.navigator, 'clipboard', originalClipboard)
    else delete (window.navigator as { clipboard?: unknown }).clipboard
  })

  it('opens on right-click with Copy Path then Copy Relative Path', () => {
    renderSidebar()
    fireEvent.contextMenu(folderRow())

    expect(menuLabels()).toEqual(['Copy Path', 'Copy Relative Path'])
  })

  it('does not also open the workspace card menu', () => {
    renderSidebar()
    fireEvent.contextMenu(folderRow())

    expect(screen.getByText('Copy Path')).toBeTruthy()
    expect(screen.queryByText('Remove Workspace')).not.toBeInTheDocument()
  })

  it('Copy Path writes the folder\'s absolute path', () => {
    renderSidebar()
    fireEvent.contextMenu(folderRow())
    fireEvent.click(screen.getByText('Copy Path'))

    expect(writeText).toHaveBeenCalledWith('/repos/alpha')
    expect(screen.queryByText('Copy Path')).not.toBeInTheDocument()
  })

  it('Copy Relative Path tilde-shortens a path under the preload-exposed home', () => {
    const homeProjects = [{ ...sampleProjects[0], path: '/Users/tester/repos/alpha' }]
    renderSidebar({ projects: homeProjects })
    fireEvent.contextMenu(folderRow())
    fireEvent.click(screen.getByText('Copy Relative Path'))

    expect(writeText).toHaveBeenCalledWith('~/repos/alpha')
  })

  it('Copy Relative Path stays absolute outside home', () => {
    renderSidebar()
    fireEvent.contextMenu(folderRow())
    fireEvent.click(screen.getByText('Copy Relative Path'))

    expect(writeText).toHaveBeenCalledWith('/repos/alpha')
  })

  it('Copy Relative Path does not claim another user\'s home', () => {
    const otherHomeProjects = [{ ...sampleProjects[0], path: '/Users/someoneelse/repos/alpha' }]
    renderSidebar({ projects: otherHomeProjects })
    fireEvent.contextMenu(folderRow())
    fireEvent.click(screen.getByText('Copy Relative Path'))

    expect(writeText).toHaveBeenCalledWith('/Users/someoneelse/repos/alpha')
  })

  it('copies the worktree checkout, not the registered clone, in a worktree workspace', () => {
    const worktreeWorkspaces = [
      { ...sampleWorkspaces[0], worktreePaths: { p1: '/Users/tester/worktrees/alpha-space' } },
      sampleWorkspaces[1],
    ]
    renderSidebar({ workspaces: worktreeWorkspaces })
    fireEvent.contextMenu(folderRow())
    fireEvent.click(screen.getByText('Copy Path'))

    expect(writeText).toHaveBeenCalledWith('/Users/tester/worktrees/alpha-space')
  })

  it('disables both items on a row with no known path', () => {
    const ghostWorkspaces = [{ ...sampleWorkspaces[0], projectIds: ['ghost'] }]
    renderSidebar({ workspaces: ghostWorkspaces })
    fireEvent.contextMenu(folderRow('ghost'))

    for (const label of ['Copy Path', 'Copy Relative Path']) {
      expect(screen.getByText(label).getAttribute('aria-disabled')).toBe('true')
      fireEvent.click(screen.getByText(label))
    }
    expect(writeText).not.toHaveBeenCalled()
  })
})
