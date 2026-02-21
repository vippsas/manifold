import { useState, useCallback, useEffect, useRef } from 'react'
import type React from 'react'

interface SidebarResizeResult {
  sidebarWidth: number
  handleSidebarDividerMouseDown: (e: React.MouseEvent) => void
}

export function useSidebarResize(initialWidth = 200): SidebarResizeResult {
  const [sidebarWidth, setSidebarWidth] = useState(initialWidth)
  const dragging = useRef(false)

  const handleSidebarDividerMouseDown = useCallback((_e: React.MouseEvent) => {
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragging.current) return
      const clamped = Math.max(140, Math.min(400, e.clientX))
      setSidebarWidth(clamped)
    }
    const onUp = (): void => {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  return { sidebarWidth, handleSidebarDividerMouseDown }
}
