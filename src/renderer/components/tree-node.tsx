import React, { useCallback } from 'react'
import type { FileTreeNode, FileChangeType } from '../../shared/types'
import { getFileIconSvg } from './file-icons'
import { CHANGE_INDICATORS, treeStyles } from './FileTree.styles'

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
  onStartRename?: (path: string, name: string) => void
  onConfirmRename: (nodePath: string, oldName: string) => void
  onCancelRename: () => void
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
  onStartRename,
  onConfirmRename,
  onCancelRename,
}: TreeNodeProps): React.JSX.Element {
  const expanded = expandedPaths.has(node.path)

  const handleClick = useCallback((): void => {
    if (node.isDirectory) {
      onToggleExpand(node.path)
    } else {
      onHighlightFile(node.path)
    }
  }, [node.isDirectory, node.path, onToggleExpand, onHighlightFile])

  const handleDoubleClick = useCallback((): void => {
    if (node.isDirectory) return
    if (openFilePaths.has(node.path)) {
      onStartRename?.(node.path, node.name)
    } else {
      onSelectFile(node.path)
    }
  }, [node.isDirectory, node.path, node.name, openFilePaths, onSelectFile, onStartRename])

  const handleDelete = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation()
    onRequestDelete?.(node.path, node.name, node.isDirectory)
  }, [node.path, node.name, node.isDirectory, onRequestDelete])

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
        onDelete={onRequestDelete ? handleDelete : undefined}
        isRenaming={renamingPath === node.path}
        renameValue={renameValue}
        onRenameValueChange={onRenameValueChange}
        onConfirmRename={onConfirmRename}
        onCancelRename={onCancelRename}
      />
      {node.isDirectory && expanded && node.children && (
        <>
          {sortChildren(node.children).map((child) => (
            <TreeNode
              key={child.path}
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
              onStartRename={onStartRename}
              onConfirmRename={onConfirmRename}
              onCancelRename={onCancelRename}
            />
          ))}
        </>
      )}
    </>
  )
}

// Inline SVG chevron for directory expand/collapse
const CHEVRON_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>'

function NodeRow({
  node,
  depth,
  expanded,
  isActive,
  isSelected,
  changeType,
  onClick,
  onDoubleClick,
  onDelete,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onConfirmRename,
  onCancelRename,
}: {
  node: FileTreeNode
  depth: number
  expanded: boolean
  isActive: boolean
  isSelected: boolean
  changeType: FileChangeType | null
  onClick: () => void
  onDoubleClick: () => void
  onDelete?: (e: React.MouseEvent) => void
  isRenaming: boolean
  renameValue: string
  onRenameValueChange: (value: string) => void
  onConfirmRename: (nodePath: string, oldName: string) => void
  onCancelRename: () => void
}): React.JSX.Element {
  const indicator = changeType ? CHANGE_INDICATORS[changeType] : null
  const indent = depth * 8

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      onConfirmRename(node.path, node.name)
    } else if (e.key === 'Escape') {
      onCancelRename()
    }
  }, [node.path, node.name, onConfirmRename, onCancelRename])

  const handleInputClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation()
  }, [])

  return (
    <div
      className={`file-tree-row${isActive ? ' file-tree-row--active' : ''}${isSelected ? ' file-tree-row--selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        ...treeStyles.node,
        paddingLeft: `${indent + 4}px`,
      }}
      role="button"
      tabIndex={0}
      title={node.path}
    >
      {/* Indent guides */}
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          style={{
            position: 'absolute' as const,
            left: `${i * 8 + 12}px`,
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'var(--tree-indent-guide)',
            opacity: 0.4,
          }}
        />
      ))}
      {/* Chevron (directories) or spacer (files) */}
      {node.isDirectory ? (
        <span
          style={{
            ...treeStyles.chevron,
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
          dangerouslySetInnerHTML={{ __html: CHEVRON_SVG }}
        />
      ) : (
        <span style={treeStyles.chevronSpacer} />
      )}
      {/* File icon (directories use chevron only) */}
      {node.isDirectory ? null : (
        (() => {
          const svg = getFileIconSvg(node.name)
          return svg
            ? <span style={treeStyles.fileIconImg} dangerouslySetInnerHTML={{ __html: svg }} />
            : <span style={treeStyles.fileIcon}>{'\uD83D\uDCC4'}</span>
        })()
      )}
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={() => onCancelRename()}
          onClick={handleInputClick}
          style={treeStyles.renameInput}
        />
      ) : (
        <span
          className="truncate"
          style={{ ...treeStyles.nodeName, fontWeight: node.isDirectory ? 600 : 400 }}
        >
          {node.name}
        </span>
      )}
      {!isRenaming && indicator && (
        <span style={{ ...treeStyles.indicator, color: indicator.color }} title={changeType ?? undefined}>
          {indicator.label}
        </span>
      )}
      {!isRenaming && onDelete && (
        <span
          className="file-tree-delete-btn"
          onClick={onDelete}
          style={treeStyles.deleteButton}
          title="Delete"
          role="button"
          tabIndex={-1}
        >
          {'\uD83D\uDDD1'}
        </span>
      )}
    </div>
  )
}

function sortChildren(children: FileTreeNode[]): FileTreeNode[] {
  return [...children].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })
}
