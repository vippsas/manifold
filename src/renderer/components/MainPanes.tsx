import React, { type RefObject } from 'react'
import type { FileTreeNode, FileChange } from '../../shared/types'
import type { OpenFile } from '../hooks/useCodeView'
import type { PaneVisibility, PaneName } from '../hooks/usePaneResize'
import { TerminalPane } from './TerminalPane'
import { ShellTabs } from './ShellTabs'
import { CodeViewer } from './CodeViewer'
import { FileTree } from './FileTree'
import { OnboardingView } from './OnboardingView'

interface MainPanesProps {
  panesRef: RefObject<HTMLDivElement>
  rightAreaRef: RefObject<HTMLDivElement>
  leftPaneFraction: number
  centerFraction: number
  rightPaneFraction: number
  bottomPaneFraction: number
  handleDividerMouseDown: (divider: 'left' | 'right' | 'bottom') => (e: React.MouseEvent) => void
  paneVisibility: PaneVisibility
  onClosePane: (pane: PaneName) => void
  sessionId: string | null
  worktreeShellSessionId: string | null
  projectShellSessionId: string | null
  scrollbackLines: number
  codeViewMode: 'diff' | 'file'
  diff: string
  openFiles: OpenFile[]
  activeFilePath: string | null
  fileContent: string | null
  theme: 'dark' | 'light'
  tree: FileTreeNode | null
  changes: FileChange[]
  onNewAgent: () => void
  onSelectFile: (path: string) => void
  onCloseFile: (path: string) => void
  onShowDiff: () => void
  onSaveFile: (content: string) => void
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
  sessionId,
  worktreeShellSessionId,
  projectShellSessionId,
  scrollbackLines,
  codeViewMode,
  diff,
  openFiles,
  activeFilePath,
  fileContent,
  theme,
  tree,
  changes,
  onNewAgent,
  onSelectFile,
  onCloseFile,
  onShowDiff,
  onSaveFile,
  expandedPaths,
  onToggleExpand,
}: MainPanesProps): React.JSX.Element {
  const showLeft = paneVisibility.left
  const showRight = paneVisibility.right
  const showBottom = paneVisibility.bottom

  const rightAreaTotal = centerFraction + rightPaneFraction
  const rightAreaCenterFraction = rightAreaTotal > 0 ? centerFraction / rightAreaTotal : 0.5
  const rightAreaRightFraction = rightAreaTotal > 0 ? rightPaneFraction / rightAreaTotal : 0.5
  const topFraction = 1 - bottomPaneFraction

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
            <div style={{ flex: showBottom ? `0 0 ${topFraction * 100}%` : 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0 }}>
              <div className="layout-pane" style={{ flex: showRight ? `0 0 ${rightAreaCenterFraction * 100}%` : 1 }}>
                <CodeViewer
                  mode={codeViewMode}
                  diff={diff}
                  openFiles={openFiles}
                  activeFilePath={activeFilePath}
                  fileContent={fileContent}
                  theme={theme}
                  worktreeRoot={tree?.path ?? null}
                  onSelectTab={onSelectFile}
                  onCloseTab={onCloseFile}
                  onShowDiff={onShowDiff}
                  onSaveFile={onSaveFile}
                />
              </div>

              {showRight && (
                <>
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
                      activeFilePath={activeFilePath}
                      expandedPaths={expandedPaths}
                      onToggleExpand={onToggleExpand}
                      onSelectFile={onSelectFile}
                      onShowDiff={onShowDiff}
                      onClose={() => onClosePane('right')}
                    />
                  </div>
                </>
              )}
            </div>

            {showBottom && (
              <>
                {/* Horizontal Divider */}
                <div
                  className="pane-divider-horizontal"
                  onMouseDown={handleDividerMouseDown('bottom')}
                  role="separator"
                  aria-orientation="horizontal"
                />

                {/* Bottom: User Terminal (tabbed: Worktree + Project) */}
                <div style={{ flex: `0 0 ${bottomPaneFraction * 100}%`, overflow: 'hidden', minHeight: 0 }}>
                  <ShellTabs
                    worktreeSessionId={worktreeShellSessionId}
                    projectSessionId={projectShellSessionId}
                    scrollbackLines={scrollbackLines}
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
