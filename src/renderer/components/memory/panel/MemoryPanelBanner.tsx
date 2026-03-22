import React from 'react'
import { memoryStyles as s } from '../MemoryPanel.styles'

interface MemoryPanelBannerProps {
  onOpenSearch?: () => void
}

export function MemoryPanelBanner({ onOpenSearch }: MemoryPanelBannerProps): React.JSX.Element {
  return (
    <div style={s.banner}>
      <div style={s.bannerText}>
        Memory is the project timeline. Use Search in Memory mode for query-driven lookup across observations, summaries, and messages.
      </div>
      {onOpenSearch && (
        <button type="button" style={s.bannerButton} onClick={onOpenSearch}>
          Open Search
        </button>
      )}
    </div>
  )
}
