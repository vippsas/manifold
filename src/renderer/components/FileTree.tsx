import React, { useCallback, useMemo, useState } from 'react'
import type { FileTreeNode, FileChange, FileChangeType } from '../../shared/types'

interface FileTreeProps {
  tree: FileTreeNode | null
  changes: FileChange[]
  activeFilePath: string | null
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onSelectFile: (path: string) => void
  onDeleteFile?: (path: string) => void
  onClose?: () => void
}

const CHANGE_INDICATORS: Record<FileChangeType, { color: string; label: string }> = {
  modified: { color: 'var(--warning)', label: 'M' },
  added: { color: 'var(--success)', label: 'A' },
  deleted: { color: 'var(--error)', label: 'D' },
}

export function FileTree({
  tree,
  changes,
  activeFilePath,
  expandedPaths,
  onToggleExpand,
  onSelectFile,
  onDeleteFile,
  onClose,
}: FileTreeProps): React.JSX.Element {
  const [pendingDelete, setPendingDelete] = useState<{ path: string; name: string; isDirectory: boolean } | null>(null)
  const changeMap = useMemo(() => {
    const map = new Map<string, FileChangeType>()
    const root = tree?.path ?? ''
    for (const change of changes) {
      // Resolve relative change paths against tree root to match absolute node paths
      const absPath = root ? `${root.replace(/\/$/, '')}/${change.path}` : change.path
      map.set(absPath, change.type)
    }
    return map
  }, [changes, tree?.path])

  const handleRequestDelete = useCallback((path: string, name: string, isDirectory: boolean): void => {
    setPendingDelete({ path, name, isDirectory })
  }, [])

  const handleConfirmDelete = useCallback((): void => {
    if (pendingDelete && onDeleteFile) {
      onDeleteFile(pendingDelete.path)
    }
    setPendingDelete(null)
  }, [pendingDelete, onDeleteFile])

  const handleCancelDelete = useCallback((): void => {
    setPendingDelete(null)
  }, [])

  return (
    <div style={treeStyles.wrapper}>
      <div style={treeStyles.header}>
        <span style={treeStyles.headerTitle}>Files</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {changes.length > 0 && (
            <span style={treeStyles.changesButton}>
              {changes.length} changed
            </span>
          )}
          {onClose && (
            <button onClick={onClose} style={treeStyles.closeButton} title="Close Files">
              ×
            </button>
          )}
        </span>
      </div>
      <div style={treeStyles.treeContainer}>
        {tree ? (
          <TreeNode
            node={tree}
            depth={0}
            changeMap={changeMap}
            activeFilePath={activeFilePath}
            expandedPaths={expandedPaths}
            onToggleExpand={onToggleExpand}
            onSelectFile={onSelectFile}
            onRequestDelete={onDeleteFile ? handleRequestDelete : undefined}
          />
        ) : (
          <div style={treeStyles.empty}>No files to display</div>
        )}
      </div>

      {pendingDelete && (
        <div style={treeStyles.dialogOverlay} onClick={handleCancelDelete}>
          <div style={treeStyles.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={treeStyles.dialogTitle}>
              Delete {pendingDelete.isDirectory ? 'folder' : 'file'}
            </div>
            <div style={treeStyles.dialogMessage}>
              Are you sure you want to delete <strong>{pendingDelete.name}</strong>?
              {pendingDelete.isDirectory && ' This will delete all contents.'}
            </div>
            <div style={treeStyles.dialogActions}>
              <button style={treeStyles.dialogCancel} onClick={handleCancelDelete}>Cancel</button>
              <button style={treeStyles.dialogConfirm} onClick={handleConfirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface TreeNodeProps {
  node: FileTreeNode
  depth: number
  changeMap: Map<string, FileChangeType>
  activeFilePath: string | null
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onSelectFile: (path: string) => void
  onRequestDelete?: (path: string, name: string, isDirectory: boolean) => void
}

function TreeNode({
  node,
  depth,
  changeMap,
  activeFilePath,
  expandedPaths,
  onToggleExpand,
  onSelectFile,
  onRequestDelete,
}: TreeNodeProps): React.JSX.Element {
  const expanded = expandedPaths.has(node.path)

  const handleToggle = useCallback((): void => {
    if (node.isDirectory) {
      onToggleExpand(node.path)
    } else {
      onSelectFile(node.path)
    }
  }, [node.isDirectory, node.path, onToggleExpand, onSelectFile])

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
        changeType={changeType ?? null}
        onToggle={handleToggle}
        onDelete={onRequestDelete ? handleDelete : undefined}
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
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onSelectFile={onSelectFile}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </>
      )}
    </>
  )
}

function NodeRow({
  node,
  depth,
  expanded,
  isActive,
  changeType,
  onToggle,
  onDelete,
}: {
  node: FileTreeNode
  depth: number
  expanded: boolean
  isActive: boolean
  changeType: FileChangeType | null
  onToggle: () => void
  onDelete?: (e: React.MouseEvent) => void
}): React.JSX.Element {
  const indicator = changeType ? CHANGE_INDICATORS[changeType] : null

  return (
    <div
      className="file-tree-row"
      onClick={onToggle}
      style={{
        ...treeStyles.node,
        paddingLeft: `${depth * 16 + 8}px`,
        ...(isActive ? treeStyles.nodeActive : undefined),
      }}
      role="button"
      tabIndex={0}
      title={node.path}
    >
      {node.isDirectory && (
        <span style={treeStyles.folderIcon}>{expanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1'}</span>
      )}
      {!node.isDirectory && <span style={treeStyles.fileIcon}>{'\uD83D\uDCC4'}</span>}
      <span
        className="truncate"
        style={{ ...treeStyles.nodeName, fontWeight: node.isDirectory ? 600 : 400 }}
      >
        {node.name}
      </span>
      {indicator && (
        <span style={{ ...treeStyles.indicator, color: indicator.color }} title={changeType ?? undefined}>
          {'\u25CF'}
        </span>
      )}
      {onDelete && (
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

const treeStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  changesButton: {
    fontSize: '10px',
    color: 'var(--accent)',
    padding: '1px 6px',
    borderRadius: '8px',
    background: 'rgba(79, 195, 247, 0.12)',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    borderRadius: '3px',
    color: 'var(--text-muted)',
    fontSize: '14px',
    lineHeight: 1,
    cursor: 'pointer',
  },
  treeContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
  },
  node: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    cursor: 'pointer',
    fontSize: '12px',
    lineHeight: '20px',
    color: 'var(--text-primary)',
  },
  nodeActive: {
    background: 'rgba(79, 195, 247, 0.12)',
    color: 'var(--accent)',
  },
  folderIcon: {
    width: '16px',
    fontSize: '13px',
    flexShrink: 0,
    textAlign: 'center' as const,
  },
  fileIcon: {
    width: '16px',
    fontSize: '13px',
    flexShrink: 0,
    textAlign: 'center' as const,
  },
  nodeName: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
  },
  indicator: {
    flexShrink: 0,
    fontSize: '8px',
    marginLeft: '4px',
  },
  deleteButton: {
    flexShrink: 0,
    fontSize: '12px',
    marginLeft: '4px',
    cursor: 'pointer',
    padding: '0 2px',
    borderRadius: '3px',
  },
  dialogOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  dialog: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '16px',
    maxWidth: '300px',
    width: '90%',
  },
  dialogTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '8px',
  },
  dialogMessage: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    marginBottom: '16px',
  },
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  dialogCancel: {
    fontSize: '12px',
    padding: '4px 12px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  dialogConfirm: {
    fontSize: '12px',
    padding: '4px 12px',
    borderRadius: '4px',
    border: 'none',
    background: 'var(--error)',
    color: '#fff',
    cursor: 'pointer',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
}
