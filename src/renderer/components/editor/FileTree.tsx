import React, { useCallback, useMemo } from 'react'
import type { FileTreeNode, FileChange, FileChangeType } from '../../../shared/types'
import { TreeNode } from './tree-node'
import { ContextMenu } from './ContextMenu'
import type { ContextMenuAction } from './ContextMenu'
import { treeStyles } from './FileTree.styles'
import { describeDropTarget } from './file-tree-drop'
import { WorkspaceRootHeader, filterTree } from './file-tree-helpers'
import { useFileTreeEditing } from './useFileTreeEditing'
import { useFileTreeDragDrop } from './useFileTreeDragDrop'

interface FileTreeProps {
  tree: FileTreeNode | null
  additionalTrees?: Map<string, FileTreeNode>
  /** Optional display names per worktree root path. Keys: primary tree path, plus additional tree paths. */
  rootLabels?: Map<string, string>
  /** Render the root directory contents directly when a workspace header is shown. */
  flattenRoots?: boolean
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
  onImportPaths?: (dirPath: string, sourcePaths: string[]) => Promise<string | null>
  onMovePath?: (sourcePath: string, targetDir: string, options?: { overwrite?: boolean }) => Promise<string | null>
  onRevealInFinder?: (filePath: string) => Promise<void>
  onOpenInTerminal?: (dirPath: string) => Promise<void>
  onCopyAbsolutePath?: (filePath: string) => void
  onCopyRelativePath?: (filePath: string, rootPath: string) => void
  worktreeRootPath?: string
}

export function FileTree({
  tree, additionalTrees, rootLabels, flattenRoots = false,
  changes, additionalChanges, activeFilePath, openFilePaths, expandedPaths, onToggleExpand, onSelectFile,
  onDeleteFile, onRenameFile, onCreateFile, onCreateDir, onImportPaths, onMovePath,
  onRevealInFinder, onOpenInTerminal, onCopyAbsolutePath, onCopyRelativePath,
  worktreeRootPath,
}: FileTreeProps): React.JSX.Element {
  const editing = useFileTreeEditing(
    expandedPaths, onToggleExpand,
    onRenameFile, onDeleteFile, onCreateFile, onCreateDir,
  )
  const defaultDropDir = worktreeRootPath ?? tree?.path ?? null
  const dnd = useFileTreeDragDrop({ tree, additionalTrees, defaultDropDir, onImportPaths, onMovePath })

  const changeMap = useMemo(() => {
    const map = new Map<string, FileChangeType>()
    const addChanges = (root: string, list: FileChange[]): void => {
      const normalizedRoot = root.replace(/\/$/, '')
      for (const change of list) {
        const absPath = normalizedRoot ? `${normalizedRoot}/${change.path}` : change.path
        map.set(absPath, change.type)
      }
    }
    addChanges(tree?.path ?? '', changes)
    if (additionalChanges) {
      for (const [root, list] of additionalChanges) addChanges(root, list)
    }
    return map
  }, [changes, additionalChanges, tree?.path])

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
  const dropTargetLabel = describeDropTarget(dnd.dropTargetPath ?? defaultDropDir)
  const overlayLabel = dnd.isDraggingInternal ? `Move to ${dropTargetLabel}` : `Import to ${dropTargetLabel}`
  const bannerLabel = dnd.isDraggingInternal ? `Drop to move into ${dropTargetLabel}` : `Drop to import into ${dropTargetLabel}`
  const hasAdditionalRoots = Boolean(filteredAdditionalTrees && filteredAdditionalTrees.size > 0)
  const shouldShowPrimaryHeader = Boolean(filteredTree && (hasAdditionalRoots || rootLabels?.has(filteredTree.path)))

  const renderWorkspaceTree = useCallback((node: FileTreeNode): React.JSX.Element => {
    if (!flattenRoots || !node.isDirectory || !node.children || node.children.length === 0) {
      return <TreeNode node={node} depth={0} {...treeNodeProps} />
    }
    return (
      <>
        {node.children.map((child) => (
          <TreeNode key={child.path} node={child} depth={0} {...treeNodeProps} />
        ))}
      </>
    )
  }, [flattenRoots, treeNodeProps])

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
            {'×'}
          </button>
        )}
      </div>
      {(isDraggingAny || dnd.importError) && (
        <div style={{ ...treeStyles.statusBanner, ...(dnd.importError ? treeStyles.statusBannerError : treeStyles.statusBannerInfo) }}>
          {dnd.importError ?? bannerLabel}
        </div>
      )}
      <div
        style={{ ...treeStyles.treeContainer, ...(isDraggingAny ? treeStyles.treeContainerDragActive : {}) }}
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
                {Array.from(filteredAdditionalTrees.entries()).map(([dirPath, dirTree]) => (
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
                <TreeNode node={filteredTree} depth={0} {...treeNodeProps} />
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
      {dnd.pendingOverwrite && (
        <div style={treeStyles.dialogOverlay} onClick={dnd.cancelOverwrite}>
          <div style={treeStyles.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={treeStyles.dialogTitle}>Replace existing item?</div>
            <div style={treeStyles.dialogMessage}>
              <strong>{describeDropTarget(dnd.pendingOverwrite.newPath)}</strong> already exists in{' '}
              <strong>{describeDropTarget(dnd.pendingOverwrite.targetDir)}</strong>. Replace it with the moved item?
            </div>
            <div style={treeStyles.dialogActions}>
              <button style={treeStyles.dialogCancel} onClick={dnd.cancelOverwrite}>Cancel</button>
              <button style={treeStyles.dialogConfirm} onClick={() => { void dnd.confirmOverwrite() }}>Replace</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
