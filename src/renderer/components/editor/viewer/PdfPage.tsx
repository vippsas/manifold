import React, { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'

interface PdfPageProps {
  pdf: PDFDocumentProxy
  pageNumber: number
  scale: number
  // Unscaled (scale=1) page size used to lay out the placeholder before the
  // page's real dimensions are known, so the scrollbar stays stable.
  estimatedWidth: number
  estimatedHeight: number
  scrollRoot: HTMLDivElement | null
}

const wrapperStyle: React.CSSProperties = {
  position: 'relative',
  margin: '0 auto 12px',
  background: '#fff',
  boxShadow: 'var(--shadow-elevated)',
}

const canvasStyle: React.CSSProperties = { display: 'block' }

// Renders a single PDF page to canvas, but only once it scrolls near the
// viewport — so large documents don't paint every page up front. Re-renders
// when the zoom scale changes while the page is in view.
export function PdfPage({
  pdf,
  pageNumber,
  scale,
  estimatedWidth,
  estimatedHeight,
  scrollRoot,
}: PdfPageProps): React.JSX.Element {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const renderedScaleRef = useRef<number | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const [near, setNear] = useState(false)
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => setNear(entries[0]?.isIntersecting ?? false),
      { root: scrollRoot, rootMargin: '400px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollRoot])

  useEffect(() => {
    if (!near) return
    if (renderedScaleRef.current === scale) return
    let cancelled = false
    void (async () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return
      renderTaskRef.current?.cancel()
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      setDims((prev) =>
        prev?.width === base.width && prev?.height === base.height
          ? prev
          : { width: base.width, height: base.height },
      )
      const viewport = page.getViewport({ scale })
      const outputScale = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      const task = page.render({
        canvasContext: ctx,
        viewport,
        transform: [outputScale, 0, 0, outputScale, 0, 0],
      })
      renderTaskRef.current = task
      try {
        await task.promise
        if (!cancelled) renderedScaleRef.current = scale
      } catch {
        // Render cancelled (zoom changed or unmounted) — ignore.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [near, scale, pdf, pageNumber])

  useEffect(() => () => renderTaskRef.current?.cancel(), [])

  const width = (dims?.width ?? estimatedWidth) * scale
  const height = (dims?.height ?? estimatedHeight) * scale

  return (
    <div ref={wrapperRef} style={{ ...wrapperStyle, width, height }}>
      <canvas ref={canvasRef} style={canvasStyle} aria-label={`Page ${pageNumber}`} />
    </div>
  )
}
