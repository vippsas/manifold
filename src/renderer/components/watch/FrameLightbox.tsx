import React, { useEffect } from 'react'
import { formatTimestamp } from './watch-format'
import { lightboxStyles as s } from './FrameLightbox.styles'

interface Props {
  dataUrl: string
  timestampSeconds: number
  onClose: () => void
}

export function FrameLightbox({ dataUrl, timestampSeconds, onClose }: Props): React.JSX.Element {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div role="dialog" aria-label="Frame preview" style={s.backdrop} onClick={onClose}>
      <div style={s.frame} onClick={(e) => e.stopPropagation()}>
        <img src={dataUrl} alt={`Frame at ${formatTimestamp(timestampSeconds)}`} style={s.image} />
        <div style={s.caption}>
          <span>t={formatTimestamp(timestampSeconds)}</span>
          <button type="button" style={s.closeButton} onClick={onClose}>Close (Esc)</button>
        </div>
      </div>
    </div>
  )
}
