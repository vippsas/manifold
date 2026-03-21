import React, { useCallback, useRef } from 'react'
import type { OpenFile } from '../../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import { shortenFileNameForTab } from './code-viewer-utils'

export interface MoveTarget {
  id: string
  label: string
}

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

  const handleMoveClick = useCallback(() => {
    if (!hasMoveTargets || !moveButtonRef.current || !onOpenMoveMenu) return
    onActivatePane()
    const rect = moveButtonRef.current.getBoundingClientRect()
    onOpenMoveMenu(rect.left, rect.bottom + 4)
  }, [hasMoveTargets, onActivatePane, onOpenMoveMenu])

  return (
    <>
      <button
        style={viewerStyles.actionButton}
        onClick={() => {
          onActivatePane()
          onSplitPane('right')
        }}
        title="Split editor vertically"
      >
        Split Right
      </button>
      <button
        style={viewerStyles.actionButton}
        onClick={() => {
          onActivatePane()
          onSplitPane('below')
        }}
        title="Split editor horizontally"
      >
        Split Down
      </button>
      {hasMoveTargets && (
        <button
          ref={moveButtonRef}
          style={viewerStyles.actionButton}
          onClick={handleMoveClick}
          title="Move file to another editor"
        >
          Move
        </button>
      )}
    </>
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
