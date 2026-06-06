import React, { useCallback } from 'react'
import type { FileTreeNode, FileChangeType } from '../../../shared/types'
import { NodeRow, CreateInput, sortChildren } from './tree-node-row'

export interface TreeNodeProps {
  node: FileTreeNode
  depth: number
  changeMap: Map<string, FileChangeType>
  activeFilePath: string | null
  selectedPaths: Set<string>
  openFilePaths: Set<string>
  expandedPaths: Set<string>
  onRowClick: (e: React.MouseEvent, node: FileTreeNode) => void
  filterQuery?: string
  onRequestDelete?: (path: string, name: string, isDirectory: boolean) => void
  renamingPath: string | null
  renameValue: string
  onRenameValueChange: (value: string) => void
  onConfirmRename: (nodePath: string, oldName: string) => void
  onCancelRename: () => void
  onStartRename?: (path: string, name: string) => void
  onContextMenu?: (e: React.MouseEvent, node: FileTreeNode) => void
  dragRootPath?: string | null
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
  selectedPaths,
  openFilePaths,
  expandedPaths,
  onRowClick,
  filterQuery,
  onRequestDelete,
  renamingPath,
  renameValue,
  onRenameValueChange,
  onConfirmRename,
  onCancelRename,
  onStartRename,
  creating,
  createName,
  createError,
  onCreateNameChange,
  onConfirmCreate,
  onCancelCreate,
  onContextMenu,
  dragRootPath,
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

  const handleClick = useCallback((e: React.MouseEvent): void => {
    onRowClick(e, node)
  }, [node, onRowClick])

  const handleDoubleClick = useCallback((): void => {
    onStartRename?.(node.path, node.name)
  }, [node.path, node.name, onStartRename])

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
        isSelected={selectedPaths.has(node.path)}
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
        dragRootPath={dragRootPath}
        filterQuery={filterQuery}
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
                selectedPaths={selectedPaths}
                openFilePaths={openFilePaths}
                expandedPaths={expandedPaths}
                onRowClick={onRowClick}
                filterQuery={filterQuery}
                onRequestDelete={onRequestDelete}
                renamingPath={renamingPath}
                renameValue={renameValue}
                onRenameValueChange={onRenameValueChange}
                onConfirmRename={onConfirmRename}
                onCancelRename={onCancelRename}
                onStartRename={onStartRename}
                onContextMenu={onContextMenu}
                dragRootPath={dragRootPath}
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
