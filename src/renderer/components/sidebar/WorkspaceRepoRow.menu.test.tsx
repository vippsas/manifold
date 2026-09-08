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

// A workspace spanning both sample repos, so it still renders a folder row per
// repo (id kept as 'w1' so it stays the default active workspace). A one-repo
// workspace renders no folder row anymore — see the "solo" test at the bottom,
// which drives the same menu from the workspace card itself instead.
const twoRepoWorkspace = { ...sampleWorkspaces[0], projectIds: ['p1', 'p2'] }

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
    renderSidebar({ workspaces: [twoRepoWorkspace] })
    fireEvent.contextMenu(folderRow())

    expect(menuLabels()).toEqual(['Copy Path', 'Copy Relative Path'])
  })

  it('does not also open the workspace card menu', () => {
    renderSidebar({ workspaces: [twoRepoWorkspace] })
    fireEvent.contextMenu(folderRow())

    expect(screen.getByText('Copy Path')).toBeTruthy()
    expect(screen.queryByText('Remove Workspace')).not.toBeInTheDocument()
  })

  it('Copy Path writes the folder\'s absolute path', () => {
    renderSidebar({ workspaces: [twoRepoWorkspace] })
    fireEvent.contextMenu(folderRow())
    fireEvent.click(screen.getByText('Copy Path'))

    expect(writeText).toHaveBeenCalledWith('/repos/alpha')
    expect(screen.queryByText('Copy Path')).not.toBeInTheDocument()
  })

  it('Copy Relative Path tilde-shortens a path under the preload-exposed home', () => {
    const homeProjects = [{ ...sampleProjects[0], path: '/Users/tester/repos/alpha' }, sampleProjects[1]]
    renderSidebar({ projects: homeProjects, workspaces: [twoRepoWorkspace] })
    fireEvent.contextMenu(folderRow())
    fireEvent.click(screen.getByText('Copy Relative Path'))

    expect(writeText).toHaveBeenCalledWith('~/repos/alpha')
  })

  it('Copy Relative Path stays absolute outside home', () => {
    renderSidebar({ workspaces: [twoRepoWorkspace] })
    fireEvent.contextMenu(folderRow())
    fireEvent.click(screen.getByText('Copy Relative Path'))

    expect(writeText).toHaveBeenCalledWith('/repos/alpha')
  })

  it('Copy Relative Path does not claim another user\'s home', () => {
    const otherHomeProjects = [{ ...sampleProjects[0], path: '/Users/someoneelse/repos/alpha' }, sampleProjects[1]]
    renderSidebar({ projects: otherHomeProjects, workspaces: [twoRepoWorkspace] })
    fireEvent.contextMenu(folderRow())
    fireEvent.click(screen.getByText('Copy Relative Path'))

    expect(writeText).toHaveBeenCalledWith('/Users/someoneelse/repos/alpha')
  })

  it('copies the worktree checkout, not the registered clone, in a worktree workspace', () => {
    const worktreeWorkspace = { ...twoRepoWorkspace, worktreePaths: { p1: '/Users/tester/worktrees/alpha-space' } }
    renderSidebar({ workspaces: [worktreeWorkspace] })
    fireEvent.contextMenu(folderRow())
    fireEvent.click(screen.getByText('Copy Path'))

    expect(writeText).toHaveBeenCalledWith('/Users/tester/worktrees/alpha-space')
  })

  it('disables both items on a row with no known path', () => {
    // Two projects, not one — a one-repo workspace renders no folder row at
    // all now, so "ghost" needs a sibling repo to still get a row to click.
    const ghostWorkspace = { ...sampleWorkspaces[0], projectIds: ['p1', 'ghost'] }
    renderSidebar({ workspaces: [ghostWorkspace] })
    fireEvent.contextMenu(folderRow('ghost'))

    for (const label of ['Copy Path', 'Copy Relative Path']) {
      expect(screen.getByText(label).getAttribute('aria-disabled')).toBe('true')
      fireEvent.click(screen.getByText(label))
    }
    expect(writeText).not.toHaveBeenCalled()
  })

  // A one-repo workspace renders no folder row, so it inherits Copy Path /
  // Copy Relative Path onto its own card's context menu instead
  // (WorkspaceCardMenu's `extraItems`) — this is the solo-repo replacement for
  // the folder row's menu the other tests in this file exercise.
  it('gives a solo workspace Copy Path / Copy Relative Path on its own card menu', () => {
    renderSidebar()
    const row = screen.getByText('alpha-space').closest('.sidebar-project-row')!
    fireEvent.contextMenu(row)

    expect(menuLabels()).toContain('Copy Path')
    expect(menuLabels()).toContain('Copy Relative Path')

    fireEvent.click(screen.getByText('Copy Path'))
    expect(writeText).toHaveBeenCalledWith('/repos/alpha')
  })
})
