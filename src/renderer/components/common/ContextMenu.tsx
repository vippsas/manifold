import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { contextMenuStyles } from './ContextMenu.styles'

export interface ContextMenuAction {
  label: string
  action: () => void
}

export type MenuItem = ContextMenuAction | 'separator'

/** Collapse consecutive separators and drop leading/trailing ones, so that
 *  conditionally-omitted items never leave a dangling divider. Shared by every
 *  menu builder, since all of them omit items whose handler is absent. */
export function tidy(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = []
  for (const item of items) {
    if (item === 'separator') {
      if (out.length === 0 || out[out.length - 1] === 'separator') continue
    }
    out.push(item)
  }
  while (out.length && out[out.length - 1] === 'separator') out.pop()
  return out
}

export interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
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

  // Render into document.body so `position: fixed` resolves against the viewport.
  // Inside the tree the menu sits within dockview's `.dv-render-overlay`, whose
  // `transform`/`contain` establish a containing block that would otherwise offset
  // the menu from the cursor's clientX/clientY.
  return createPortal(
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
    </>,
    document.body,
  )
}
