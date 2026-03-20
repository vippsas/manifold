import React, { useCallback } from 'react'
import type { FileTreeNode, FileChangeType } from '../../../shared/types'
import { getFileIconSvg } from './file-icons'
import { CHANGE_INDICATORS, treeStyles } from './FileTree.styles'

// Inline SVG chevron for directory expand/collapse
export const CHEVRON_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>'

export function NodeRow({
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
  onContextMenu,
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
  onContextMenu?: (e: React.MouseEvent) => void
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
      onContextMenu={onContextMenu}
      data-tree-path={node.path}
      data-tree-is-directory={node.isDirectory ? 'true' : 'false'}
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
        <span style={treeStyles.chevronSpacer} />
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
        <div style={{ fontSize: '11px', color: 'var(--error)', paddingLeft: '38px', lineHeight: '18px' }}>
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
