import React from 'react'
import type { OpenFile } from '../../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import { fileName, getFileTabLabels, type FileTabLabel } from './code-viewer-utils'

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
  const labels = React.useMemo(
    () => getFileTabLabels(openFiles.map((file) => file.path)),
    [openFiles],
  )

  return (
    <div style={viewerStyles.tabBar}>
      <div style={viewerStyles.tabStrip}>
        {openFiles.map((file, index) => (
          <FileTab
            key={file.path}
            file={file}
            label={labels[index] ?? { name: fileName(file.path), description: '' }}
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
  label,
  isActive,
  onActivatePane,
  onSelect,
  onClose,
}: {
  file: OpenFile
  label: FileTabLabel
  isActive: boolean
  onActivatePane: () => void
  onSelect: (filePath: string) => void
  onClose: (filePath: string) => void
}): React.JSX.Element {
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
