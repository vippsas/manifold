import React, { type RefObject } from 'react'
import type { ITheme } from '@xterm/xterm'
import type { FileTreeNode, FileChange } from '../../shared/types'
import type { OpenFile } from '../hooks/useCodeView'
import type { PaneVisibility, PaneName } from '../hooks/usePaneResize'
import { TerminalPane } from './TerminalPane'
import { ShellTabs } from './ShellTabs'
import { CodeViewer } from './CodeViewer'
import { FileTree } from './FileTree'
import { ModifiedFiles } from './ModifiedFiles'
import { OnboardingView } from './OnboardingView'

interface MainPanesProps {
  panesRef: RefObject<HTMLDivElement>
  rightAreaRef: RefObject<HTMLDivElement>
  leftPaneFraction: number
  centerFraction: number
  rightPaneFraction: number
  bottomPaneFraction: number
  handleDividerMouseDown: (divider: 'left' | 'right' | 'bottom' | 'fileTreeSplit') => (e: React.MouseEvent) => void
  paneVisibility: PaneVisibility
  onClosePane: (pane: PaneName) => void
  fileTreeVisible: boolean
  onCloseFileTree: () => void
  modifiedFilesVisible: boolean
  onCloseModifiedFiles: () => void
  fileTreeSplitFraction: number
  rightPaneRef: RefObject<HTMLDivElement>
  worktreeRoot: string | null
  sessionId: string | null
  worktreeShellSessionId: string | null
  projectShellSessionId: string | null
  worktreeCwd: string | null
  scrollbackLines: number
  fileDiffText: string | null
  originalContent: string | null
  openFiles: OpenFile[]
  activeFilePath: string | null
  fileContent: string | null
  theme: string
  xtermTheme?: ITheme
  tree: FileTreeNode | null
  changes: FileChange[]
  onNewAgent: () => void
  onSelectFile: (path: string) => void
  onCloseFile: (path: string) => void
  onSaveFile: (content: string) => void
  onDeleteFile?: (path: string) => void
  onRenameFile?: (oldPath: string, newPath: string) => void
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
}

