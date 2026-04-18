import React, { useCallback, useEffect, useRef } from 'react'
import { updateLogStyles } from './UpdateLogOverlay.styles'

interface UpdateLogOverlayProps {
  visible: boolean
  log: string
  loading: boolean
  error: string | null
  onClose: () => void
  onRefresh: () => void
  onClean: () => void
  onCheckForUpdates: () => void
}

export function UpdateLogOverlay({
  visible,
  log,
  loading,
  error,
  onClose,
  onRefresh,
  onClean,
  onCheckForUpdates,
}: UpdateLogOverlayProps): React.JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleOverlayClick = useCallback((event: React.MouseEvent): void => {
    if (event.target === overlayRef.current) onClose()
  }, [onClose])

  useEffect(() => {
    if (!visible) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visible, onClose])

  if (!visible) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={updateLogStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Update Log"
    >
      <div style={updateLogStyles.panel}>
        <div style={updateLogStyles.header}>
          <span style={updateLogStyles.title}>Update Log</span>
          <button type="button" onClick={onClose} style={updateLogStyles.closeButton} aria-label="Close update log">&times;</button>
        </div>
        <div style={updateLogStyles.body}>
          <div style={updateLogStyles.toolbar}>
            <span style={updateLogStyles.subtitle}>
              {loading ? 'Refreshing updater activity…' : 'Recent updater activity'}
            </span>
            <div style={updateLogStyles.actions}>
              <button type="button" onClick={onRefresh} style={updateLogStyles.refreshButton} disabled={loading}>Refresh</button>
              <button type="button" onClick={onClean} style={updateLogStyles.cleanButton} disabled={loading}>Clean</button>
              <button type="button" onClick={onCheckForUpdates} style={updateLogStyles.checkButton} disabled={loading}>Check for Updates</button>
            </div>
          </div>
          <div style={updateLogStyles.logWrap}>
            <pre style={updateLogStyles.logText}>{log}</pre>
          </div>
          {error && (
            <div style={updateLogStyles.error}>{error}</div>
          )}
        </div>
        <div style={updateLogStyles.footer}>
          <button type="button" onClick={onClose} style={updateLogStyles.closeFooterButton}>Close</button>
        </div>
      </div>
    </div>
  )
}
