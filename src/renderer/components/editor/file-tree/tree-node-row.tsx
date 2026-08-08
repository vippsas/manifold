import React, { useCallback } from 'react'
import type { FileTreeNode, FileChangeType } from '../../../../shared/types'
import { FileTypeIcon } from './FileTypeIcon'
import { getDraggedTreePath, writeFileTreeDragData } from './file-tree-drag'
import { fuzzyMatch } from './file-tree-visible'
import { highlightByIndices } from '../../search/search-highlight'
import { CHANGE_INDICATORS, treeStyles } from './FileTree.styles'
import type { DirChangeEntry } from './file-tree-changes'

/** Directory expand/collapse chevron; the wrapper rotates it when expanded. */
function ChevronIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

/** Render a filename with fuzzy-match highlight segments (when filtering). */
function renderName(name: string, filterQuery: string | undefined): React.ReactNode {
  if (!filterQuery) return name
  const indices = fuzzyMatch(name, filterQuery)
  if (!indices || indices.length === 0) return name
  return highlightByIndices(name, indices).map((seg, i) =>
    seg.match
      ? <span key={i} style={treeStyles.matchHighlight}>{seg.text}</span>
      : <React.Fragment key={i}>{seg.text}</React.Fragment>
  )
}

export function NodeRow({
  node,
  depth,
  expanded,
  isActive,
  isSelected,
  changeType,
  worktreeDirty,
  subtreeChange,
  onClick,
  onDoubleClick,
  onDelete,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onConfirmRename,
  onCancelRename,
  onContextMenu,
  dragRootPath,
  filterQuery,
}: {
  node: FileTreeNode
  depth: number
  expanded: boolean
  isActive: boolean
  isSelected: boolean
  changeType: FileChangeType | null
  worktreeDirty: boolean
  /** For a directory: what its subtree holds, or null when nothing in it changed. */
  subtreeChange?: DirChangeEntry | null
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onDelete?: (e: React.MouseEvent) => void
  isRenaming: boolean
  renameValue: string
  onRenameValueChange: (value: string) => void
  onConfirmRename: (nodePath: string, oldName: string) => void
  onCancelRename: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  dragRootPath?: string | null
  filterQuery?: string
}): React.JSX.Element {
  const indicator = changeType ? CHANGE_INDICATORS[changeType] : null
  // Direct working-tree changes get the vivid A/M/D letter and a tinted name;
  // changes that only differ vs the base branch get a faint dot and a plain
  // name, so the eye reads "letter = I changed this now".
  const showLetter = Boolean(changeType) && worktreeDirty
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

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    if (!dragRootPath) return
    writeFileTreeDragData(
      e.dataTransfer,
      getDraggedTreePath(node.path, dragRootPath),
      { sourcePath: node.path, rootPath: dragRootPath, isDirectory: node.isDirectory },
    )
  }, [dragRootPath, node.path, node.isDirectory])

  return (
    <div
      className={`file-tree-row${isActive ? ' file-tree-row--active' : ''}${isSelected ? ' file-tree-row--selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragStart={handleDragStart}
      data-tree-path={node.path}
      data-tree-is-directory={node.isDirectory ? 'true' : 'false'}
      style={{
        ...treeStyles.node,
        paddingLeft: `${indent + 4}px`,
      }}
      role="button"
      tabIndex={0}
      title={node.path}
      draggable={!isRenaming && Boolean(dragRootPath)}
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
      {/* Single glyph column, VS Code style: chevron for directories, type icon for files */}
      {node.isDirectory ? (
        <span
          style={{
            ...treeStyles.chevron,
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          <ChevronIcon />
        </span>
      ) : (
        <FileTypeIcon name={node.name} />
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
          style={{
            ...treeStyles.nodeName,
            ...(showLetter && changeType ? { color: CHANGE_INDICATORS[changeType].color } : {}),
            ...(showLetter && changeType === 'deleted' ? { textDecoration: 'line-through' } : {}),
          }}
        >
          {renderName(node.name, filterQuery)}
        </span>
      )}
      {!isRenaming && indicator && (
        showLetter ? (
          <span style={{ ...treeStyles.indicator, color: indicator.color }} title={changeType ?? undefined}>
            {indicator.label}
          </span>
        ) : (
          <span
            style={{ ...treeStyles.indicator, ...treeStyles.indicatorBranchOnly }}
            title={changeType ? `${changeType} on this branch (clean in worktree)` : undefined}
          >
            {'○'}
          </span>
        )
      )}
      {/* A folder says what is under it, so a change stays findable while the
          folder is collapsed. Never a letter: the folder itself isn't changed. */}
      {!isRenaming && !indicator && subtreeChange && (
        <span
          style={{
            ...treeStyles.indicator,
            ...(subtreeChange.worktreeDirty ? treeStyles.indicatorSubtree : treeStyles.indicatorBranchOnly),
          }}
          title={`${subtreeChange.count} changed file${subtreeChange.count === 1 ? '' : 's'} inside`}
        >
          {subtreeChange.worktreeDirty ? '●' : '○'}
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

export function CreateInput({
  depth,
  creating,
  createName,
  createError,
  onCreateNameChange,
  onKeyDown,
  onConfirmCreate,
  onCancelCreate,
}: {
  depth: number
  creating: { type: 'file' | 'directory' }
  createName?: string
  createError?: string | null
  onCreateNameChange?: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onConfirmCreate?: () => void
  onCancelCreate?: () => void
}): React.JSX.Element {
  const handleBlur = useCallback((): void => {
    if (createName?.trim()) {
      onConfirmCreate?.()
    } else {
      onCancelCreate?.()
    }
  }, [createName, onConfirmCreate, onCancelCreate])

  return (
    <div style={{ paddingLeft: `${depth * 8 + 4}px` }}>
      <div style={{ ...treeStyles.node }}>
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flexShrink: 0 }}>
          {creating.type === 'file' ? '\uD83D\uDCC4' : '\uD83D\uDCC1'}
        </span>
        <input
          autoFocus
          value={createName ?? ''}
          onChange={(e) => onCreateNameChange?.(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={handleBlur}
          onClick={(e) => e.stopPropagation()}
          style={{
            ...treeStyles.renameInput,
            ...(createError ? { borderColor: 'var(--error)' } : {}),
          }}
          placeholder={creating.type === 'file' ? 'filename' : 'folder name'}
        />
      </div>
      {createError && (
        <div style={{ fontSize: '11px', color: 'var(--error)', paddingLeft: '22px', lineHeight: '18px' }}>
          {createError}
        </div>
      )}
    </div>
  )
}

export function sortChildren(children: FileTreeNode[]): FileTreeNode[] {
  return [...children].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })
}
