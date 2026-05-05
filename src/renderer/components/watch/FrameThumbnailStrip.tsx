import React, { useEffect, useState } from 'react'
import type { WatchFrameRef } from '../../../shared/watch-types'
import { formatTimestamp } from './watch-format'
import { thumbStripStyles as s } from './FrameThumbnailStrip.styles'

interface Props {
  frames: WatchFrameRef[]
  readFrame: (path: string) => Promise<string>
  onSelect: (frame: WatchFrameRef, dataUrl: string) => void
}

export function FrameThumbnailStrip({ frames, readFrame, onSelect }: Props): React.JSX.Element | null {
  if (frames.length === 0) return null
  return (
    <div style={s.container}>
      <div style={s.label}>Frames ({frames.length})</div>
      <div style={s.strip}>
        {frames.map((frame) => (
          <Thumbnail key={frame.path} frame={frame} readFrame={readFrame} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

interface ThumbProps {
  frame: WatchFrameRef
  readFrame: (path: string) => Promise<string>
  onSelect: (frame: WatchFrameRef, dataUrl: string) => void
}

function Thumbnail({ frame, readFrame, onSelect }: ThumbProps): React.JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void readFrame(frame.path).then(
      (url) => { if (!cancelled) setDataUrl(url) },
      (err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'load failed') },
    )
    return () => { cancelled = true }
  }, [frame.path, readFrame])

  const handleClick = (): void => {
    if (dataUrl) onSelect(frame, dataUrl)
  }

  return (
    <button
      type="button"
      style={s.thumbButton}
      onClick={handleClick}
      disabled={!dataUrl}
      title={`t=${formatTimestamp(frame.timestampSeconds)}`}
    >
      {dataUrl ? (
        <img src={dataUrl} alt={`Frame at ${formatTimestamp(frame.timestampSeconds)}`} style={s.thumbImg} />
      ) : (
        <div style={s.thumbPlaceholder}>{error ? '!' : '…'}</div>
      )}
      <span style={s.thumbLabel}>{formatTimestamp(frame.timestampSeconds)}</span>
    </button>
  )
}
