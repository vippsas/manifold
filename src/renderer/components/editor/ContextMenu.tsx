import React, { useEffect, useRef } from 'react'
import { contextMenuStyles } from './ContextMenu.styles'

export interface ContextMenuAction {
  label: string
  action: () => void
}

export interface ContextMenuProps {
  x: number
  y: number
  items: (ContextMenuAction | 'separator')[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Adjust position to keep menu within viewport after first render
  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    if (x + rect.width > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 4}px`
    }
    if (y + rect.height > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 4}px`
    }
  }, [x, y])

  return (
    <>
      <div style={contextMenuStyles.overlay} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div ref={menuRef} style={{ ...contextMenuStyles.menu, left: x, top: y }}>
        {items.map((item, i) =>
          item === 'separator' ? (
            <div key={`sep-${i}`} style={contextMenuStyles.separator} />
          ) : (
            <div
              key={item.label}
              className="context-menu-item"
              style={contextMenuStyles.item}
              onClick={() => { item.action(); onClose() }}
            >
              {item.label}
            </div>
          )
        )}
      </div>
    </>
  )
}
