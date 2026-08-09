import { useCallback, useState } from 'react'

export interface ContextMenuPosition {
  x: number
  y: number
}

export interface UseContextMenuResult {
  /** Where the menu is open, or null when it is closed. */
  position: ContextMenuPosition | null
  /** Right-click handler: opens the menu at the cursor. */
  open: (e: React.MouseEvent) => void
  /** Opens the menu at an explicit viewport point, for a button that anchors the
   *  menu to itself rather than to the cursor. */
  openAt: (position: ContextMenuPosition) => void
  close: () => void
}

/**
 * Open/close state for a right-click menu, positioned at the cursor.
 *
 * The coordinates are viewport coordinates (clientX/clientY), which is what
 * `ContextMenu` wants — it portals to document.body so its `position: fixed`
 * resolves against the viewport rather than against a dockview panel's
 * transformed overlay.
 */
export function useContextMenu(): UseContextMenuResult {
  const [position, setPosition] = useState<ContextMenuPosition | null>(null)

  const open = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    // The sidebar nests rows inside cards; without this an ancestor row would
    // open its own menu on top of this one.
    e.stopPropagation()
    setPosition({ x: e.clientX, y: e.clientY })
  }, [])

  const openAt = useCallback((next: ContextMenuPosition): void => setPosition(next), [])

  const close = useCallback((): void => setPosition(null), [])

  return { position, open, openAt, close }
}
