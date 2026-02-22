import React, { useCallback, useRef } from 'react'
import { aboutStyles } from './AboutOverlay.styles'

interface AboutOverlayProps {
  visible: boolean
  version: string
  onClose: () => void
}

export function AboutOverlay({ visible, version, onClose }: AboutOverlayProps): React.JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === overlayRef.current) onClose()
    },
    [onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  if (!visible) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      style={aboutStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="About Manifold"
    >
      <div style={aboutStyles.panel}>
        <div style={aboutStyles.header}>
          <span style={aboutStyles.title}>About Manifold</span>
          <button onClick={onClose} style={aboutStyles.closeButton}>&times;</button>
        </div>
        <div style={aboutStyles.body}>
          <span style={aboutStyles.appName}>Manifold</span>
          <span style={aboutStyles.version}>v{version}</span>
          <span style={aboutStyles.author}>Made by Sven Malvik</span>
          <span style={aboutStyles.origin}>Norway &middot; 2026</span>
        </div>
        <div style={aboutStyles.footer}>
          <button onClick={onClose} style={aboutStyles.closeFooterButton}>Close</button>
        </div>
      </div>
    </div>
  )
}
