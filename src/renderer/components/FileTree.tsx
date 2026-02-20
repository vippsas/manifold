import React, { useCallback, useMemo } from 'react'
import type { FileTreeNode, FileChange, FileChangeType } from '../../shared/types'

interface FileTreeProps {
  tree: FileTreeNode | null
  changes: FileChange[]
  activeFilePath: string | null
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onSelectFile: (path: string) => void
  onShowDiff: () => void
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
  onShowDiff,
}: FileTreeProps): React.JSX.Element {
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

  return (
    <div style={treeStyles.wrapper}>
      <div style={treeStyles.header}>
        <span style={treeStyles.headerTitle}>Files</span>
        {changes.length > 0 && (
          <button onClick={onShowDiff} style={treeStyles.changesButton} title="Show changes diff">
            {changes.length} changed
          </button>
        )}
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
          />
        ) : (
          <div style={treeStyles.empty}>No files to display</div>
        )}
      </div>
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
}

function TreeNode({
  node,
  depth,
  changeMap,
  activeFilePath,
  expandedPaths,
  onToggleExpand,
  onSelectFile,
}: TreeNodeProps): React.JSX.Element {
  const expanded = expandedPaths.has(node.path)

  const handleToggle = useCallback((): void => {
    if (node.isDirectory) {
      onToggleExpand(node.path)
    } else {
      onSelectFile(node.path)
    }
  }, [node.isDirectory, node.path, onToggleExpand, onSelectFile])

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
}: {
  node: FileTreeNode
  depth: number
  expanded: boolean
  isActive: boolean
  changeType: FileChangeType | null
  onToggle: () => void
}): React.JSX.Element {
  const indicator = changeType ? CHANGE_INDICATORS[changeType] : null

  return (
    <div
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
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
}
