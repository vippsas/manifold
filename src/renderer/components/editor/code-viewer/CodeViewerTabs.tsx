import React from 'react'
import { createPortal } from 'react-dom'
import type { OpenFile } from '../../../hooks/editor/useCodeView'
import { FileTypeIcon } from '../file-tree/FileTypeIcon'
import { viewerStyles } from './CodeViewer.styles'
import { fileName, getFileTabLabels, type FileTabLabel } from './code-viewer-utils'

interface TabBarProps {
  openFiles: OpenFile[]
  activeFilePath: string | null
  /** The pane's own actions (split, move, view mode), pinned to the right of
   *  the strip — the dock group's header carries the item's view tabs, not a
   *  single pane's controls. */
  actions?: React.ReactNode
  /** Double-clicking the strip's own background maximizes the pane — the gesture
   *  the dock group's header tab used to carry, on the strip that replaced it. */
  onToggleMaximize?: () => void
  onActivatePane: () => void
  onSelectTab: (filePath: string) => void
  onMoveToSplitPane?: (filePath: string, direction: 'right' | 'below') => void
  onCloseTab: (filePath: string) => void
  onCloseOtherTabs?: (filePath: string) => void
  onCloseAllTabs?: () => void
}

/** Whether a double-click landed on the strip itself rather than on something
 *  that owns the gesture — a file tab (which selects) or a control (which acts).
 *  Only the bare strip toggles maximize. */
function isStripBackground(event: React.MouseEvent<HTMLElement>): boolean {
  const target = event.target as HTMLElement
  return !target.closest('.code-tab') && !target.closest('button')
}

export function TabBar({
  openFiles,
  activeFilePath,
  actions,
  onToggleMaximize,
  onActivatePane,
  onSelectTab,
  onMoveToSplitPane,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
}: TabBarProps): React.JSX.Element {
  const labels = React.useMemo(
    () => getFileTabLabels(openFiles.map((file) => file.path)),
    [openFiles],
  )
  const menuRef = React.useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = React.useState<{ filePath: string; x: number; y: number } | null>(null)

  React.useEffect(() => {
    if (!menu) return
    if (openFiles.some((file) => file.path === menu.filePath)) return
    setMenu(null)
  }, [menu, openFiles])

  React.useEffect(() => {
    if (!menu) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menu])

  React.useEffect(() => {
    const menuElement = menuRef.current
    if (!menuElement || !menu) return

    const rect = menuElement.getBoundingClientRect()
    const maxLeft = Math.max(4, window.innerWidth - rect.width - 4)
    const maxTop = Math.max(4, window.innerHeight - rect.height - 4)
    menuElement.style.left = `${Math.min(Math.max(4, menu.x), maxLeft)}px`
    menuElement.style.top = `${Math.min(Math.max(4, menu.y), maxTop)}px`
  }, [menu])

  const handleTabClick = React.useCallback((filePath: string): void => {
    onActivatePane()
    onSelectTab(filePath)
    setMenu(null)
  }, [onActivatePane, onSelectTab])

  const hasMenuActions = Boolean(onMoveToSplitPane || onCloseOtherTabs || onCloseAllTabs)

  const handleTabContextMenu = React.useCallback((event: React.MouseEvent<HTMLDivElement>, filePath: string): void => {
    event.preventDefault()
    event.stopPropagation()
    onActivatePane()
    onSelectTab(filePath)

    if (!hasMenuActions) return

    setMenu({ filePath, x: event.clientX, y: event.clientY })
  }, [hasMenuActions, onActivatePane, onSelectTab])

  return (
    <>
      <div
        style={viewerStyles.tabBar}
        onDoubleClick={(event) => { if (isStripBackground(event)) onToggleMaximize?.() }}
      >
        <div style={viewerStyles.tabStrip}>
          {openFiles.map((file, index) => (
            <FileTab
              key={file.path}
              file={file}
              label={labels[index] ?? { name: fileName(file.path), description: '' }}
              isActive={file.path === activeFilePath}
              isMenuOpen={menu?.filePath === file.path}
              onActivatePane={onActivatePane}
              onSelect={handleTabClick}
              onContextMenu={handleTabContextMenu}
              onClose={onCloseTab}
            />
          ))}
        </div>
        {actions ? <div style={viewerStyles.tabActions}>{actions}</div> : null}
      </div>
      {menu && hasMenuActions ? createPortal(
        <>
          <div style={viewerStyles.actionMenuOverlay} onClick={() => setMenu(null)} />
          <div
            ref={menuRef}
            style={{ ...viewerStyles.actionMenu, left: menu.x, top: menu.y }}
            role="menu"
            aria-label="Tab actions"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {onMoveToSplitPane ? (
              <>
                <button
                  type="button"
                  style={viewerStyles.actionMenuItem}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onMoveToSplitPane(menu.filePath, 'right')
                    setMenu(null)
                  }}
                  role="menuitem"
                >
                  <span style={viewerStyles.actionMenuItemLabel}>Split pane to the right</span>
                </button>
                <button
                  type="button"
                  style={viewerStyles.actionMenuItem}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onMoveToSplitPane(menu.filePath, 'below')
                    setMenu(null)
                  }}
                  role="menuitem"
                >
                  <span style={viewerStyles.actionMenuItemLabel}>Split pane to the bottom</span>
                </button>
              </>
            ) : null}
            <button
              type="button"
              style={viewerStyles.actionMenuItem}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onCloseTab(menu.filePath)
                setMenu(null)
              }}
              role="menuitem"
            >
              <span style={viewerStyles.actionMenuItemLabel}>Close</span>
            </button>
            {onCloseOtherTabs && openFiles.length > 1 ? (
              <button
                type="button"
                style={viewerStyles.actionMenuItem}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseOtherTabs(menu.filePath)
                  setMenu(null)
                }}
                role="menuitem"
              >
                <span style={viewerStyles.actionMenuItemLabel}>Close other tabs</span>
              </button>
            ) : null}
            {onCloseAllTabs ? (
              <button
                type="button"
                style={viewerStyles.actionMenuItem}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onCloseAllTabs()
                  setMenu(null)
                }}
                role="menuitem"
              >
                <span style={viewerStyles.actionMenuItemLabel}>Close all tabs</span>
              </button>
            ) : null}
          </div>
        </>,
        document.body,
      ) : null}
    </>
  )
}

