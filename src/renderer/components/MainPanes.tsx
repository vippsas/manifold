import React, { type RefObject } from 'react'
import type { FileTreeNode, FileChange } from '../../shared/types'
import type { OpenFile } from '../hooks/useCodeView'
import { TerminalPane } from './TerminalPane'
import { CodeViewer } from './CodeViewer'
import { FileTree } from './FileTree'

interface MainPanesProps {
  panesRef: RefObject<HTMLDivElement>
  leftPaneFraction: number
  centerFraction: number
  rightPaneFraction: number
  handleDividerMouseDown: (divider: 'left' | 'right') => (e: React.MouseEvent) => void
  sessionId: string | null
  scrollbackLines: number
  codeViewMode: 'diff' | 'file'
  diff: string
  openFiles: OpenFile[]
  activeFilePath: string | null
  fileContent: string | null
  theme: 'dark' | 'light'
  tree: FileTreeNode | null
  changes: FileChange[]
  onSelectFile: (path: string) => void
  onCloseFile: (path: string) => void
  onShowDiff: () => void
  onSaveFile: (content: string) => void
}

export function MainPanes({
  panesRef,
  leftPaneFraction,
  centerFraction,
  rightPaneFraction,
  handleDividerMouseDown,
  sessionId,
  scrollbackLines,
  codeViewMode,
  diff,
  openFiles,
  activeFilePath,
  fileContent,
  theme,
  tree,
  changes,
  onSelectFile,
  onCloseFile,
  onShowDiff,
  onSaveFile,
}: MainPanesProps): React.JSX.Element {
  return (
    <div className="layout-panes" ref={panesRef}>
      <div className="layout-pane" style={{ flex: `0 0 ${leftPaneFraction * 100}%` }}>
        <TerminalPane sessionId={sessionId} scrollbackLines={scrollbackLines} />
      </div>

      <div
        className="pane-divider"
        onMouseDown={handleDividerMouseDown('left')}
        role="separator"
        aria-orientation="vertical"
      />

      <div className="layout-pane" style={{ flex: `0 0 ${centerFraction * 100}%` }}>
        <CodeViewer
          mode={codeViewMode}
          diff={diff}
          openFiles={openFiles}
          activeFilePath={activeFilePath}
          fileContent={fileContent}
          theme={theme}
          onSelectTab={onSelectFile}
          onCloseTab={onCloseFile}
          onShowDiff={onShowDiff}
          onSaveFile={onSaveFile}
        />
      </div>

      <div
        className="pane-divider"
        onMouseDown={handleDividerMouseDown('right')}
        role="separator"
        aria-orientation="vertical"
      />

      <div className="layout-pane" style={{ flex: `0 0 ${rightPaneFraction * 100}%` }}>
        <FileTree
          tree={tree}
          changes={changes}
          onSelectFile={onSelectFile}
          onShowDiff={onShowDiff}
        />
      </div>
    </div>
  )
}
