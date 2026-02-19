import { useState, useEffect, useCallback, useRef, type RefObject } from 'react'

interface PaneResizeResult {
  leftPaneFraction: number
  rightPaneFraction: number
  centerFraction: number
  panesRef: RefObject<HTMLDivElement>
  handleDividerMouseDown: (divider: 'left' | 'right') => (e: React.MouseEvent) => void
}

export function usePaneResize(
  initialLeft: number = 0.35,
  initialRight: number = 0.22
): PaneResizeResult {
  const [leftPaneFraction, setLeftPaneFraction] = useState(initialLeft)
  const [rightPaneFraction, setRightPaneFraction] = useState(initialRight)
  const panesRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<'left' | 'right' | null>(null)

  const handleDividerMouseDown = useCallback(
    (divider: 'left' | 'right') => (_e: React.MouseEvent): void => {
      draggingRef.current = divider
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    []
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!draggingRef.current || !panesRef.current) return
      const rect = panesRef.current.getBoundingClientRect()
      const totalWidth = rect.width
      const x = e.clientX - rect.left
      const fraction = x / totalWidth

      if (draggingRef.current === 'left') {
        const clamped = Math.max(0.15, Math.min(0.6, fraction))
        setLeftPaneFraction(clamped)
      } else {
        const rightFrac = 1 - fraction
        const clamped = Math.max(0.1, Math.min(0.4, rightFrac))
        setRightPaneFraction(clamped)
      }
    }

    const handleMouseUp = (): void => {
      draggingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const centerFraction = 1 - leftPaneFraction - rightPaneFraction

  return {
    leftPaneFraction,
    rightPaneFraction,
    centerFraction,
    panesRef,
    handleDividerMouseDown,
  }
}
