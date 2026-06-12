import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { viewerStyles } from './code-viewer/CodeViewer.styles'

export interface ActionMenuButtonItem {
  id: string
  label: string
  description?: string
  action: () => void
}

interface ActionMenuButtonProps {
  buttonLabel: React.ReactNode
  title: string
  menuLabel: string
  items: ActionMenuButtonItem[]
}

export function ActionMenuButton({
  buttonLabel,
  title,
  menuLabel,
  items,
}: ActionMenuButtonProps): React.JSX.Element | null {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const handleToggleMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!buttonRef.current) return

    if (menu) {
      setMenu(null)
      return
    }

    const rect = buttonRef.current.getBoundingClientRect()
    setMenu({ x: rect.left, y: rect.bottom - 1 })
  }, [menu])

  useEffect(() => {
    if (!menu) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menu])

  useEffect(() => {
    const menuElement = menuRef.current
    if (!menuElement || !menu) return

    const rect = menuElement.getBoundingClientRect()
    const maxLeft = Math.max(4, window.innerWidth - rect.width - 4)
    const maxTop = Math.max(4, window.innerHeight - rect.height - 4)
    menuElement.style.left = `${Math.min(Math.max(4, menu.x), maxLeft)}px`
    menuElement.style.top = `${Math.min(Math.max(4, menu.y), maxTop)}px`
  }, [menu])

  if (items.length === 0) return null

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        style={{
          ...viewerStyles.compactActionButton,
          ...(menu ? viewerStyles.compactActionButtonActive : {}),
        }}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={handleToggleMenu}
      >
        <span style={viewerStyles.compactActionButtonContent}>
          <span style={viewerStyles.compactActionButtonLabel}>{buttonLabel}</span>
          <span style={viewerStyles.iconCaret} />
        </span>
      </button>
      {menu && createPortal(
        <>
          <div style={viewerStyles.actionMenuOverlay} onClick={() => setMenu(null)} />
          <div
            ref={menuRef}
            style={{ ...viewerStyles.actionMenu, left: menu.x, top: menu.y }}
            role="menu"
            aria-label={menuLabel}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                style={viewerStyles.actionMenuItem}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  item.action()
                  setMenu(null)
                }}
                role="menuitem"
              >
                {item.description ? (
                  <span style={viewerStyles.actionMenuItemText}>
                    <span style={viewerStyles.actionMenuItemLabel}>{item.label}</span>
                    <span style={viewerStyles.actionMenuItemDescription}>{item.description}</span>
                  </span>
                ) : (
                  <span style={viewerStyles.actionMenuItemLabel}>{item.label}</span>
                )}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