export function MainPanes({
  panesRef,
  rightAreaRef,
  leftPaneFraction,
  centerFraction,
  rightPaneFraction,
  bottomPaneFraction,
  handleDividerMouseDown,
  paneVisibility,
  onClosePane,
  fileTreeVisible,
  onCloseFileTree,
  modifiedFilesVisible,
  onCloseModifiedFiles,
  fileTreeSplitFraction,
  rightPaneRef,
  worktreeRoot,
  sessionId,
  worktreeShellSessionId,
  projectShellSessionId,
  worktreeCwd,
  scrollbackLines,
  fileDiffText,
  originalContent,
  openFiles,
  activeFilePath,
  fileContent,
  theme,
  xtermTheme,
  tree,
  changes,
  onNewAgent,
  onSelectFile,
  onCloseFile,
  onSaveFile,
  onDeleteFile,
  onRenameFile,
  expandedPaths,
  onToggleExpand,
}: MainPanesProps): React.JSX.Element {
  const showLeft = paneVisibility.left
  const showCenter = paneVisibility.center
  const showRight = paneVisibility.right && (fileTreeVisible || modifiedFilesVisible)
  const showBottom = paneVisibility.bottom

  const rightAreaTotal = centerFraction + rightPaneFraction
  const rightAreaCenterFraction = rightAreaTotal > 0 ? centerFraction / rightAreaTotal : 0.5
  const rightAreaRightFraction = rightAreaTotal > 0 ? rightPaneFraction / rightAreaTotal : 0.5
  const topFraction = 1 - bottomPaneFraction
  const hasTopContent = showCenter || showRight

  return (
    <div className="layout-panes" ref={panesRef}>
      {sessionId ? (
        <>
          {/* Left Pane — Agent Terminal (full height) */}
          {showLeft && (
            <>
              <div className="layout-pane" style={{ flex: `0 0 ${leftPaneFraction * 100}%` }}>
                <TerminalPane
                  sessionId={sessionId}
                  scrollbackLines={scrollbackLines}
                  label="Agent"
                  xtermTheme={xtermTheme}
                  onClose={() => onClosePane('left')}
                />
              </div>

              <div
                className="pane-divider"
                onMouseDown={handleDividerMouseDown('left')}
                role="separator"
                aria-orientation="vertical"
              />
            </>
          )}

          {/* Right Area — vertical split: top (editor + files) / bottom (user terminal) */}
          <div
            ref={rightAreaRef}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}
          >
            {/* Top: editor + file tree */}
            {hasTopContent && <div style={{ flex: showBottom ? `0 0 ${topFraction * 100}%` : 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}>
              {showCenter && (
                <div className="layout-pane" style={{ flex: showRight ? `0 0 ${rightAreaCenterFraction * 100}%` : 1 }}>
                  <CodeViewer
                    fileDiffText={fileDiffText}
                    originalContent={originalContent}
                    openFiles={openFiles}
                    activeFilePath={activeFilePath}
                    fileContent={fileContent}
                    theme={theme}
                    onSelectTab={onSelectFile}
                    onCloseTab={onCloseFile}
                    onSaveFile={onSaveFile}
                    onClose={() => onClosePane('center')}
                  />
                </div>
              )}

              {showRight && (
                <>
                  {showCenter && (
                    <div
                      className="pane-divider"
                      onMouseDown={handleDividerMouseDown('right')}
                      role="separator"
                      aria-orientation="vertical"
                    />
                  )}

                  <div
                    ref={rightPaneRef}
                    className="layout-pane"
                    style={{
                      flex: showCenter ? `0 0 ${rightAreaRightFraction * 100}%` : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    {/* File Tree — expands to full when Modified Files is hidden */}
                    {fileTreeVisible && (
                      <div style={{ flex: modifiedFilesVisible ? `0 0 ${(1 - fileTreeSplitFraction) * 100}%` : 1, overflow: 'hidden', minHeight: 0 }}>
                        <FileTree
                          tree={tree}
                          changes={changes}
                          activeFilePath={activeFilePath}
                          expandedPaths={expandedPaths}
                          onToggleExpand={onToggleExpand}
                          onSelectFile={onSelectFile}
                          onDeleteFile={onDeleteFile}
                          onRenameFile={onRenameFile}
                          onClose={onCloseFileTree}
                        />
                      </div>
                    )}

                    {fileTreeVisible && modifiedFilesVisible && (
                      <div
                        className="pane-divider-horizontal"
                        onMouseDown={handleDividerMouseDown('fileTreeSplit')}
                        role="separator"
                        aria-orientation="horizontal"
                      />
                    )}

                    {/* Modified Files — expands to full when File Tree is hidden */}
                    {modifiedFilesVisible && (
                      <div style={{ flex: fileTreeVisible ? `0 0 ${fileTreeSplitFraction * 100}%` : 1, overflow: 'hidden', minHeight: 0 }}>
                        <ModifiedFiles
                          changes={changes}
                          activeFilePath={activeFilePath}
                          worktreeRoot={worktreeRoot ?? ''}
                          onSelectFile={onSelectFile}
                          onClose={onCloseModifiedFiles}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>}

            {showBottom && (
              <>
                {/* Horizontal Divider — only when top section has content */}
                {hasTopContent && (
                  <div
                    className="pane-divider-horizontal"
                    onMouseDown={handleDividerMouseDown('bottom')}
                    role="separator"
                    aria-orientation="horizontal"
                  />
                )}

                {/* Bottom: User Terminal — expands to full height when top section is empty */}
                <div style={{ flex: hasTopContent ? `0 0 ${bottomPaneFraction * 100}%` : 1, overflow: 'hidden', minHeight: 0 }}>
                  <ShellTabs
                    worktreeSessionId={worktreeShellSessionId}
                    projectSessionId={projectShellSessionId}
                    worktreeCwd={worktreeCwd}
                    scrollbackLines={scrollbackLines}
                    xtermTheme={xtermTheme}
                    onClose={() => onClosePane('bottom')}
                  />
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <OnboardingView variant="no-agent" onNewAgent={onNewAgent} />
      )}
    </div>
  )
}
