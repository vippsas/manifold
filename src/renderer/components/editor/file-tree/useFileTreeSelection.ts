import { useCallback, useRef, useState } from 'react'

export interface FileTreeSelectionState {
  /** All currently selected paths (multi-select). */
  selectedPaths: Set<string>
  /** The keyboard cursor / focused row. */
  cursorPath: string | null
  setCursor: (path: string | null) => void
  /** Plain click: select exactly one, set anchor + cursor. */
  selectOnly: (path: string) => void
  /** Cmd/Ctrl click: toggle one in/out of the selection. */
  toggleSelect: (path: string) => void
  /** Shift click / shift-arrow: select the contiguous range anchor→path. */
  rangeSelectTo: (path: string, order: string[]) => void
  clearSelection: () => void
}

export function useFileTreeSelection(): FileTreeSelectionState {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [cursorPath, setCursorPath] = useState<string | null>(null)
  const anchorRef = useRef<string | null>(null)

  const selectOnly = useCallback((path: string): void => {
    anchorRef.current = path
    setCursorPath(path)
    setSelectedPaths(new Set([path]))
  }, [])

  const toggleSelect = useCallback((path: string): void => {
    anchorRef.current = path
    setCursorPath(path)
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const rangeSelectTo = useCallback((path: string, order: string[]): void => {
    const anchor = anchorRef.current
    setCursorPath(path)
    if (!anchor) {
      anchorRef.current = path
      setSelectedPaths(new Set([path]))
      return
    }
    const from = order.indexOf(anchor)
    const to = order.indexOf(path)
    if (from === -1 || to === -1) {
      setSelectedPaths(new Set([path]))
      return
    }
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    setSelectedPaths(new Set(order.slice(lo, hi + 1)))
  }, [])

  const clearSelection = useCallback((): void => {
    anchorRef.current = null
    setCursorPath(null)
    setSelectedPaths(new Set())
  }, [])

  return { selectedPaths, cursorPath, setCursor: setCursorPath, selectOnly, toggleSelect, rangeSelectTo, clearSelection }
}
