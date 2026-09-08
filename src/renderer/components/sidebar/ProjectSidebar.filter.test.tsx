import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { installElectronApi, installLocalStorage, renderSidebar, sampleSessions } from './ProjectSidebar.test-helpers'

beforeEach(() => { vi.clearAllMocks(); installLocalStorage(); installElectronApi() })

const home = { id: 'w-home', name: 'Alpha', projectIds: ['p1'], createdAt: '2024-01-01' }
const oslo = { id: 'w-oslo', name: 'oslo', projectIds: ['p1'], createdAt: '2024-01-01', branchName: 'alpha/oslo', worktreePaths: { p1: '/wt/oslo' } }
const beta = { id: 'w-beta', name: 'beta-space', projectIds: ['p2'], createdAt: '2024-01-02' }

const openFilter = (): HTMLInputElement => {
  fireEvent.click(screen.getByRole('button', { name: 'Filter workspaces' }))
  return screen.getByRole('textbox', { name: 'Filter workspaces' })
}

const rowNames = (): string[] =>
  Array.from(document.querySelectorAll('.sidebar-project-row'))
    .map((row) => within(row as HTMLElement).getByRole('button', { name: /^(Expand|Collapse) / }).getAttribute('aria-label')!.replace(/^(Expand|Collapse) /, ''))

describe('sidebar filter', () => {
  it('is closed until the toolbar button opens it', () => {
    renderSidebar({ workspaces: [home, oslo, beta], activeWorkspaceId: null, sessionsByWorkspace: {} })
    expect(screen.queryByRole('textbox', { name: 'Filter workspaces' })).not.toBeInTheDocument()
    const input = openFilter()
    expect(input).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Filter workspaces' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('narrows the tree to hits and forces their groups open', () => {
    renderSidebar({ workspaces: [home, oslo, beta], activeWorkspaceId: null, sessionsByWorkspace: {} })
    fireEvent.change(openFilter(), { target: { value: 'osl' } })
    expect(rowNames()).toEqual(['oslo'])
    expect(screen.getByRole('button', { name: 'Collapse Alpha' })).toBeInTheDocument() // synthetic header stands in for the non-matching home, forced open while filtering
  })

  it('hides Favorites and Working now while filtering', () => {
    renderSidebar(
      { workspaces: [home, oslo, beta], activeWorkspaceId: null, sessionsByWorkspace: { 'w-oslo': [{ ...sampleSessions[0], status: 'running' }] } },
      { favorites: [{ id: 'w-beta', name: 'beta-space', kind: 'home' }], isFavorite: () => true, onToggleFavorite: vi.fn(), onReorderFavorites: vi.fn(), onActivateFavorite: vi.fn() },
    )
    expect(screen.getByText('Favorites')).toBeInTheDocument()
    expect(screen.getByText('Working now')).toBeInTheDocument()
    fireEvent.change(openFilter(), { target: { value: 'beta' } })
    expect(screen.queryByText('Favorites')).not.toBeInTheDocument()
    expect(screen.queryByText('Working now')).not.toBeInTheDocument()
    expect(rowNames()).toEqual(['beta-space'])
  })

  it('says so when nothing matches', () => {
    renderSidebar({ workspaces: [home, beta], activeWorkspaceId: null, sessionsByWorkspace: {} })
    fireEvent.change(openFilter(), { target: { value: 'zzz' } })
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('Escape clears and closes; blur on an empty field closes', () => {
    renderSidebar({ workspaces: [home, beta], activeWorkspaceId: null, sessionsByWorkspace: {} })
    const input = openFilter()
    fireEvent.change(input, { target: { value: 'beta' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'Filter workspaces' })).not.toBeInTheDocument()
    // 'home' is named exactly after its repo, so it now reads as Alpha's base
    // branch ('main') rather than repeating the repo's name (#7).
    expect(rowNames()).toEqual(['main', 'beta-space'])

    fireEvent.blur(openFilter())
    expect(screen.queryByRole('textbox', { name: 'Filter workspaces' })).not.toBeInTheDocument()
  })
})
