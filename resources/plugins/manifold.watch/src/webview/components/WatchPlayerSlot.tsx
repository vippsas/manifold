// resources/plugins/manifold.watch/src/webview/components/WatchPlayerSlot.tsx
// Ported verbatim from src/renderer/components/watch/WatchPlayerSlot.tsx.
import React from 'react'
import { watchStyles as s } from '../styles/WatchPanel.styles'
import { WatchActivePlayer } from './WatchActivePlayer'

interface VideoInfo {
  url: string
  title?: string
}

interface Props {
  entry: VideoInfo | null
  hidden: boolean
  onHide: () => void
  onShow: () => void
}

/**
 * Renders either the active video player, a compact "Show video player"
 * stub when the user has collapsed it, or nothing when no entry is
 * focused. Extracted so WatchPanel's render tree stays compact and the
 * wide-mode layout can drop this node into a side column.
 */
export function WatchPlayerSlot({ entry, hidden, onHide, onShow }: Props): React.JSX.Element | null {
  if (!entry) return null
  if (hidden) {
    return (
      <button type="button" onClick={onShow} style={s.showVideoButton}>
        ▶ Show video player
      </button>
    )
  }
  return <WatchActivePlayer entry={entry} onHide={onHide} />
}
