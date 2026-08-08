import { beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { FavoritesList } from './FavoritesList'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'
import type { DockAppState } from '../editor/editor-shell/dock-panel-types'
import type { ResolvedFavorite } from '../../../shared/types'
import { installLocalStorage } from './ProjectSidebar.test-helpers'

function renderList(favorites: ResolvedFavorite[], overrides: Partial<DockAppState> = {}) {
  const value = {
    favorites,
    onActivateFavorite: vi.fn(),
    onReorderFavorites: vi.fn(),
    isFavorite: vi.fn(),
    onToggleFavorite: vi.fn(),
    ...overrides,
  } as unknown as DockAppState
  render(
    <DockStateContext.Provider value={value}>
      <FavoritesList />
    </DockStateContext.Provider>,
  )
  return value
}

describe('FavoritesList', () => {
  beforeEach(() => {
    installLocalStorage()
  })

  it('renders nothing when there are no favorites', () => {
    const { container } = render(
      <DockStateContext.Provider value={{ favorites: [], onActivateFavorite: vi.fn(), onReorderFavorites: vi.fn() } as unknown as DockAppState}>
        <FavoritesList />
      </DockStateContext.Provider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders favorite names with ⌘ badges for the first nine', () => {
    renderList([
      { id: 'w1', name: 'ML Pipeline', worktree: false },
      { id: 'w2', name: 'billing', worktree: false },
    ])
    expect(screen.getByText('ML Pipeline')).toBeTruthy()
    expect(screen.getByText('billing')).toBeTruthy()
    expect(screen.getByText('⌘1')).toBeTruthy()
    expect(screen.getByText('⌘2')).toBeTruthy()
  })

  // Same glyph rule as the workspace list below, so a starred worktree still
  // reads as a worktree up here.
  it('draws a branch for a worktree favorite and a folder for a home one', () => {
    renderList([
      { id: 'w1', name: 'ML Pipeline', worktree: true },
      { id: 'w2', name: 'billing', worktree: false },
    ])

    const glyphOf = (name: string): string | null | undefined =>
      screen.getByText(name).closest('.sidebar-favorite-row')
        ?.querySelector('[data-glyph]')?.getAttribute('data-glyph')

    expect(glyphOf('ML Pipeline')).toBe('worktree')
    expect(glyphOf('billing')).toBe('folder')
  })

  it('activates a favorite on click', () => {
    const onActivateFavorite = vi.fn()
    renderList([{ id: 'w2', name: 'billing', worktree: false }], { onActivateFavorite })
    fireEvent.click(screen.getByText('billing'))
    expect(onActivateFavorite).toHaveBeenCalledWith({ id: 'w2', name: 'billing', worktree: false })
  })

  it('reorders via drag-and-drop', () => {
    const onReorderFavorites = vi.fn()
    renderList([
      { id: 'w3', name: 'api-gateway', worktree: false },
      { id: 'w2', name: 'billing', worktree: false },
    ], { onReorderFavorites })
    const apiRow = screen.getByText('api-gateway').closest('[role="button"]') as HTMLElement
    const billingRow = screen.getByText('billing').closest('[role="button"]') as HTMLElement
    fireEvent.dragStart(billingRow)
    fireEvent.drop(apiRow)
    expect(onReorderFavorites).toHaveBeenCalledWith(1, 0)
  })

  it('collapses favorites to a header-only row', () => {
    renderList([
      { id: 'w1', name: 'ML Pipeline', worktree: false },
      { id: 'w2', name: 'billing', worktree: false },
    ])

    fireEvent.click(screen.getByTitle('Collapse Favorites'))

    expect(screen.getByText('Favorites')).toBeTruthy()
    expect(screen.queryByText('ML Pipeline')).not.toBeInTheDocument()
    expect(screen.queryByText('billing')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle('Expand Favorites'))

    expect(screen.getByText('ML Pipeline')).toBeTruthy()
    expect(screen.getByText('billing')).toBeTruthy()
  })

  it('restores the persisted favorites collapsed state', () => {
    const favorites: ResolvedFavorite[] = [
      { id: 'w1', name: 'ML Pipeline', worktree: false },
      { id: 'w2', name: 'billing', worktree: false },
    ]
    renderList(favorites)

    fireEvent.click(screen.getByTitle('Collapse Favorites'))
    cleanup()
    renderList(favorites)

    expect(screen.getByTitle('Expand Favorites')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('ML Pipeline')).not.toBeInTheDocument()
    expect(screen.queryByText('billing')).not.toBeInTheDocument()
  })
})
