import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FavoriteStarButton } from './FavoriteStarButton'
import { DockStateContext } from '../editor/dock-panel-types'
import type { DockAppState } from '../editor/dock-panel-types'

function renderWithContext(overrides: Partial<DockAppState>) {
  const value = {
    isFavorite: vi.fn().mockReturnValue(false),
    onToggleFavorite: vi.fn(),
    ...overrides,
  } as unknown as DockAppState
  return { value, ...render(
    <DockStateContext.Provider value={value}>
      <FavoriteStarButton kind="repo" id="p1" name="api-gateway" />
    </DockStateContext.Provider>,
  ) }
}

describe('FavoriteStarButton', () => {
  it('renders nothing without a DockState context', () => {
    const { container } = render(<FavoriteStarButton kind="repo" id="p1" name="api-gateway" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an outline star and "Add to Favorites" label when not favorited', () => {
    renderWithContext({ isFavorite: vi.fn().mockReturnValue(false) })
    expect(screen.getByLabelText('Add api-gateway to Favorites')).toBeTruthy()
  })

  it('toggles favorite and stops row activation on click', () => {
    const onToggleFavorite = vi.fn()
    const { value } = renderWithContext({ onToggleFavorite })
    const btn = screen.getByLabelText('Add api-gateway to Favorites')
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
    const stop = vi.spyOn(clickEvent, 'stopPropagation')
    fireEvent(btn, clickEvent)
    expect(onToggleFavorite).toHaveBeenCalledWith('repo', 'p1')
    expect(stop).toHaveBeenCalled()
    expect(value.isFavorite).toBeDefined()
  })
})
