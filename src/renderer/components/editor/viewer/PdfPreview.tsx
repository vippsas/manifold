import React, { useEffect, useRef, useState } from 'react'
import { getDocument } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ensurePdfWorker } from './pdfjs-worker'
import { PdfPage } from './PdfPage'

interface PdfPreviewProps {
  filePath: string
  dataUrl: string
}

const MIN_SCALE = 0.25
const MAX_SCALE = 4
const ZOOM_STEP = 1.2
// US Letter at 72dpi — placeholder size until the first page's real size loads.
const DEFAULT_PAGE = { width: 612, height: 792 }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
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
    padding: '16px',
    boxSizing: 'border-box',
  },
  message: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--type-ui-caption)',
    padding: '16px',
    textAlign: 'center',
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
  pageCount: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-secondary)',
    padding: '0 6px',
    whiteSpace: 'nowrap',
  },
}

export function PdfPreview({ filePath, dataUrl }: PdfPreviewProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [estimate, setEstimate] = useState(DEFAULT_PAGE)
  const [scale, setScale] = useState(1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let doc: PDFDocumentProxy | null = null
    setPdf(null)
    setNumPages(0)
    setEstimate(DEFAULT_PAGE)
    setScale(1)
    setError(null)

    let task
    try {
      ensurePdfWorker()
      task = getDocument({ data: dataUrlToBytes(dataUrl) })
    } catch (err) {
      // Keep any synchronous failure (bad data URL, worker setup) inside the
      // viewer's own error state instead of letting it unmount the editor.
      setError(err instanceof Error ? err.message : 'Failed to load PDF')
      return
    }

    task.promise
      .then(async (loaded) => {
        if (cancelled) {
          void loaded.destroy()
          return
        }
        doc = loaded
        setPdf(loaded)
        setNumPages(loaded.numPages)
        const first = await loaded.getPage(1)
        const viewport = first.getViewport({ scale: 1 })
        if (!cancelled) setEstimate({ width: viewport.width, height: viewport.height })
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load PDF')
      })
    return () => {
      cancelled = true
      void task.destroy()
      void doc?.destroy()
    }
  }, [dataUrl])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [filePath])

  const zoomIn = (): void => setScale((s) => clamp(s * ZOOM_STEP, MIN_SCALE, MAX_SCALE))
  const zoomOut = (): void => setScale((s) => clamp(s / ZOOM_STEP, MIN_SCALE, MAX_SCALE))
  const resetZoom = (): void => setScale(1)

  if (error !== null) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.message}>Could not display PDF: {error}</div>
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      <div
        ref={(el) => {
          scrollRef.current = el
          setScrollEl(el)
        }}
        style={styles.scrollArea}
      >
        {pdf !== null ? (
          Array.from({ length: numPages }, (_, i) => (
            <PdfPage
              key={i + 1}
              pdf={pdf}
              pageNumber={i + 1}
              scale={scale}
              estimatedWidth={estimate.width}
              estimatedHeight={estimate.height}
              scrollRoot={scrollEl}
            />
          ))
        ) : (
          <div style={styles.message}>Loading PDF…</div>
        )}
      </div>
      <div style={styles.controls} role="toolbar" aria-label="PDF zoom">
        <button type="button" style={styles.button} onClick={zoomOut} title="Zoom out" aria-label="Zoom out">
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
        <button type="button" style={styles.button} onClick={zoomIn} title="Zoom in" aria-label="Zoom in">
          +
        </button>
        {numPages > 0 && (
          <span style={styles.pageCount}>
            {numPages} page{numPages === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  )
}
