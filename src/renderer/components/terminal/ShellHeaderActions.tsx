import React from 'react'
import { createPortal } from 'react-dom'
import type { IDockviewHeaderActionsProps } from 'dockview'
import {
  getShellHeaderControls,
  subscribeShellHeaderControls,
} from './shell-header-controls'
import type { ShellMode } from './shell-tabs-hooks'
import { ShellTabControls } from './ShellTabControls'
import { shellTabStyles as styles } from './ShellTabs.styles'

export function ShellHeaderActions({ activePanel }: IDockviewHeaderActionsProps): React.JSX.Element | null {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [menuPosition, setMenuPosition] = React.useState<{ top: number; left: number } | null>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const controls = React.useSyncExternalStore(
    subscribeShellHeaderControls,
    getShellHeaderControls,
    getShellHeaderControls,
  )

  const updateMenuPosition = React.useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPosition({ top: rect.bottom, left: rect.left })
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
  const showShellTabs = controls.extraShells.length > 0
  if (!controls.canAddShell && !showShellTabs) return null

  const addShell = (mode: ShellMode): void => {
    setMenuOpen(false)
    controls.onAddShell(mode)
  }

  return (
    <div style={styles.headerActions}>
      {controls.canAddShell && (
        <div style={styles.headerAddMenu} onClick={(event) => event.stopPropagation()}>
          <button
            ref={buttonRef}
            type="button"
            style={styles.headerAddButton}
            className="shell-header-add-button"
            onClick={() => setMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setMenuOpen(false)
            }}
            title="New Shell"
            aria-label="New Shell"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            +
          </button>
          {menuOpen && menuPosition && createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ ...styles.shellTypeMenu, top: menuPosition.top, left: menuPosition.left }}
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
      )}
      {showShellTabs && (
        <ShellTabControls
          activeTab={controls.activeTab}
          extraShells={controls.extraShells}
          onSetActiveTab={controls.onSetActiveTab}
          onRemoveShell={controls.onRemoveShell}
        />
      )}
    </div>
  )
}
