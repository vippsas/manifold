// resources/plugins/manifold.watch/src/webview/components/FrameLightbox.tsx
// Ported verbatim from src/renderer/components/watch/FrameLightbox.tsx.
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WatchFrameRef } from '../../shared-types'
import { formatTimestamp } from '../watch-format'
import { lightboxStyles as s } from '../styles/FrameLightbox.styles'

interface Props {
  frames: WatchFrameRef[]
  currentIndex: number
  thumbDataUrl: string
  readFrame: (path: string) => Promise<string>
  onIndexChange: (index: number) => void
  onClose: () => void
}

export function FrameLightbox({
  frames,
  currentIndex,
  thumbDataUrl,
  readFrame,
  onIndexChange,
  onClose,
}: Props): React.JSX.Element | null {
  const [hdUrl, setHdUrl] = useState<string | null>(null)
  const [hdError, setHdError] = useState(false)

  const frame = frames[currentIndex]

  useEffect(() => {
    if (!frame) return
    setHdUrl(null)
    setHdError(false)
    if (!frame.hdPath) return
    let cancelled = false
    void readFrame(frame.hdPath).then(
      (url) => { if (!cancelled) setHdUrl(url) },
      () => { if (!cancelled) setHdError(true) },
    )
    return () => { cancelled = true }
  }, [frame, readFrame])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (currentIndex < frames.length - 1) onIndexChange(currentIndex + 1)
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (currentIndex > 0) onIndexChange(currentIndex - 1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, onIndexChange, currentIndex, frames.length])

  if (!frame) return null

  const displayUrl = hdUrl ?? thumbDataUrl
  const isHd = hdUrl !== null
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < frames.length - 1

  // Portal to document.body so the fixed full-screen backdrop covers the
  // whole webview viewport regardless of the panel's layout containers.
  return createPortal(
    <div role="dialog" aria-label="Frame preview" style={s.backdrop} onClick={onClose}>
      <div style={s.frame} onClick={(e) => e.stopPropagation()}>
        <img src={displayUrl} alt={`Frame at ${formatTimestamp(frame.timestampSeconds)}`} style={s.image} />
        <div style={s.caption}>
          <span>
            t={formatTimestamp(frame.timestampSeconds)}
            {' · '}
            {currentIndex + 1}/{frames.length}
            {' · '}
            {frame.hdPath
              ? (isHd ? 'HD' : hdError ? 'HD failed — preview only' : 'loading HD…')
              : 'preview only'}
          </span>
          <span style={s.controls}>
            <button
              type="button"
              style={{ ...s.navButton, ...(hasPrev ? {} : s.navButtonDisabled) }}
              onClick={() => hasPrev && onIndexChange(currentIndex - 1)}
              disabled={!hasPrev}
              aria-label="Previous frame"
              title="Previous (←)"
            >‹</button>
            <button
              type="button"
              style={{ ...s.navButton, ...(hasNext ? {} : s.navButtonDisabled) }}
              onClick={() => hasNext && onIndexChange(currentIndex + 1)}
              disabled={!hasNext}
              aria-label="Next frame"
              title="Next (→)"
            >›</button>
            <button type="button" style={s.closeButton} onClick={onClose}>Close (Esc)</button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
