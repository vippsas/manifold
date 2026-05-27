import React, { useCallback, useEffect, useRef, useState } from 'react'

interface ImagePreviewProps {
  filePath: string
  dataUrl: string
}

const MIN_SCALE = 0.1
const MAX_SCALE = 10
const ZOOM_STEP = 1.2
const WHEEL_SENSITIVITY = 0.01

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
    width: '100%',
    height: '100%',
    background: 'var(--bg-primary)',
    overflow: 'hidden',
  },
  scrollArea: {
    width: '100%',
    height: '100%',
    overflow: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    boxSizing: 'border-box',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    userSelect: 'none',
    transformOrigin: 'center center',
    transition: 'transform 80ms ease-out',
  },
  controls: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '3px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-elevated)',
  },
  button: {
    minWidth: 26,
    height: 24,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 6px',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-xs)',
    fontSize: '14px',
    lineHeight: 1,
    fontFamily: 'var(--font-sans)',
  },
  percent: {
    fontSize: 'var(--type-ui-caption)',
    minWidth: 38,
  },
}

export function ImagePreview({ filePath, dataUrl }: ImagePreviewProps): React.JSX.Element {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    setScale(1)
  }, [filePath])

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    // macOS trackpad pinch gestures arrive as wheel events with ctrlKey set.
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setScale((prev) => clamp(prev * Math.exp(-e.deltaY * WHEEL_SENSITIVITY), MIN_SCALE, MAX_SCALE))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomIn = useCallback(() => {
    setScale((prev) => clamp(prev * ZOOM_STEP, MIN_SCALE, MAX_SCALE))
  }, [])
  const zoomOut = useCallback(() => {
    setScale((prev) => clamp(prev / ZOOM_STEP, MIN_SCALE, MAX_SCALE))
  }, [])
  const resetZoom = useCallback(() => setScale(1), [])

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      <div style={styles.scrollArea}>
        <img
          src={dataUrl}
          alt={filePath}
          draggable={false}
          style={{ ...styles.image, transform: `scale(${scale})` }}
        />
      </div>
      <div style={styles.controls} role="toolbar" aria-label="Image zoom">
        <button
          type="button"
          style={styles.button}
          onClick={zoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          style={{ ...styles.button, ...styles.percent }}
          onClick={resetZoom}
          title="Reset zoom"
          aria-label="Reset zoom"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          style={styles.button}
          onClick={zoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  )
}
