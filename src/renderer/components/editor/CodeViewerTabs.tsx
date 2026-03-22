import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { OpenFile } from '../../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import { shortenFileNameForTab } from './code-viewer-utils'

export interface MoveTarget {
  id: string
  label: string
}

type SplitDirection = 'right' | 'below'

interface TabBarProps {
  openFiles: OpenFile[]
  activeFilePath: string | null
  moveTargets: MoveTarget[]
  onActivatePane: () => void
  onSelectTab: (filePath: string) => void
  onCloseTab: (filePath: string) => void
  onOpenMoveMenu: (x: number, y: number) => void
  onSplitPane: (direction: 'right' | 'below') => void
  showPreviewToggle: boolean
  previewActive: boolean
  onTogglePreview: () => void
  showDiffToggle: boolean
  diffActive: boolean
  onToggleDiff: () => void
}

export function TabBar({
  openFiles,
  activeFilePath,
  moveTargets,
  onActivatePane,
  onSelectTab,
  onCloseTab,
  onOpenMoveMenu,
  onSplitPane,
  showPreviewToggle,
  previewActive,
  onTogglePreview,
  showDiffToggle,
  diffActive,
  onToggleDiff,
}: TabBarProps): React.JSX.Element {
  return (
    <div style={viewerStyles.tabBar}>
      <div style={viewerStyles.tabStrip}>
        {openFiles.map((file) => (
          <FileTab
            key={file.path}
            file={file}
            isActive={file.path === activeFilePath}
            onActivatePane={onActivatePane}
            onSelect={onSelectTab}
            onClose={onCloseTab}
          />
        ))}
      </div>
      <div style={viewerStyles.tabActions}>
        {showDiffToggle && (
          <button
            style={{ ...viewerStyles.previewToggle, ...(diffActive ? viewerStyles.previewToggleActive : {}) }}
            onClick={() => {
              onActivatePane()
              onToggleDiff()
            }}
            title={diffActive ? 'Show editor' : 'Show diff'}
          >
            Diff
          </button>
        )}
        {showPreviewToggle && (
          <button
            style={{ ...viewerStyles.previewToggle, ...(previewActive ? viewerStyles.previewToggleActive : {}) }}
            onClick={() => {
              onActivatePane()
              onTogglePreview()
            }}
            title={previewActive ? 'Show editor' : 'Show preview'}
          >
            {previewActive ? 'Editor' : 'Preview'}
          </button>
        )}
        <PaneActions
          hasMoveTargets={moveTargets.length > 0 && activeFilePath !== null}
          onActivatePane={onActivatePane}
          onOpenMoveMenu={onOpenMoveMenu}
          onSplitPane={onSplitPane}
        />
      </div>
    </div>
  )
}

