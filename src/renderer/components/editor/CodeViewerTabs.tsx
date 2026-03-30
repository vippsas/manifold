import React from 'react'
import type { OpenFile } from '../../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import { getFileNameTabLabelParts } from './code-viewer-utils'

const FILE_TAB_LABEL_MAX_LENGTH = 22

interface TabBarProps {
  openFiles: OpenFile[]
  activeFilePath: string | null
  onActivatePane: () => void
  onSelectTab: (filePath: string) => void
  onCloseTab: (filePath: string) => void
}

export function TabBar({
  openFiles,
  activeFilePath,
  onActivatePane,
  onSelectTab,
  onCloseTab,
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
    </div>
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
  const label = getFileNameTabLabelParts(file.path, FILE_TAB_LABEL_MAX_LENGTH)

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
        {label.truncated ? (
          <>
            <span style={viewerStyles.tabLabelPrefix}>{label.prefix}</span>
            <span style={viewerStyles.tabLabelEllipsis}>{'\u2026'}</span>
            {label.suffix ? <span style={viewerStyles.tabLabelSuffix}>{label.suffix}</span> : null}
          </>
        ) : (
          label.prefix
        )}
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
