import React, { useCallback, useMemo, useState } from 'react'
import type { FileTreeNode, FileChange, FileChangeType } from '../../../shared/types'
import { TreeNode } from './tree-node'
import { ContextMenu } from './ContextMenu'
import type { ContextMenuAction } from './ContextMenu'
import { treeStyles } from './FileTree.styles'
import {
  collectDroppedPaths,
  describeDropTarget,
  hasDraggedFiles,
  resolveDropDirectory,
} from './file-tree-drop'
import { WorkspaceRootHeader, shortenPath, filterTree } from './file-tree-helpers'
import { useFileTreeEditing } from './useFileTreeEditing'

interface FileTreeProps {
  tree: FileTreeNode | null
  additionalTrees?: Map<string, FileTreeNode>
  additionalBranches?: Map<string, string | null>
  primaryBranch: string | null
  changes: FileChange[]
  activeFilePath: string | null
  openFilePaths: Set<string>
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onSelectFile: (path: string) => void
  onDeleteFile?: (path: string) => void
  onRenameFile?: (oldPath: string, newPath: string) => void
  onCreateFile?: (dirPath: string, fileName: string) => Promise<boolean>
  onCreateDir?: (dirPath: string, dirName: string) => Promise<boolean>
  onImportPaths?: (dirPath: string, sourcePaths: string[]) => Promise<string | null>
  onRevealInFinder?: (filePath: string) => Promise<void>
  onOpenInTerminal?: (dirPath: string) => Promise<void>
  onCopyAbsolutePath?: (filePath: string) => void
  onCopyRelativePath?: (filePath: string, rootPath: string) => void
  worktreeRootPath?: string
}

