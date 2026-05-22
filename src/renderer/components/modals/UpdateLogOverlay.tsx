import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ReleaseNotes } from '../../../shared/types'
import type { UpdateCenterTab } from '../../../shared/useUpdateLog'
import { updateLogStyles } from './UpdateLogOverlay.styles'

interface UpdateLogOverlayProps {
  visible: boolean
  activeTab: UpdateCenterTab
  currentVersion: string
  releaseNotes: ReleaseNotes | null
  log: string
  loading: boolean
  error: string | null
  onClose: () => void
  onRefresh: () => void
  onClean: () => void
  onCheckForUpdates: () => void
  onOpenExternal: () => void
  onSelectTab: (tab: UpdateCenterTab) => void
}

export function UpdateLogOverlay({
  visible,
  activeTab,
  currentVersion,
  releaseNotes,
  log,
  loading,
  error,
  onClose,
  onRefresh,
  onClean,
  onCheckForUpdates,
  onOpenExternal,
  onSelectTab,
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

  const subtitle = useMemo(() => {
    if (activeTab === 'diagnostics') {
      return loading ? 'Refreshing updater diagnostics…' : 'Updater diagnostics and manual checks'
    }
    if (loading) return 'Loading release notes…'
    const version = releaseNotes?.version || currentVersion
    return version ? `What changed in Manifold v${version}` : 'Latest release notes'
  }, [activeTab, currentVersion, loading, releaseNotes?.version])

  if (!visible) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={updateLogStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Updates"
    >
      <div style={updateLogStyles.panel}>
        <div style={updateLogStyles.header}>
          <span style={updateLogStyles.title}>What&apos;s New</span>
          <button type="button" onClick={onClose} style={updateLogStyles.closeButton} aria-label="Close updates">&times;</button>
        </div>
        <div style={updateLogStyles.body}>
          <div style={updateLogStyles.toolbar}>
            <div style={updateLogStyles.toolbarMeta}>
              <span style={updateLogStyles.subtitle}>{subtitle}</span>
              {activeTab === 'releaseNotes' && releaseNotes?.publishedAt && (
                <span style={updateLogStyles.meta}>
                  Published {formatPublishedAt(releaseNotes.publishedAt)}
                </span>
              )}
            </div>
            <div style={updateLogStyles.actions}>
              <button
                type="button"
                onClick={() => onSelectTab('releaseNotes')}
                style={activeTab === 'releaseNotes' ? updateLogStyles.activeTabButton : updateLogStyles.tabButton}
              >
                Release Notes
              </button>
              <button
                type="button"
                onClick={() => onSelectTab('diagnostics')}
                style={activeTab === 'diagnostics' ? updateLogStyles.activeTabButton : updateLogStyles.tabButton}
              >
                Diagnostics
              </button>
            </div>
          </div>
          {activeTab === 'releaseNotes' ? (
            <div style={updateLogStyles.releaseNotesWrap}>
              <div style={updateLogStyles.releaseNotesHeader}>
                <div style={updateLogStyles.releaseTitleGroup}>
                  <span style={updateLogStyles.releaseName}>
                    {releaseNotes?.name ?? (currentVersion ? `Manifold v${currentVersion}` : 'Manifold')}
                  </span>
                  {(releaseNotes?.source === 'fallback') && (
                    <span style={updateLogStyles.releaseBadge}>Offline fallback</span>
                  )}
                </div>
                <div style={updateLogStyles.actions}>
                  <button type="button" onClick={onRefresh} style={updateLogStyles.refreshButton} disabled={loading}>Refresh</button>
                  <button type="button" onClick={onOpenExternal} style={updateLogStyles.checkButton}>Open on GitHub</button>
                </div>
              </div>
              <div style={updateLogStyles.markdownWrap}>
                <div className="markdown-preview" style={updateLogStyles.markdownBody}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{releaseNotes?.body ?? 'Loading release notes…'}</ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={updateLogStyles.diagnosticsToolbar}>
                <div style={updateLogStyles.actions}>
                  <button type="button" onClick={onRefresh} style={updateLogStyles.refreshButton} disabled={loading}>Refresh</button>
                  <button type="button" onClick={onClean} style={updateLogStyles.cleanButton} disabled={loading}>Clean</button>
                  <button type="button" onClick={onCheckForUpdates} style={updateLogStyles.checkButton} disabled={loading}>Check for Updates</button>
                </div>
              </div>
              <div style={updateLogStyles.logWrap}>
                <pre style={updateLogStyles.logText}>{log}</pre>
              </div>
            </>
          )}
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

function formatPublishedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}
