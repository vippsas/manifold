import React, { useContext, useState } from 'react'
import { DockStateContext } from '../editor/dock-panel-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { favoritesStyles } from './FavoritesList.styles'

export function FavoritesList(): React.JSX.Element | null {
  const state = useContext(DockStateContext)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  if (!state || state.favorites.length === 0) return null
  const { favorites, onActivateFavorite, onReorderFavorites } = state

  return (
    <div style={favoritesStyles.section}>
      <div style={sidebarStyles.sectionLabel}>Favorites</div>
      {favorites.map((fav, index) => (
        <div
          key={`${fav.kind}-${fav.id}`}
          role="button"
          tabIndex={0}
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (dragIndex !== null && dragIndex !== index) onReorderFavorites(dragIndex, index)
            setDragIndex(null)
          }}
          onDragEnd={() => setDragIndex(null)}
          onClick={() => onActivateFavorite(fav)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onActivateFavorite(fav)
            }
          }}
          className="sidebar-item-row sidebar-favorite-row"
          style={{ ...favoritesStyles.row, ...(dragIndex === index ? favoritesStyles.rowDragging : undefined) }}
          title={fav.name}
        >
          <span style={favoritesStyles.glyph} aria-hidden="true">{fav.kind === 'workspace' ? '◧' : '▢'}</span>
          <span className="truncate" style={favoritesStyles.name}>{fav.name}</span>
          {index < 9 && <span style={favoritesStyles.badge}>⌘{index + 1}</span>}
        </div>
      ))}
      <div style={sidebarStyles.sectionDivider} />
    </div>
  )
}