function PaneActions({
  hasMoveTargets,
  onActivatePane,
  onOpenMoveMenu,
  onSplitPane,
}: {
  hasMoveTargets: boolean
  onActivatePane: () => void
  onOpenMoveMenu?: (x: number, y: number) => void
  onSplitPane: (direction: 'right' | 'below') => void
}): React.JSX.Element {
  const moveButtonRef = useRef<HTMLButtonElement | null>(null)
  const splitButtonRef = useRef<HTMLButtonElement | null>(null)
  const splitMenuRef = useRef<HTMLDivElement | null>(null)
  const [splitMenu, setSplitMenu] = useState<{ x: number; y: number } | null>(null)

  const handleMoveClick = useCallback(() => {
    if (!hasMoveTargets || !moveButtonRef.current || !onOpenMoveMenu) return
    onActivatePane()
    const rect = moveButtonRef.current.getBoundingClientRect()
    onOpenMoveMenu(rect.left, rect.bottom + 4)
  }, [hasMoveTargets, onActivatePane, onOpenMoveMenu])

  const handleToggleSplitMenu = useCallback(() => {
    if (!splitButtonRef.current) return
    onActivatePane()
    if (splitMenu) {
      setSplitMenu(null)
      return
    }
    const rect = splitButtonRef.current.getBoundingClientRect()
    setSplitMenu({ x: rect.right - 148, y: rect.bottom + 4 })
  }, [onActivatePane, splitMenu])

  const handleSplitSelect = useCallback((direction: SplitDirection) => {
    onActivatePane()
    onSplitPane(direction)
    setSplitMenu(null)
  }, [onActivatePane, onSplitPane])

  useEffect(() => {
    if (!splitMenu) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSplitMenu(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [splitMenu])

  useEffect(() => {
    const menu = splitMenuRef.current
    if (!menu || !splitMenu) return

    const rect = menu.getBoundingClientRect()
    const maxLeft = Math.max(4, window.innerWidth - rect.width - 4)
    const maxTop = Math.max(4, window.innerHeight - rect.height - 4)
    menu.style.left = `${Math.min(Math.max(4, splitMenu.x), maxLeft)}px`
    menu.style.top = `${Math.min(Math.max(4, splitMenu.y), maxTop)}px`
  }, [splitMenu])

  return (
    <>
      <button
        type="button"
        ref={splitButtonRef}
        style={{
          ...viewerStyles.compactActionButton,
          ...(splitMenu ? viewerStyles.compactActionButtonActive : {}),
        }}
        onClick={handleToggleSplitMenu}
        title="Split editor"
        aria-label="Split editor"
        aria-haspopup="menu"
        aria-expanded={splitMenu !== null}
      >
        <span style={viewerStyles.compactActionButtonContent}>
          <SplitGlyph direction="menu" />
          <span style={viewerStyles.iconCaret} />
        </span>
      </button>
      {hasMoveTargets && (
        <button
          type="button"
          ref={moveButtonRef}
          style={viewerStyles.actionButton}
          onClick={handleMoveClick}
          title="Move file to another editor"
        >
          Move
        </button>
      )}
      {splitMenu && (
        <>
          <div style={viewerStyles.actionMenuOverlay} onClick={() => setSplitMenu(null)} />
          <div
            ref={splitMenuRef}
            style={{ ...viewerStyles.actionMenu, left: splitMenu.x, top: splitMenu.y }}
            role="menu"
            aria-label="Split editor"
          >
            <button
              type="button"
              style={viewerStyles.actionMenuItem}
              onClick={() => handleSplitSelect('right')}
              role="menuitem"
            >
              <SplitGlyph direction="right" />
              <span style={viewerStyles.actionMenuItemLabel}>Split right</span>
            </button>
            <button
              type="button"
              style={viewerStyles.actionMenuItem}
              onClick={() => handleSplitSelect('below')}
              role="menuitem"
            >
              <SplitGlyph direction="below" />
              <span style={viewerStyles.actionMenuItemLabel}>Split down</span>
            </button>
          </div>
        </>
      )}
    </>
  )
}

function SplitGlyph({ direction }: { direction: 'menu' | SplitDirection }): React.JSX.Element {
  return (
    <span style={viewerStyles.splitGlyph} aria-hidden="true">
      {(direction === 'menu' || direction === 'right') && <span style={viewerStyles.splitGlyphDividerVertical} />}
      {(direction === 'menu' || direction === 'below') && <span style={viewerStyles.splitGlyphDividerHorizontal} />}
      {direction === 'right' && <span style={viewerStyles.splitGlyphPaneHighlightRight} />}
      {direction === 'below' && <span style={viewerStyles.splitGlyphPaneHighlightBelow} />}
    </span>
  )
}

function FileTab({
  file,
  isActive,
  onActivatePane,
  onSelect,
  onClose,
}: {
  file: OpenFile
  isActive: boolean
  onActivatePane: () => void
  onSelect: (filePath: string) => void
  onClose: (filePath: string) => void
}): React.JSX.Element {
  const label = shortenFileNameForTab(file.path)

  return (
    <div style={{ ...viewerStyles.tab, ...(isActive ? viewerStyles.tabActive : {}) }} title={file.path}>
      <button
        style={viewerStyles.tabLabel}
        onClick={() => {
          onActivatePane()
          onSelect(file.path)
        }}
        title={file.path}
      >
        {label}
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

export function NoTabsHeader({
  onActivatePane,
  onSplitPane,
}: {
  onActivatePane: () => void
  onSplitPane: (direction: 'right' | 'below') => void
}): React.JSX.Element {
  return (
    <div style={viewerStyles.header}>
      <span className="mono" style={viewerStyles.headerText}>
        No file selected
      </span>
      <PaneActions
        hasMoveTargets={false}
        onActivatePane={onActivatePane}
        onOpenMoveMenu={undefined}
        onSplitPane={onSplitPane}
      />
    </div>
  )
}
