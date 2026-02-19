import React, { type RefObject } from 'react'
import type { FileTreeNode, FileChange } from '../../shared/types'
import type { OpenFile } from '../hooks/useCodeView'
import { TerminalPane } from './TerminalPane'
import { CodeViewer } from './CodeViewer'
import { FileTree } from './FileTree'

interface MainPanesProps {
  panesRef: RefObject<HTMLDivElement>
  rightAreaRef: RefObject<HTMLDivElement>
  leftPaneFraction: number
  centerFraction: number
  rightPaneFraction: number
  bottomPaneFraction: number
  handleDividerMouseDown: (divider: 'left' | 'right' | 'bottom') => (e: React.MouseEvent) => void
  sessionId: string | null
  shellSessionId: string | null
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
  rightAreaRef,
  leftPaneFraction,
  centerFraction,
  rightPaneFraction,
  bottomPaneFraction,
  handleDividerMouseDown,
  sessionId,
  shellSessionId,
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
  const rightAreaCenterFraction = centerFraction / (centerFraction + rightPaneFraction)
  const rightAreaRightFraction = rightPaneFraction / (centerFraction + rightPaneFraction)
  const topFraction = 1 - bottomPaneFraction

  return (
    <div className="layout-panes" ref={panesRef}>
      {/* Left Pane — Agent Terminal (full height) */}
      <div className="layout-pane" style={{ flex: `0 0 ${leftPaneFraction * 100}%` }}>
        <TerminalPane sessionId={sessionId} scrollbackLines={scrollbackLines} label="Agent" />
      </div>

      <div
        className="pane-divider"
        onMouseDown={handleDividerMouseDown('left')}
        role="separator"
        aria-orientation="vertical"
      />

      {/* Right Area — vertical split: top (editor + files) / bottom (user terminal) */}
      <div
        ref={rightAreaRef}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
      >
        {/* Top: editor + file tree */}
        <div style={{ flex: `0 0 ${topFraction * 100}%`, display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}>
          <div className="layout-pane" style={{ flex: `0 0 ${rightAreaCenterFraction * 100}%` }}>
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

          <div className="layout-pane" style={{ flex: `0 0 ${rightAreaRightFraction * 100}%` }}>
            <FileTree
              tree={tree}
              changes={changes}
              onSelectFile={onSelectFile}
              onShowDiff={onShowDiff}
            />
          </div>
        </div>

        {/* Horizontal Divider */}
        <div
          className="pane-divider-horizontal"
          onMouseDown={handleDividerMouseDown('bottom')}
          role="separator"
          aria-orientation="horizontal"
        />

        {/* Bottom: User Terminal */}
        <div style={{ flex: `0 0 ${bottomPaneFraction * 100}%`, overflow: 'hidden', minHeight: 0 }}>
          <TerminalPane sessionId={shellSessionId} scrollbackLines={scrollbackLines} label="Shell" />
        </div>
      </div>
    </div>
  )
}
