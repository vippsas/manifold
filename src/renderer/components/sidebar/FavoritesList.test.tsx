import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FavoritesList } from './FavoritesList'
import { DockStateContext } from '../editor/dock-panel-types'
import type { DockAppState } from '../editor/dock-panel-types'
import type { ResolvedFavorite } from '../../../shared/types'

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
      { kind: 'workspace', id: 'w1', name: 'ML Pipeline' },
      { kind: 'repo', id: 'p2', name: 'billing' },
    ])
    expect(screen.getByText('ML Pipeline')).toBeTruthy()
    expect(screen.getByText('billing')).toBeTruthy()
    expect(screen.getByText('⌘1')).toBeTruthy()
    expect(screen.getByText('⌘2')).toBeTruthy()
  })

  it('activates a favorite on click', () => {
    const onActivateFavorite = vi.fn()
    renderList([{ kind: 'repo', id: 'p2', name: 'billing' }], { onActivateFavorite })
    fireEvent.click(screen.getByText('billing'))
    expect(onActivateFavorite).toHaveBeenCalledWith({ kind: 'repo', id: 'p2', name: 'billing' })
  })

  it('reorders via drag-and-drop', () => {
    const onReorderFavorites = vi.fn()
    renderList([
      { kind: 'repo', id: 'p1', name: 'api-gateway' },
      { kind: 'repo', id: 'p2', name: 'billing' },
    ], { onReorderFavorites })
    const rows = screen.getAllByRole('button')
    fireEvent.dragStart(rows[1])
    fireEvent.drop(rows[0])
    expect(onReorderFavorites).toHaveBeenCalledWith(1, 0)
  })
})
