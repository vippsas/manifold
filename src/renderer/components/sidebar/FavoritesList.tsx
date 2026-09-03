import React, { useContext, useState } from 'react'
import { ContextMenu } from '../common/ContextMenu'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'
import { useContextMenu } from '../../hooks/useContextMenu'
import { sidebarStyles } from './ProjectSidebar.styles'
import { favoritesStyles } from './FavoritesList.styles'
import { WorkspaceGlyph } from './WorkspaceGlyph'
import { SidebarSectionHeader } from './SidebarSectionHeader'
import { useSidebarSectionState } from './sidebar-section-state'

export function FavoritesList(): React.JSX.Element | null {
  const state = useContext(DockStateContext)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  // Which row the open menu belongs to. The rows share one menu because only
  // one can be open at a time, and a per-row menu would re-mount on every drag.
  const menu = useContextMenu()
  const [menuTarget, setMenuTarget] = useState<string | null>(null)
  const [expanded, toggleExpanded] = useSidebarSectionState('favorites', true)

  if (!state || state.favorites.length === 0) return null
  const { favorites, onActivateFavorite, onReorderFavorites, onToggleFavorite } = state

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
          key={fav.id}
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
          onContextMenu={(e) => { setMenuTarget(fav.id); menu.open(e) }}
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
          <WorkspaceGlyph worktree={fav.worktree} />
          <span className="truncate" style={favoritesStyles.name}>{fav.name}</span>
          {index < 9 && <span style={favoritesStyles.badge}>⌘{index + 1}</span>}
        </div>
      ))}
      <div style={sidebarStyles.sectionDivider} />
      {/* Unfavoriting used to live only on the workspace's own card further down
          the list, so a favorite whose card was out of sight read as stuck.
          Removal is the row's whole vocabulary — everything else a workspace can
          do stays on the card, which is the row that owns those actions. */}
      {menu.position && menuTarget && (
        <ContextMenu
          x={menu.position.x}
          y={menu.position.y}
          items={[{ label: 'Remove from Favorites', action: () => onToggleFavorite(menuTarget) }]}
          onClose={() => { menu.close(); setMenuTarget(null) }}
        />
      )}
    </div>
  )
}
