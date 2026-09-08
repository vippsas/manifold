import React from 'react'
import { ContextMenu } from '../common/ContextMenu'
import { buildWorkspaceContextMenu } from './workspace-context-menu'
import { buildRepoRowContextMenu } from './repo-row-context-menu'

export interface WorkspaceCardMenuProps {
  position: { x: number; y: number }
  workspaceId: string
  /** Seeds the rename draft; the label the row displays, not the stored name. */
  renameSeed: string
  isFavorite?: boolean
  onToggleFavorite?: () => void
  onRename?: (seed: string) => void
  onAddFolder?: () => void
  onRemoveWorkspace: () => void
  /** Present only on a workspace spanning one repo — see `soloPath` below. */
  soloPath?: string
  /** True when this card stands in for a folder row it no longer renders. */
  isSoloRepo: boolean
  onClose: () => void
}

/** The workspace row's menu, assembled.
 *
 *  A card spanning one repo renders no folder row, so it inherits that row's
 *  path items here — the menu is then the only place "where is this checkout?"
 *  is answered for the common case. A multi-repo card leaves those items to its
 *  folder rows, where each path belongs to a named repo. */
export function WorkspaceCardMenu({
  position, workspaceId, renameSeed, isFavorite, onToggleFavorite, onRename,
  onAddFolder, onRemoveWorkspace, soloPath, isSoloRepo, onClose,
}: WorkspaceCardMenuProps): React.JSX.Element {
  return (
    <ContextMenu
      x={position.x}
      y={position.y}
      items={buildWorkspaceContextMenu({
        isFavorite,
        toggleFavorite: onToggleFavorite,
        rename: onRename ? () => onRename(renameSeed) : undefined,
        addFolder: onAddFolder,
        removeWorkspace: onRemoveWorkspace,
        extraItems: isSoloRepo
          ? buildRepoRowContextMenu(soloPath, window.electronAPI.homeDir)
          : undefined,
      })}
      onClose={onClose}
    />
  )
}
