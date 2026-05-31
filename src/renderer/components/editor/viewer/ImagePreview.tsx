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
    overflow: 'hidden',
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

interface Offset {
  x: number
  y: number
}

const ZERO_OFFSET: Offset = { x: 0, y: 0 }

export function ImagePreview({ filePath, dataUrl }: ImagePreviewProps): React.JSX.Element {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState<Offset>(ZERO_OFFSET)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ pointerX: number; pointerY: number; offset: Offset } | null>(null)

  // The panning range is half the amount by which the scaled image overflows
  // its rendered (contained) size in each axis — so edges can't be dragged
  // past the centre of the viewport.
  const clampOffset = useCallback((next: Offset): Offset => {
    const img = imageRef.current
    if (!img) return next
    const overflowX = Math.max(0, img.offsetWidth * scale - img.offsetWidth)
    const overflowY = Math.max(0, img.offsetHeight * scale - img.offsetHeight)
    return {
      x: clamp(next.x, -overflowX / 2, overflowX / 2),
      y: clamp(next.y, -overflowY / 2, overflowY / 2),
    }
  }, [scale])

  useEffect(() => {
    setScale(1)
    setOffset(ZERO_OFFSET)
  }, [filePath])

  // Re-clamp the pan offset when zoom changes (e.g. zooming back out should
  // pull the image back toward centre).
  useEffect(() => {
    setOffset((prev) => clampOffset(prev))
  }, [clampOffset])

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    // macOS trackpad pinch gestures arrive as wheel events with ctrlKey set;
    // a plain two-finger scroll pans the zoomed image instead.
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      if (e.ctrlKey) {
        setScale((prev) => clamp(prev * Math.exp(-e.deltaY * WHEEL_SENSITIVITY), MIN_SCALE, MAX_SCALE))
        return
      }
      setOffset((prev) => clampOffset({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [clampOffset])

  const zoomIn = useCallback(() => {
    setScale((prev) => clamp(prev * ZOOM_STEP, MIN_SCALE, MAX_SCALE))
  }, [])
  const zoomOut = useCallback(() => {
    setScale((prev) => clamp(prev / ZOOM_STEP, MIN_SCALE, MAX_SCALE))
  }, [])
  const resetZoom = useCallback(() => {
    setScale(1)
    setOffset(ZERO_OFFSET)
  }, [])

  const canPan = scale > 1

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      if (!canPan) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragStart.current = { pointerX: e.clientX, pointerY: e.clientY, offset }
      setIsDragging(true)
    },
    [canPan, offset],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      const start = dragStart.current
      if (!start) return
      setOffset(
        clampOffset({
          x: start.offset.x + (e.clientX - start.pointerX),
          y: start.offset.y + (e.clientY - start.pointerY),
        }),
      )
    },
    [clampOffset],
  )

  const endDrag = useCallback((e: React.PointerEvent<HTMLImageElement>) => {
    if (!dragStart.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    dragStart.current = null
    setIsDragging(false)
  }, [])

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      <div style={styles.scrollArea}>
        <img
          ref={imageRef}
          src={dataUrl}
          alt={filePath}
          draggable={false}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            ...styles.image,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 80ms ease-out',
            cursor: canPan ? (isDragging ? 'grabbing' : 'grab') : 'default',
          }}
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
