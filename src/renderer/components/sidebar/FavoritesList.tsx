import React, { useContext, useState } from 'react'
import { DockStateContext } from '../editor/dock-panel-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { favoritesStyles } from './FavoritesList.styles'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { RepoGlyph } from './RepoGlyph'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import { useSidebarSectionState } from './sidebar-section-state'

export function FavoritesList(): React.JSX.Element | null {
  const state = useContext(DockStateContext)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [expanded, toggleExpanded] = useSidebarSectionState('favorites', true)

  if (!state || state.favorites.length === 0) return null
  const { favorites, onActivateFavorite, onReorderFavorites } = state

  return (
    <div style={favoritesStyles.section}>
      <SidebarSectionHeader
        label="Favorites"
        count={favorites.length}
        expanded={expanded}
        onToggle={toggleExpanded}
      />
      {expanded && favorites.map((fav, index) => (
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
          {fav.kind === 'workspace' ? <WorkspaceGlyph /> : <RepoGlyph />}
          <span className="truncate" style={favoritesStyles.name}>{fav.name}</span>
          {index < 9 && <span style={favoritesStyles.badge}>⌘{index + 1}</span>}
        </div>
      ))}
      <div style={sidebarStyles.sectionDivider} />
    </div>
  )
}
