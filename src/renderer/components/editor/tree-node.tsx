import React, { useCallback } from 'react'
import type { FileTreeNode, FileChangeType } from '../../../shared/types'
import { NodeRow, CreateInput, sortChildren } from './tree-node-row'

export interface TreeNodeProps {
  node: FileTreeNode
  depth: number
  changeMap: Map<string, FileChangeType>
  activeFilePath: string | null
  selectedFilePath: string | null
  openFilePaths: Set<string>
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onHighlightFile: (path: string) => void
  onSelectFile: (path: string) => void
  onRequestDelete?: (path: string, name: string, isDirectory: boolean) => void
  renamingPath: string | null
  renameValue: string
  onRenameValueChange: (value: string) => void
  onConfirmRename: (nodePath: string, oldName: string) => void
  onCancelRename: () => void
  onContextMenu?: (e: React.MouseEvent, node: FileTreeNode) => void
  creating?: { parentPath: string; type: 'file' | 'directory'; afterPath?: string } | null
  createName?: string
  createError?: string | null
  onCreateNameChange?: (value: string) => void
  onConfirmCreate?: () => void
  onCancelCreate?: () => void
}

export function TreeNode({
  node,
  depth,
  changeMap,
  activeFilePath,
  selectedFilePath,
  openFilePaths,
  expandedPaths,
  onToggleExpand,
  onHighlightFile,
  onSelectFile,
  onRequestDelete,
  renamingPath,
  renameValue,
  onRenameValueChange,
  onConfirmRename,
  onCancelRename,
  creating,
  createName,
  createError,
  onCreateNameChange,
  onConfirmCreate,
  onCancelCreate,
  onContextMenu,
}: TreeNodeProps): React.JSX.Element {
  const expanded = expandedPaths.has(node.path)
  const isCreatingHere = creating?.parentPath === node.path

  const handleCreateKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      onConfirmCreate?.()
    } else if (e.key === 'Escape') {
      onCancelCreate?.()
    }
  }, [onConfirmCreate, onCancelCreate])

  const handleClick = useCallback((): void => {
    if (node.isDirectory) {
      onToggleExpand(node.path)
    } else {
      onHighlightFile(node.path)
      if (openFilePaths.has(node.path)) {
        onSelectFile(node.path)
      }
    }
  }, [node.isDirectory, node.path, onToggleExpand, onHighlightFile, openFilePaths, onSelectFile])

  const handleDoubleClick = useCallback((): void => {
    if (node.isDirectory) return
    onSelectFile(node.path)
  }, [node.isDirectory, node.path, onSelectFile])

  const handleDelete = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation()
    onRequestDelete?.(node.path, node.name, node.isDirectory)
  }, [node.path, node.name, node.isDirectory, onRequestDelete])

  const handleContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu?.(e, node)
  }, [node, onContextMenu])

  const changeType = changeMap.get(node.path)

  return (
    <>
      <NodeRow
        node={node}
        depth={depth}
        expanded={expanded}
        isActive={!node.isDirectory && node.path === activeFilePath}
        isSelected={!node.isDirectory && node.path === selectedFilePath}
        changeType={changeType ?? null}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onDelete={onRequestDelete && depth > 0 ? handleDelete : undefined}
        isRenaming={renamingPath === node.path}
        renameValue={renameValue}
        onRenameValueChange={onRenameValueChange}
        onConfirmRename={onConfirmRename}
        onCancelRename={onCancelRename}
        onContextMenu={handleContextMenu}
      />
      {node.isDirectory && expanded && (
        <>
          {isCreatingHere && !creating.afterPath && (
            <CreateInput
              depth={depth + 1}
              creating={creating}
              createName={createName}
              createError={createError}
              onCreateNameChange={onCreateNameChange}
              onKeyDown={handleCreateKeyDown}
              onConfirmCreate={onConfirmCreate}
              onCancelCreate={onCancelCreate}
            />
          )}
          {node.children && sortChildren(node.children).map((child) => (
            <React.Fragment key={child.path}>
              <TreeNode
                node={child}
                depth={depth + 1}
                changeMap={changeMap}
                activeFilePath={activeFilePath}
                selectedFilePath={selectedFilePath}
                openFilePaths={openFilePaths}
                expandedPaths={expandedPaths}
                onToggleExpand={onToggleExpand}
                onHighlightFile={onHighlightFile}
                onSelectFile={onSelectFile}
                onRequestDelete={onRequestDelete}
                renamingPath={renamingPath}
                renameValue={renameValue}
                onRenameValueChange={onRenameValueChange}
                onConfirmRename={onConfirmRename}
                onCancelRename={onCancelRename}
                onContextMenu={onContextMenu}
                creating={creating}
                createName={createName}
                createError={createError}
                onCreateNameChange={onCreateNameChange}
                onConfirmCreate={onConfirmCreate}
                onCancelCreate={onCancelCreate}
              />
              {isCreatingHere && creating.afterPath === child.path && (
                <CreateInput
                  depth={depth + 1}
                  creating={creating}
                  createName={createName}
                  createError={createError}
                  onCreateNameChange={onCreateNameChange}
                  onKeyDown={handleCreateKeyDown}
                  onConfirmCreate={onConfirmCreate}
                  onCancelCreate={onCancelCreate}
                />
              )}
            </React.Fragment>
          ))}
        </>
      )}
    </>
  )
}
