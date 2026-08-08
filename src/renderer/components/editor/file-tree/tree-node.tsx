import React, { useCallback } from 'react'
import type { FileTreeNode, FileChangeType } from '../../../../shared/types'
import { NodeRow, CreateInput, sortChildren } from './tree-node-row'
import type { DirChangeEntry } from './file-tree-changes'

/**
 * A file tree change keyed by absolute path. `worktreeDirty` separates direct
 * working-tree changes (rendered as an A/M/D letter) from changes that only
 * differ relative to the base branch (rendered as a faint dot).
 */
export interface TreeChangeEntry {
  type: FileChangeType
  worktreeDirty: boolean
}

export interface TreeNodeProps {
  node: FileTreeNode
  depth: number
  changeMap: Map<string, TreeChangeEntry>
  /** Directories with changes somewhere inside them — the folder roll-up dot. */
  dirChangeMap: Map<string, DirChangeEntry>
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

export type TreeChildrenProps = Omit<TreeNodeProps, 'node' | 'depth'> & {
  /** The directory the children belong to — where a pending create lands. */
  parentPath: string
  nodes: FileTreeNode[]
  depth: number
}

/** A directory's children with the pending create row placed among them.
 *  Shared by an expanded directory and by a flattened root, whose own row the
 *  tree doesn't render — without this the root's create row had no host and
 *  "New File"/"New Folder" on a top-level entry did nothing. */
export function TreeChildren({ parentPath, nodes, depth, ...rest }: TreeChildrenProps): React.JSX.Element {
  const { creating, createName, createError, onCreateNameChange, onConfirmCreate, onCancelCreate } = rest
  const isCreatingHere = creating?.parentPath === parentPath

  const handleCreateKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      onConfirmCreate?.()
    } else if (e.key === 'Escape') {
      onCancelCreate?.()
    }
  }, [onConfirmCreate, onCancelCreate])

  const createRow = creating ? (
    <CreateInput
      depth={depth}
      creating={creating}
      createName={createName}
      createError={createError}
      onCreateNameChange={onCreateNameChange}
      onKeyDown={handleCreateKeyDown}
      onConfirmCreate={onConfirmCreate}
      onCancelCreate={onCancelCreate}
    />
  ) : null

  return (
    <>
      {isCreatingHere && !creating.afterPath && createRow}
      {sortChildren(nodes).map((child) => (
        <React.Fragment key={child.path}>
          <TreeNode {...rest} node={child} depth={depth} />
          {isCreatingHere && creating.afterPath === child.path && createRow}
        </React.Fragment>
      ))}
    </>
  )
}

export function TreeNode({ node, depth, ...rest }: TreeNodeProps): React.JSX.Element {
  const {
    changeMap,
    dirChangeMap,
    activeFilePath,
    selectedPaths,
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
    onContextMenu,
    dragRootPath,
  } = rest
  const expanded = expandedPaths.has(node.path)

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

  const change = changeMap.get(node.path)
  // Only directories roll up: a file's own letter already says everything.
  const subtreeChange = node.isDirectory ? dirChangeMap.get(node.path) ?? null : null

  return (
    <>
      <NodeRow
        node={node}
        depth={depth}
        expanded={expanded}
        isActive={!node.isDirectory && node.path === activeFilePath}
        isSelected={selectedPaths.has(node.path)}
        changeType={change?.type ?? null}
        worktreeDirty={change?.worktreeDirty ?? false}
        subtreeChange={subtreeChange}
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
        <TreeChildren {...rest} parentPath={node.path} nodes={node.children ?? []} depth={depth + 1} />
      )}
    </>
  )
}
