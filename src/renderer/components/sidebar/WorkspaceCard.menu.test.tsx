import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { installElectronApi, installLocalStorage, renderSidebar } from './ProjectSidebar.test-helpers'

/** The `alpha-space` workspace row (w1) — the card the menu is opened from. */
function workspaceRow(): HTMLElement {
  const row = document.querySelector<HTMLElement>('.sidebar-project-row')
  if (!row) throw new Error('no workspace row rendered')
  return row
}

function dockState(overrides: Record<string, unknown> = {}) {
  return {
    favorites: [],
    isFavorite: vi.fn(() => false),
    onToggleFavorite: vi.fn(),
    onReorderFavorites: vi.fn(),
    onActivateFavorite: vi.fn(),
    ...overrides,
  }
}

describe('WorkspaceCard context menu', () => {
  beforeEach(() => {
    installLocalStorage()
    installElectronApi()
  })

  it('opens on right-click with the full set of workspace actions', () => {
    renderSidebar({}, dockState())
    fireEvent.contextMenu(workspaceRow())

    expect(screen.getByText('Add to Favorites')).toBeTruthy()
    expect(screen.getByText('Rename…')).toBeTruthy()
    expect(screen.getByText('Copy to New Worktree')).toBeTruthy()
    expect(screen.getByText('Add Folder…')).toBeTruthy()
    expect(screen.getByText('Remove Workspace')).toBeTruthy()
  })

  it('does not open until the row is right-clicked', () => {
    renderSidebar({}, dockState())
    expect(screen.queryByText('Add to Favorites')).not.toBeInTheDocument()
  })

  it('favorites the workspace the menu was opened from', () => {
    const onToggleFavorite = vi.fn()
    renderSidebar({}, dockState({ onToggleFavorite }))

    fireEvent.contextMenu(workspaceRow())
    fireEvent.click(screen.getByText('Add to Favorites'))

    expect(onToggleFavorite).toHaveBeenCalledWith('w1')
  })

  it('offers removal when the workspace is already a favorite', () => {
    renderSidebar({}, dockState({ isFavorite: vi.fn(() => true) }))
    fireEvent.contextMenu(workspaceRow())

    expect(screen.getByText('Remove from Favorites')).toBeTruthy()
    expect(screen.queryByText('Add to Favorites')).not.toBeInTheDocument()
  })

  it('closes after an item is chosen', () => {
    renderSidebar({}, dockState())
    fireEvent.contextMenu(workspaceRow())
    fireEvent.click(screen.getByText('Add to Favorites'))

    expect(screen.queryByText('Add to Favorites')).not.toBeInTheDocument()
  })

  it('starts the inline rename from the menu', () => {
    renderSidebar({}, dockState())
    fireEvent.contextMenu(workspaceRow())
    fireEvent.click(screen.getByText('Rename…'))

    expect(screen.getByLabelText('Workspace name')).toBeTruthy()
  })

  it('removes the workspace from the menu, which carries no click event', () => {
    const onRemoveWorkspace = vi.fn(async () => undefined)
    renderSidebar({ onRemoveWorkspace }, dockState())
    fireEvent.contextMenu(workspaceRow())
    fireEvent.click(screen.getByText('Remove Workspace'))

    expect(onRemoveWorkspace).toHaveBeenCalledWith('w1')
  })
})
