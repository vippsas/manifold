import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FileTreeNode, FileChange } from '../../../../shared/types'
import { TreeChildren, TreeNode } from './tree-node'
import { buildChangeMaps } from './file-tree-changes'
import { ContextMenu } from '../../common/ContextMenu'
import { treeStyles } from './FileTree.styles'
import { describeDropTarget } from './file-tree-drop'
import { FileTreeDialogs } from './FileTreeDialogs'
import { FileTreeToolbar } from './FileTreeToolbar'
import { WorkspaceRootHeader, filterTree } from './file-tree-helpers'
import { buildVisibleNodes } from './file-tree-visible'
import { buildFileTreeContextMenu } from './file-tree-context-menu'
import type { FileTreeMenuConfig } from './file-tree-context-menu'
import { useFileTreeEditing } from './useFileTreeEditing'
import { useFileTreeSelection } from './useFileTreeSelection'
import { useFileTreeKeyboard } from './useFileTreeKeyboard'
import { useFileTreeClipboard } from './useFileTreeClipboard'
import { useFileTreePaste } from './useFileTreePaste'
import { useFileTreeViewActions } from './useFileTreeViewActions'
import { useFileTreeDragDrop } from './useFileTreeDragDrop'

/** How long an operation error stays on screen before it auto-dismisses. */
export const ERROR_BANNER_TIMEOUT_MS = 6000

interface FileTreeProps {
  tree: FileTreeNode | null
  additionalTrees?: Map<string, FileTreeNode>
  /** Optional display names per worktree root path. Keys: primary tree path, plus additional tree paths. */
  rootLabels?: Map<string, string>
  /** Render a root's contents directly, without a row for the root itself —
   *  for trees whose root is already named by a workspace header or by the
   *  sidebar row the folder hangs under. */
  flattenRoots?: boolean
  /** Filter/refresh/expand-all strip above the tree. Off for the sidebar's
   *  folders, where several trees are open at once and a strip per folder would
   *  stack up; find-by-name there is Quick Open's job. */
  showToolbar?: boolean
  changes: FileChange[]
  additionalChanges?: Map<string, FileChange[]>
  activeFilePath: string | null
  openFilePaths: Set<string>
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onSelectFile: (path: string) => void
  onDeleteFile?: (path: string) => void
  onRenameFile?: (oldPath: string, newPath: string) => void
  onCreateFile?: (dirPath: string, fileName: string) => Promise<boolean>
  onCreateDir?: (dirPath: string, dirName: string) => Promise<boolean>
  onRefresh?: () => Promise<void> | void
  onImportPaths?: (dirPath: string, sourcePaths: string[]) => Promise<string | null>
  onPasteImage?: (dirPath: string, dataUrl: string) => Promise<string | null>
  onPasteClipboardImage?: (dirPath: string) => Promise<{ pasted: boolean; error: string | null }>
  onMovePath?: (sourcePath: string, targetDir: string, options?: { overwrite?: boolean }) => Promise<string | null>
  onRevealInFinder?: (filePath: string) => Promise<void>
  onOpenInTerminal?: (dirPath: string) => Promise<void>
  onCopyAbsolutePath?: (filePath: string) => void
  onCopyRelativePath?: (filePath: string, rootPath: string) => void
  onOpenFileToSide?: (filePath: string) => void
  worktreeRootPath?: string
}

