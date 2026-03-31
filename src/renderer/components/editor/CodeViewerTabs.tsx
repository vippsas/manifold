import React from 'react'
import type { OpenFile } from '../../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import { fileName, getFileTabLabels, type FileTabLabel } from './code-viewer-utils'

interface TabBarProps {
  openFiles: OpenFile[]
  activeFilePath: string | null
  onActivatePane: () => void
  onSelectTab: (filePath: string) => void
  onMoveToSplitPane?: (filePath: string, direction: 'right' | 'below') => void
  onCloseTab: (filePath: string) => void
}

export function TabBar({
  openFiles,
  activeFilePath,
  onActivatePane,
  onSelectTab,
  onMoveToSplitPane,
  onCloseTab,
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

  const handleTabContextMenu = React.useCallback((event: React.MouseEvent<HTMLDivElement>, filePath: string): void => {
    event.preventDefault()
    event.stopPropagation()
    onActivatePane()
    onSelectTab(filePath)

    if (!onMoveToSplitPane) return

    setMenu({ filePath, x: event.clientX, y: event.clientY })
  }, [onActivatePane, onMoveToSplitPane, onSelectTab])

  return (
    <>
      <div style={viewerStyles.tabBar}>
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
      </div>
      {menu && onMoveToSplitPane ? (
        <>
          <div style={viewerStyles.actionMenuOverlay} onClick={() => setMenu(null)} />
          <div
            ref={menuRef}
            style={{ ...viewerStyles.actionMenu, left: menu.x, top: menu.y }}
            role="menu"
            aria-label="Tab actions"
            onMouseDown={(event) => event.stopPropagation()}
          >
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
          </div>
        </>
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
  return (
    <div
      style={{
        ...viewerStyles.tab,
        ...(isActive ? viewerStyles.tabActive : {}),
        ...(isMenuOpen ? viewerStyles.tabMenuOpen : {}),
      }}
      title={file.path}
      onContextMenu={(event) => onContextMenu(event, file.path)}
    >
      <button
        style={viewerStyles.tabLabel}
        onClick={() => onSelect(file.path)}
        title={file.path}
      >
        <span style={viewerStyles.tabLabelName}>{label.name}</span>
        {label.description ? (
          <>
            <span style={viewerStyles.tabLabelSeparator}>{' \u2022 '}</span>
            <span style={viewerStyles.tabLabelDescription}>{label.description}</span>
          </>
        ) : null}
      </button>
      <button
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

export function NoTabsHeader(): React.JSX.Element {
  return (
    <div style={viewerStyles.header}>
      <span className="mono" style={viewerStyles.headerText}>
        No file selected
      </span>
    </div>
  )
}
