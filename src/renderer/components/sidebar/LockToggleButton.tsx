import React, { useContext } from 'react'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'
import { LockGlyph } from './LockGlyph'

interface LockToggleButtonProps {
  sessionId: string
  locked: boolean
  name: string
}

/**
 * Lock/unlock toggle for an agent row. Mirrors FavoriteStarButton: reads the
 * toggle off DockStateContext so it works wherever an agent row renders without
 * prop drilling. A locked agent is protected from deletion until unlocked.
 */
export function LockToggleButton({ sessionId, locked, name }: LockToggleButtonProps): React.JSX.Element | null {
  const state = useContext(DockStateContext)
  if (!state) return null

  const handleClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    state.onToggleLocked(sessionId, !locked)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={(e) => e.stopPropagation()}
      className={`sidebar-icon-button sidebar-lock-toggle${locked ? ' is-locked' : ''}`}
      aria-label={locked ? `Unlock ${name}` : `Lock ${name} to prevent deletion`}
      aria-pressed={locked}
      title={locked ? 'Unlock agent' : 'Lock agent to prevent deletion'}
    >
      <LockGlyph locked={locked} />
    </button>
  )
}