function FileTab({
  file,
  label,
  isActive,
  isMenuOpen,
  onActivatePane,
  onSelect,
  onContextMenu,
  onClose,
}: {
  file: OpenFile
  label: FileTabLabel
  isActive: boolean
  isMenuOpen: boolean
  onActivatePane: () => void
  onSelect: (filePath: string) => void
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>, filePath: string) => void
  onClose: (filePath: string) => void
}): React.JSX.Element {
  const className = `code-tab${isActive ? ' code-tab--active' : ''}${isMenuOpen ? ' code-tab--menu' : ''}`
  return (
    <div
      className={className}
      style={viewerStyles.tab}
      title={file.path}
      onContextMenu={(event) => onContextMenu(event, file.path)}
    >
      <button
        style={viewerStyles.tabLabel}
        onClick={() => onSelect(file.path)}
        title={file.path}
      >
        <FileTypeIcon name={fileName(file.path)} />
        <span style={viewerStyles.tabLabelName}>{label.name}</span>
        {label.description ? (
          <span style={viewerStyles.tabLabelDescription}>{label.description}</span>
        ) : null}
        {file.transient ? (
          <span style={viewerStyles.tabUnsaved} title="Unsaved temporary file" aria-label="Unsaved temporary file">●</span>
        ) : null}
      </button>
      <button
        className="code-tab__close"
        style={viewerStyles.tabClose}
        onClick={(event) => {
          event.stopPropagation()
          onActivatePane()
          onClose(file.path)
        }}
        title="Close"
      >
        {'\u00D7'}
      </button>
    </div>
  )
}

export function NoTabsHeader({ actions, onToggleMaximize }: {
  actions?: React.ReactNode
  onToggleMaximize?: () => void
}): React.JSX.Element {
  return (
    <div
      style={viewerStyles.header}
      onDoubleClick={(event) => { if (isStripBackground(event)) onToggleMaximize?.() }}
    >
      <span className="mono" style={viewerStyles.headerText}>
        No file selected
      </span>
      {actions ? <div style={viewerStyles.tabActions}>{actions}</div> : null}
    </div>
  )
}
