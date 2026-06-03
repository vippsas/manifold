import React, { useContext } from 'react'
import type { FavoriteKind } from '../../../shared/types'
import { DockStateContext } from '../editor/dock-panel-types'

interface FavoriteStarButtonProps {
  kind: FavoriteKind
  id: string
  name: string
}

export function FavoriteStarButton({ kind, id, name }: FavoriteStarButtonProps): React.JSX.Element | null {
  const state = useContext(DockStateContext)
  if (!state) return null

  const favorited = state.isFavorite(kind, id)
  const handleClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    state.onToggleFavorite(kind, id)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={(e) => e.stopPropagation()}
      className={`sidebar-icon-button sidebar-favorite-star${favorited ? ' is-favorite' : ''}`}
      aria-label={favorited ? `Remove ${name} from Favorites` : `Add ${name} to Favorites`}
      aria-pressed={favorited}
      title={favorited ? 'Remove from Favorites' : 'Add to Favorites'}
    >
      {favorited ? '★' : '☆'}
    </button>
  )
}
