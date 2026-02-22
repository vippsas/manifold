import { useState, useEffect, useCallback, useRef, type RefObject } from 'react'

type DividerType = 'left' | 'right' | 'bottom' | 'fileTreeSplit'

export type PaneName = 'sidebar' | 'left' | 'center' | 'right' | 'bottom'

export interface PaneVisibility {
  sidebar: boolean
  left: boolean
  center: boolean
  right: boolean
  bottom: boolean
}

interface PaneResizeResult {
  leftPaneFraction: number
  rightPaneFraction: number
  centerFraction: number
  bottomPaneFraction: number
  fileTreeSplitFraction: number
  panesRef: RefObject<HTMLDivElement>
  rightAreaRef: RefObject<HTMLDivElement>
  rightPaneRef: RefObject<HTMLDivElement>
  handleDividerMouseDown: (divider: DividerType) => (e: React.MouseEvent) => void
  paneVisibility: PaneVisibility
  togglePane: (pane: PaneName) => void
  fileTreeVisible: boolean
  toggleFileTree: () => void
  modifiedFilesVisible: boolean
  toggleModifiedFiles: () => void
}

export function usePaneResize(
  initialLeft: number = 0.75,
  initialRight: number = 0.22,
  initialBottom: number = 0.30
): PaneResizeResult {
  const [leftPaneFraction, setLeftPaneFraction] = useState(initialLeft)
  const [rightPaneFraction, setRightPaneFraction] = useState(initialRight)
  const [bottomPaneFraction, setBottomPaneFraction] = useState(initialBottom)
  const [fileTreeSplitFraction, setFileTreeSplitFraction] = useState(0.4)
  const [paneVisibility, setPaneVisibility] = useState<PaneVisibility>({
    sidebar: true,
    left: true,
    center: false,
    right: true,
    bottom: true,
  })
  const [fileTreeVisible, setFileTreeVisible] = useState(true)
  const [modifiedFilesVisible, setModifiedFilesVisible] = useState(true)
  const savedFractions = useRef<Partial<Record<PaneName, number>>>({})
  const panesRef = useRef<HTMLDivElement>(null)
  const rightAreaRef = useRef<HTMLDivElement>(null)
  const rightPaneRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<DividerType | null>(null)

  const handleDividerMouseDown = useCallback(
    (divider: DividerType) => (_e: React.MouseEvent): void => {
      draggingRef.current = divider
      document.body.style.cursor = (divider === 'bottom' || divider === 'fileTreeSplit') ? 'row-resize' : 'col-resize'
      document.body.style.userSelect = 'none'
    },
    []
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return

      if (draggingRef.current === 'bottom') {
        if (!rightAreaRef.current) return
        const rect = rightAreaRef.current.getBoundingClientRect()
        const y = e.clientY - rect.top
        const fraction = 1 - y / rect.height
        const clamped = Math.max(0.2, Math.min(0.8, fraction))
        setBottomPaneFraction(clamped)
        return
      }

      if (draggingRef.current === 'fileTreeSplit') {
        if (!rightPaneRef.current) return
        const rect = rightPaneRef.current.getBoundingClientRect()
        const y = e.clientY - rect.top
        const fraction = 1 - y / rect.height
        const clamped = Math.max(0.2, Math.min(0.8, fraction))
        setFileTreeSplitFraction(clamped)
        return
      }

      if (!panesRef.current) return
      const rect = panesRef.current.getBoundingClientRect()
      const totalWidth = rect.width
      const x = e.clientX - rect.left
      const fraction = x / totalWidth

      if (draggingRef.current === 'left') {
        const clamped = Math.max(0.15, Math.min(0.85, fraction))
        setLeftPaneFraction(clamped)
      } else {
        const rightFrac = 1 - fraction
        const clamped = Math.max(0.05, Math.min(0.4, rightFrac))
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

  const togglePane = useCallback((pane: PaneName) => {
    setPaneVisibility(prev => {
      const isVisible = prev[pane]
      if (isVisible) {
        if (pane === 'left') savedFractions.current.left = leftPaneFraction
        else if (pane === 'right') savedFractions.current.right = rightPaneFraction
        else if (pane === 'bottom') savedFractions.current.bottom = bottomPaneFraction
      } else {
        if (pane === 'left') setLeftPaneFraction(savedFractions.current.left ?? initialLeft)
        else if (pane === 'right') setRightPaneFraction(savedFractions.current.right ?? initialRight)
        else if (pane === 'bottom') setBottomPaneFraction(savedFractions.current.bottom ?? initialBottom)
      }
      return { ...prev, [pane]: !isVisible }
    })
  }, [leftPaneFraction, rightPaneFraction, bottomPaneFraction, initialLeft, initialRight, initialBottom])

  const toggleFileTree = useCallback(() => {
    setFileTreeVisible(prev => !prev)
  }, [])

  const toggleModifiedFiles = useCallback(() => {
    setModifiedFilesVisible(prev => !prev)
  }, [])

  const centerFraction = 1 - leftPaneFraction - rightPaneFraction

  return {
    leftPaneFraction,
    rightPaneFraction,
    centerFraction,
    bottomPaneFraction,
    fileTreeSplitFraction,
    panesRef,
    rightAreaRef,
    rightPaneRef,
    handleDividerMouseDown,
    paneVisibility,
    togglePane,
    fileTreeVisible,
    toggleFileTree,
    modifiedFilesVisible,
    toggleModifiedFiles,
  }
}
