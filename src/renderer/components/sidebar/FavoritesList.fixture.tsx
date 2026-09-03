import React from 'react'
import { FavoritesList } from './FavoritesList'
import { DockStateContext, type DockAppState } from '../editor/editor-shell/dock-panel-types'

const dock = {
  favorites: [
    { id: 'w1', name: 'ai-labs', worktree: false },
    { id: 'w2', name: 'billing', worktree: true },
  ],
  onActivateFavorite: () => undefined,
  onReorderFavorites: () => undefined,
  isFavorite: () => true,
  onToggleFavorite: () => undefined,
} as unknown as DockAppState

export default (
  <DockStateContext.Provider value={dock}>
    <div style={{ width: 260, background: 'var(--bg-secondary)', padding: 8 }}>
      <FavoritesList />
    </div>
  </DockStateContext.Provider>
)
