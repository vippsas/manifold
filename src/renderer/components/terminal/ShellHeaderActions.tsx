import React from 'react'
import { createPortal } from 'react-dom'
import type { IDockviewHeaderActionsProps } from 'dockview'
import {
  getShellHeaderControls,
  subscribeShellHeaderControls,
} from './shell-header-controls'
import type { ShellMode } from './shell-terminal-store'
import { shellTabStyles as styles } from './ShellTabs.styles'

function ChevronIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M3 4.75L6 7.75L9 4.75" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ShellHeaderActions({ activePanel }: IDockviewHeaderActionsProps): React.JSX.Element | null {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [menuPosition, setMenuPosition] = React.useState<{ top: number; right: number } | null>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const controls = React.useSyncExternalStore(
    subscribeShellHeaderControls,
    getShellHeaderControls,
    getShellHeaderControls,
  )

  // Anchored by its right edge: the chevron now sits at the far end of the
  // header strip, so a left-anchored menu would hang off the window.
  const updateMenuPosition = React.useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPosition({ top: rect.bottom, right: window.innerWidth - rect.right })
  }, [])

  React.useLayoutEffect(() => {
    if (!menuOpen) return
    updateMenuPosition()
  }, [menuOpen, updateMenuPosition])

  React.useEffect(() => {
    if (!menuOpen) return
    const handleMouseDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('resize', updateMenuPosition)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('resize', updateMenuPosition)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen, updateMenuPosition])

  if (!controls || activePanel?.id !== 'shell') return null

  const addShell = (mode: ShellMode): void => {
    setMenuOpen(false)
    controls.onAddShell(mode)
  }

  return (
    <div style={styles.headerActions}>
      <div style={styles.headerAddMenu} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          style={styles.headerAddButton}
          className="shell-header-add-button"
          onClick={() => addShell('manifold')}
          disabled={!controls.canAddShell}
          title="New Terminal"
          aria-label="New Terminal"
        >
          +
        </button>
        <button
          ref={buttonRef}
          type="button"
          style={styles.headerAddChevron}
          className="shell-header-add-button"
          onClick={() => setMenuOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setMenuOpen(false)
          }}
          disabled={!controls.canAddShell}
          title="Shell options"
          aria-label="Shell options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <ChevronIcon />
        </button>
        {menuOpen && menuPosition && createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ ...styles.shellTypeMenu, top: menuPosition.top, right: menuPosition.right }}
          >
            <button
              type="button"
              role="menuitem"
              style={styles.shellTypeMenuItem}
              onClick={() => addShell('manifold')}
            >
              New Manifold Shell
            </button>
            <button
              type="button"
              role="menuitem"
              style={styles.shellTypeMenuItem}
              onClick={() => addShell('system')}
            >
              New System Shell
            </button>
          </div>,
          document.body,
        )}
      </div>
      <button
        type="button"
        style={styles.headerCloseButton}
        className="shell-header-close-button"
        onClick={() => controls.onHideTerminals()}
        title="Hide Terminals"
        aria-label="Hide Terminals"
      >
        ×
      </button>
    </div>
  )
}
