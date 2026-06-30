import React, { useMemo } from 'react'
import { FileTree } from './FileTree'
import { useDockState } from '../editor-shell/dock-panel-types'

// The dock-state-bound file tree. Shared by the "Files" dock panel and the
// sidebar Explorer view so both render the active worktree's tree with identical
// open/rename/refresh behavior. Must be mounted inside a DockStateContext.
export function DockFileTree(): React.JSX.Element {
  const s = useDockState()
  const openFilePaths = useMemo(
    () => new Set(s.openFiles.map((f) => f.path)),
    [s.openFiles]
  )

  return (
    <FileTree
      tree={s.tree}
      additionalTrees={s.additionalTrees}
      rootLabels={s.rootLabels}
      changes={s.changes}
      activeFilePath={s.activeFilePath}
      openFilePaths={openFilePaths}
      expandedPaths={s.expandedPaths}
      onToggleExpand={s.onToggleExpand}
      onSelectFile={s.onSelectFileFromFileTree}
      onDeleteFile={s.onDeleteFile}
      onRenameFile={s.onRenameFile}
      onCreateFile={s.onCreateFile}
      onCreateDir={s.onCreateDir}
      onRefresh={s.onRefreshFileTree}
      onImportPaths={s.onImportPaths}
      onPasteImage={s.onPasteImage}
      onPasteClipboardImage={s.onPasteClipboardImage}
      onMovePath={s.onMovePath}
      onRevealInFinder={s.onRevealInFinder}
      onOpenInTerminal={s.onOpenInTerminal}
      onCopyAbsolutePath={s.onCopyAbsolutePath}
      onCopyRelativePath={s.onCopyRelativePath}
      onOpenFileToSide={(path) => s.onOpenSearchResultInSplit({ path, sessionId: s.sessionId })}
      worktreeRootPath={s.worktreeRootPath}
    />
  )
}