export function FileTree({
  tree, additionalTrees, additionalBranches, primaryBranch,
  changes, activeFilePath, openFilePaths, expandedPaths, onToggleExpand, onSelectFile,
  onDeleteFile, onRenameFile, onCreateFile, onCreateDir, onImportPaths,
  onRevealInFinder, onOpenInTerminal, onCopyAbsolutePath, onCopyRelativePath,
  worktreeRootPath,
}: FileTreeProps): React.JSX.Element {
  const editing = useFileTreeEditing(
    expandedPaths, onToggleExpand,
    onRenameFile, onDeleteFile, onCreateFile, onCreateDir,
  )

  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const defaultDropDir = worktreeRootPath ?? tree?.path ?? null

  const changeMap = useMemo(() => {
    const map = new Map<string, FileChangeType>()
    const root = tree?.path ?? ''
    for (const change of changes) {
      const absPath = root ? `${root.replace(/\/$/, '')}/${change.path}` : change.path
      map.set(absPath, change.type)
    }
    return map
  }, [changes, tree?.path])

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

  const updateDropTarget = useCallback((target: EventTarget | null): string | null => {
    const nextTarget = resolveDropDirectory(target, defaultDropDir)
    setDropTargetPath(nextTarget)
    return nextTarget
  }, [defaultDropDir])

  const clearDropState = useCallback((): void => {
    setIsDraggingFiles(false)
    setDropTargetPath(null)
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasDraggedFiles(e.dataTransfer)) return
    e.preventDefault()
    setImportError(null)
    setIsDraggingFiles(true)
    updateDropTarget(e.target)
  }, [updateDropTarget])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasDraggedFiles(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDraggingFiles(true)
    updateDropTarget(e.target)
  }, [updateDropTarget])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    clearDropState()
  }, [clearDropState])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    if (!hasDraggedFiles(e.dataTransfer)) { clearDropState(); return }
    e.preventDefault()
    const targetDir = updateDropTarget(e.target)
    clearDropState()
    if (!targetDir || !onImportPaths) return
    const sourcePaths = collectDroppedPaths(
      Array.from(e.dataTransfer.files),
      (file) => window.electronAPI.getPathForFile(file)
    )
    if (sourcePaths.length === 0) { setImportError('Could not read the dropped file paths.'); return }
    const error = await onImportPaths(targetDir, sourcePaths)
    setImportError(error)
  }, [clearDropState, onImportPaths, updateDropTarget])

  const buildContextMenuItems = useCallback((targetNode: FileTreeNode | null): (ContextMenuAction | 'separator')[] => {
    const items: (ContextMenuAction | 'separator')[] = []
    const rootPath = worktreeRootPath ?? tree?.path ?? ''
    if (!targetNode) {
      if (onCreateFile) items.push({ label: 'New File', action: () => editing.startCreating(tree?.path ?? '', 'file') })
      if (onCreateDir) items.push({ label: 'New Folder', action: () => editing.startCreating(tree?.path ?? '', 'directory') })
      return items
    }
    const isDir = targetNode.isDirectory
    const dirPath = targetNode.path.substring(0, targetNode.path.lastIndexOf('/'))
    if (onCreateFile) items.push({ label: 'New File', action: () => editing.startCreating(dirPath, 'file', targetNode.path) })
    if (onCreateDir) items.push({ label: 'New Folder', action: () => editing.startCreating(dirPath, 'directory', targetNode.path) })
    if (items.length > 0) items.push('separator')
    if (onRenameFile) items.push({ label: 'Rename', action: () => editing.handleStartRename(targetNode.path, targetNode.name) })
    if (onDeleteFile) items.push({ label: 'Delete', action: () => editing.handleRequestDelete(targetNode.path, targetNode.name, isDir) })
    items.push('separator')
    if (onCopyAbsolutePath) items.push({ label: 'Copy Absolute Path', action: () => onCopyAbsolutePath(targetNode.path) })
    if (onCopyRelativePath) items.push({ label: 'Copy Relative Path', action: () => onCopyRelativePath(targetNode.path, rootPath) })
    items.push('separator')
    if (onRevealInFinder) items.push({ label: 'Reveal in Finder', action: () => { void onRevealInFinder(targetNode.path) } })
    if (onOpenInTerminal) {
      const termDir = isDir ? targetNode.path : dirPath
      items.push({ label: 'Open in Terminal', action: () => { void onOpenInTerminal(termDir) } })
    }
    return items
  }, [tree?.path, worktreeRootPath, onCreateFile, onCreateDir, onRenameFile, onDeleteFile, onCopyAbsolutePath, onCopyRelativePath, onRevealInFinder, onOpenInTerminal, editing])

  const treeNodeProps = {
    changeMap, activeFilePath, selectedFilePath: editing.selectedFilePath,
    openFilePaths, expandedPaths, onToggleExpand,
    onHighlightFile: editing.setSelectedFilePath,
    onSelectFile,
    onRequestDelete: onDeleteFile ? editing.handleRequestDelete : undefined,
    renamingPath: editing.renamingPath, renameValue: editing.renameValue,
    onRenameValueChange: editing.setRenameValue,
    onConfirmRename: editing.handleConfirmRename,
    onCancelRename: editing.handleCancelRename,
    onContextMenu: editing.handleContextMenu,
    creating: editing.creating, createName: editing.createName,
    onCreateNameChange: editing.handleCreateNameChange,
    createError: editing.createError,
    onConfirmCreate: editing.handleConfirmCreate,
    onCancelCreate: editing.handleCancelCreate,
  }

  return (
    <div style={treeStyles.wrapper}>
      <div style={treeStyles.filterContainer}>
        <input
          type="text" style={treeStyles.filterInput} placeholder="Filter files..."
          value={editing.filterQuery}
          onChange={(e) => editing.setFilterQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') editing.setFilterQuery('') }}
        />
        {editing.filterQuery && (
          <button style={treeStyles.filterClear} onClick={() => editing.setFilterQuery('')} title="Clear filter">
            {'\u00D7'}
          </button>
        )}
      </div>
      {(isDraggingFiles || importError) && (
        <div style={{ ...treeStyles.statusBanner, ...(importError ? treeStyles.statusBannerError : treeStyles.statusBannerInfo) }}>
          {importError ?? `Drop to import into ${describeDropTarget(dropTargetPath ?? defaultDropDir)}`}
        </div>
      )}
      <div
        style={{ ...treeStyles.treeContainer, ...(isDraggingFiles ? treeStyles.treeContainerDragActive : {}) }}
        onContextMenu={(e) => { e.preventDefault(); editing.setContextMenu({ x: e.clientX, y: e.clientY, node: null }) }}
        onDragEnter={handleDragEnter} onDragOver={handleDragOver}
        onDragLeave={handleDragLeave} onDrop={(e) => { void handleDrop(e) }}
      >
        {filteredTree ? (
          <>
            {filteredAdditionalTrees && filteredAdditionalTrees.size > 0 ? (
              <>
                <div data-tree-root-path={filteredTree.path}>
                  <WorkspaceRootHeader name={filteredTree.name} subtitle={primaryBranch} isAdditional={false} />
                  <TreeNode node={filteredTree} depth={0} {...treeNodeProps} />
                </div>
                {Array.from(filteredAdditionalTrees.entries()).map(([dirPath, dirTree]) => (
                  <div key={dirPath} data-tree-root-path={dirPath}>
                    <WorkspaceRootHeader name={dirTree.name} subtitle={additionalBranches?.get(dirPath) ?? shortenPath(dirPath)} isAdditional={true} />
                    <TreeNode node={dirTree} depth={0} {...treeNodeProps} />
                  </div>
                ))}
              </>
            ) : (
              <div data-tree-root-path={filteredTree.path}>
                <TreeNode node={filteredTree} depth={0} {...treeNodeProps} />
              </div>
            )}
          </>
        ) : (
          <div style={treeStyles.empty}>No files to display</div>
        )}
        {isDraggingFiles && (
          <div style={treeStyles.dropOverlay}>
            <div style={treeStyles.dropOverlayLabel}>{`Import to ${describeDropTarget(dropTargetPath ?? defaultDropDir)}`}</div>
          </div>
        )}
      </div>
      {editing.contextMenu && (
        <ContextMenu x={editing.contextMenu.x} y={editing.contextMenu.y}
          items={buildContextMenuItems(editing.contextMenu.node)}
          onClose={() => editing.setContextMenu(null)} />
      )}
      {editing.pendingDelete && (
        <div style={treeStyles.dialogOverlay} onClick={editing.handleCancelDelete}>
          <div style={treeStyles.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={treeStyles.dialogTitle}>Delete {editing.pendingDelete.isDirectory ? 'folder' : 'file'}</div>
            <div style={treeStyles.dialogMessage}>
              Are you sure you want to delete <strong>{editing.pendingDelete.name}</strong>?
              {editing.pendingDelete.isDirectory && ' This will delete all contents.'}
            </div>
            <div style={treeStyles.dialogActions}>
              <button style={treeStyles.dialogCancel} onClick={editing.handleCancelDelete}>Cancel</button>
              <button style={treeStyles.dialogConfirm} onClick={editing.handleConfirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