export function FileTree({
  tree, additionalTrees, rootLabels, flattenRoots = false, showToolbar = true,
  changes, additionalChanges, activeFilePath, openFilePaths, expandedPaths, onToggleExpand, onSelectFile,
  onDeleteFile, onRenameFile, onCreateFile, onCreateDir, onRefresh, onImportPaths, onPasteImage, onPasteClipboardImage, onMovePath,
  onRevealInFinder, onOpenInTerminal, onCopyAbsolutePath, onCopyRelativePath, onOpenFileToSide,
  worktreeRootPath,
}: FileTreeProps): React.JSX.Element {
  const editing = useFileTreeEditing(
    expandedPaths, onToggleExpand,
    onRenameFile, onDeleteFile, onCreateFile, onCreateDir,
  )
  const defaultDropDir = worktreeRootPath ?? tree?.path ?? null
  const dnd = useFileTreeDragDrop({ tree, additionalTrees, defaultDropDir, onImportPaths, onMovePath })
  const selection = useFileTreeSelection()
  const clipboard = useFileTreeClipboard({ onImportPaths, onMovePath })
  const containerRef = useRef<HTMLDivElement>(null)
  const [pendingBulkDelete, setPendingBulkDelete] = useState<FileTreeNode[] | null>(null)

  const { changeMap, dirChangeMap } = useMemo(() => buildChangeMaps([
    { rootPath: tree?.path ?? '', changes },
    ...Array.from(additionalChanges ?? [], ([rootPath, list]) => ({ rootPath, changes: list })),
  ]), [changes, additionalChanges, tree?.path])

  const filteredTree = useMemo(
    () => (tree && editing.filterQuery ? filterTree(tree, editing.filterQuery) : tree),
    [tree, editing.filterQuery]
  )
  const filteredAdditionalTrees = useMemo(() => {
    if (!additionalTrees || !editing.filterQuery) return additionalTrees
    const result = new Map<string, FileTreeNode>()
    for (const [dirPath, dirTree] of additionalTrees) {
      const filtered = filterTree(dirTree, editing.filterQuery)
      if (filtered) result.set(dirPath, filtered)
    }
    return result
  }, [additionalTrees, editing.filterQuery])

  const hasAdditionalRoots = Boolean(filteredAdditionalTrees && filteredAdditionalTrees.size > 0)
  const shouldShowPrimaryHeader = Boolean(filteredTree && (hasAdditionalRoots || rootLabels?.has(filteredTree.path)))

  const visibleNodes = useMemo(() => buildVisibleNodes({
    primary: filteredTree,
    additional: filteredAdditionalTrees,
    flattenRoots,
    hasHeaderedRoots: hasAdditionalRoots || shouldShowPrimaryHeader,
    expandedPaths,
  }), [filteredTree, filteredAdditionalTrees, flattenRoots, hasAdditionalRoots, shouldShowPrimaryHeader, expandedPaths])
  const visibleOrder = useMemo(() => visibleNodes.map((v) => v.node.path), [visibleNodes])

  const handleRowClick = useCallback((e: React.MouseEvent, node: FileTreeNode): void => {
    if (e.metaKey || e.ctrlKey) { selection.toggleSelect(node.path); return }
    if (e.shiftKey) { selection.rangeSelectTo(node.path, visibleOrder); return }
    selection.selectOnly(node.path)
    if (node.isDirectory) onToggleExpand(node.path)
    else onSelectFile(node.path)
  }, [selection, visibleOrder, onToggleExpand, onSelectFile])

  const handleDeleteNodes = useCallback((nodes: FileTreeNode[]): void => {
    if (nodes.length === 1) editing.handleRequestDelete(nodes[0].path, nodes[0].name, nodes[0].isDirectory)
    else if (nodes.length > 1) setPendingBulkDelete(nodes)
  }, [editing])

  const confirmBulkDelete = useCallback((): void => {
    if (pendingBulkDelete && onDeleteFile) for (const n of pendingBulkDelete) onDeleteFile(n.path)
    setPendingBulkDelete(null)
    selection.clearSelection()
  }, [pendingBulkDelete, onDeleteFile, selection])

  const { handleExpandAll, handleCollapseAll } = useFileTreeViewActions({
    tree, additionalTrees, expandedPaths, onToggleExpand, activeFilePath, containerRef,
  })

  const fileTreePaste = useFileTreePaste({
    clipboard,
    visibleNodes,
    cursorPath: selection.cursorPath,
    worktreeRootPath,
    treePath: tree?.path,
    onPasteImage,
    onPasteClipboardImage,
  })

  const keyboard = useFileTreeKeyboard({
    visibleNodes,
    selection,
    expandedPaths,
    containerRef,
    onToggleExpand,
    onOpenFile: onSelectFile,
    onRename: onRenameFile ? (node) => editing.handleStartRename(node.path, node.name) : undefined,
    onDelete: onDeleteFile ? handleDeleteNodes : undefined,
    onCopy: onImportPaths ? clipboard.copy : undefined,
    onCut: onMovePath ? clipboard.cut : undefined,
    onPaste: fileTreePaste.handleKeyboardPaste,
  })

  const menuConfig = useMemo<FileTreeMenuConfig>(() => ({
    rootPath: worktreeRootPath ?? tree?.path ?? '',
    defaultDir: tree?.path ?? '',
    createFile: onCreateFile ? (parent, after) => editing.startCreating(parent, 'file', after) : undefined,
    createFolder: onCreateDir ? (parent, after) => editing.startCreating(parent, 'directory', after) : undefined,
    rename: onRenameFile ? editing.handleStartRename : undefined,
    requestDelete: onDeleteFile ? editing.handleRequestDelete : undefined,
    copyAbsolutePath: onCopyAbsolutePath,
    copyRelativePath: onCopyRelativePath,
    revealInFinder: onRevealInFinder ? (p) => { void onRevealInFinder(p) } : undefined,
    openInTerminal: onOpenInTerminal ? (d) => { void onOpenInTerminal(d) } : undefined,
    openFileToSide: onOpenFileToSide,
    clipboard,
  }), [worktreeRootPath, tree?.path, onCreateFile, onCreateDir, onRenameFile, onDeleteFile, onCopyAbsolutePath, onCopyRelativePath, onRevealInFinder, onOpenInTerminal, onOpenFileToSide, clipboard, editing])

  const treeNodeProps = {
    changeMap, dirChangeMap, activeFilePath, selectedPaths: selection.selectedPaths,
    openFilePaths, expandedPaths,
    onRowClick: handleRowClick,
    filterQuery: editing.filterQuery,
    onRequestDelete: onDeleteFile ? editing.handleRequestDelete : undefined,
    renamingPath: editing.renamingPath, renameValue: editing.renameValue,
    onRenameValueChange: editing.setRenameValue,
    onConfirmRename: editing.handleConfirmRename,
    onCancelRename: editing.handleCancelRename,
    onStartRename: onRenameFile ? editing.handleStartRename : undefined,
    onContextMenu: editing.handleContextMenu,
    creating: editing.creating, createName: editing.createName,
    onCreateNameChange: editing.handleCreateNameChange,
    createError: editing.createError,
    onConfirmCreate: editing.handleConfirmCreate,
    onCancelCreate: editing.handleCancelCreate,
    dragRootPath: worktreeRootPath ?? tree?.path ?? null,
  }

  const isDraggingAny = dnd.isDraggingFiles || dnd.isDraggingInternal
  const operationError = dnd.importError ?? fileTreePaste.pasteError
  const { clearImportError } = dnd
  const { clearPasteError } = fileTreePaste
  const clearOperationError = useCallback((): void => {
    clearImportError()
    clearPasteError()
  }, [clearImportError, clearPasteError])

  // Operation errors are one-off; auto-dismiss so the banner never stays pinned
  // over the file tree after the user has seen it.
  useEffect(() => {
    if (!operationError) return
    const timer = setTimeout(clearOperationError, ERROR_BANNER_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [operationError, clearOperationError])

  const dropTargetLabel = describeDropTarget(dnd.dropTargetPath ?? defaultDropDir)
  const overlayLabel = dnd.isDraggingInternal ? `Move to ${dropTargetLabel}` : `Import to ${dropTargetLabel}`
  const bannerLabel = dnd.isDraggingInternal ? `Drop to move into ${dropTargetLabel}` : `Drop to import into ${dropTargetLabel}`

  const renderWorkspaceTree = useCallback((node: FileTreeNode): React.JSX.Element => {
    if (!flattenRoots || !node.isDirectory || !node.children || node.children.length === 0) {
      return <TreeNode node={node} depth={0} {...treeNodeProps} />
    }
    return <TreeChildren {...treeNodeProps} parentPath={node.path} nodes={node.children} depth={0} />
  }, [flattenRoots, treeNodeProps])

  return (
    <div style={treeStyles.wrapper}>
      {showToolbar && (
        <FileTreeToolbar
          filterQuery={editing.filterQuery}
          onFilterChange={editing.setFilterQuery}
          onClearFilter={() => editing.setFilterQuery('')}
          onRefresh={onRefresh}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
        />
      )}
      {(isDraggingAny || operationError) && (
        <div style={{ ...treeStyles.statusBanner, ...(operationError ? treeStyles.statusBannerError : treeStyles.statusBannerInfo) }}>
          <span style={treeStyles.statusBannerText}>{operationError ?? bannerLabel}</span>
          {operationError && (
            <button
              type="button"
              aria-label="Dismiss error"
              title="Dismiss"
              style={treeStyles.statusBannerClose}
              onClick={clearOperationError}
            >
              ×
            </button>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={keyboard.onKeyDown}
        onPaste={fileTreePaste.handlePaste}
        style={{ ...treeStyles.treeContainer, outline: 'none', ...(isDraggingAny ? treeStyles.treeContainerDragActive : {}) }}
        onContextMenu={(e) => { e.preventDefault(); editing.setContextMenu({ x: e.clientX, y: e.clientY, node: null }) }}
        {...dnd.handlers}
      >
        {filteredTree ? (
          <>
            {hasAdditionalRoots ? (
              <>
                <div data-tree-root-path={filteredTree.path}>
                  <WorkspaceRootHeader name={rootLabels?.get(filteredTree.path) ?? filteredTree.name} isAdditional={false} />
                  {renderWorkspaceTree(filteredTree)}
                </div>
                {filteredAdditionalTrees && Array.from(filteredAdditionalTrees.entries()).map(([dirPath, dirTree]) => (
                  <div key={dirPath} data-tree-root-path={dirPath}>
                    <WorkspaceRootHeader name={rootLabels?.get(dirPath) ?? dirTree.name} isAdditional={true} />
                    {renderWorkspaceTree(dirTree)}
                  </div>
                ))}
              </>
            ) : shouldShowPrimaryHeader ? (
              <div data-tree-root-path={filteredTree.path}>
                <WorkspaceRootHeader
                  name={rootLabels?.get(filteredTree.path) ?? filteredTree.name}
                  isAdditional={false}
                />
                {renderWorkspaceTree(filteredTree)}
              </div>
            ) : (
              <div data-tree-root-path={filteredTree.path}>
                {renderWorkspaceTree(filteredTree)}
              </div>
            )}
          </>
        ) : (
          <div style={treeStyles.empty}>No files to display</div>
        )}
        {isDraggingAny && (
          <div style={treeStyles.dropOverlay}>
            <div style={treeStyles.dropOverlayLabel}>{overlayLabel}</div>
          </div>
        )}
      </div>
      {editing.contextMenu && (
        <ContextMenu x={editing.contextMenu.x} y={editing.contextMenu.y}
          items={buildFileTreeContextMenu(editing.contextMenu.node, menuConfig)}
          onClose={() => editing.setContextMenu(null)} />
      )}
      <FileTreeDialogs
        pendingDelete={editing.pendingDelete}
        onCancelDelete={editing.handleCancelDelete}
        onConfirmDelete={editing.handleConfirmDelete}
        pendingBulkDelete={pendingBulkDelete}
        onCancelBulkDelete={() => setPendingBulkDelete(null)}
        onConfirmBulkDelete={confirmBulkDelete}
        pendingOverwrite={dnd.pendingOverwrite}
        onCancelOverwrite={dnd.cancelOverwrite}
        onConfirmOverwrite={() => { void dnd.confirmOverwrite() }}
      />
    </div>
  )
}
