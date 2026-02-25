import React, { useCallback, useMemo, useState } from 'react'
import type { FileTreeNode, FileChange, FileChangeType } from '../../shared/types'
import { TreeNode } from './tree-node'
import { treeStyles } from './FileTree.styles'

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
}

function WorkspaceRootHeader({
  name,
  subtitle,
  isAdditional,
}: {
  name: string
  subtitle: string | null
  isAdditional: boolean
}): React.JSX.Element {
  return (
    <div
      style={{
        padding: '6px 8px 4px',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          color: 'var(--text-secondary)',
          letterSpacing: '0.05em',
        }}
      >
        <span>{name}</span>
        {isAdditional && (
          <span
            style={{
              fontWeight: 400,
              textTransform: 'lowercase' as const,
              color: 'var(--text-tertiary, rgba(255,255,255,0.35))',
              letterSpacing: 'normal',
            }}
          >
            external
          </span>
        )}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: 400,
            color: 'var(--text-tertiary, rgba(255,255,255,0.35))',
            marginTop: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  )
}

function shortenPath(fullPath: string): string {
  const match = fullPath.match(/^\/(?:Users|home)\/[^/]+/)
  if (match) {
    return '~' + fullPath.slice(match[0].length)
  }
  return fullPath
}

export function FileTree({
  tree,
  additionalTrees,
  additionalBranches,
  primaryBranch,
  changes,
  activeFilePath,
  openFilePaths,
  expandedPaths,
  onToggleExpand,
  onSelectFile,
  onDeleteFile,
  onRenameFile,
}: FileTreeProps): React.JSX.Element {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ path: string; name: string; isDirectory: boolean } | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
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

  const handleStartRename = useCallback((path: string, name: string): void => {
    setRenamingPath(path)
    setRenameValue(name)
  }, [])

  const handleConfirmRename = useCallback((nodePath: string, oldName: string): void => {
    const trimmed = renameValue.trim()
    if (
      !trimmed ||
      trimmed === oldName ||
      trimmed.includes('/') ||
      trimmed.includes('\0')
    ) {
      setRenamingPath(null)
      return
    }
    if (onRenameFile) {
      const parentDir = nodePath.substring(0, nodePath.length - oldName.length)
      const newPath = parentDir + trimmed
      onRenameFile(nodePath, newPath)
    }
    setRenamingPath(null)
  }, [renameValue, onRenameFile])

  const handleCancelRename = useCallback((): void => {
    setRenamingPath(null)
  }, [])

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
      <div style={treeStyles.treeContainer}>
        {tree ? (
          <>
            {additionalTrees && additionalTrees.size > 0 ? (
              <>
                <WorkspaceRootHeader name={tree.name} subtitle={primaryBranch} isAdditional={false} />
                <TreeNode node={tree} depth={0} changeMap={changeMap} activeFilePath={activeFilePath} selectedFilePath={selectedFilePath} openFilePaths={openFilePaths} expandedPaths={expandedPaths} onToggleExpand={onToggleExpand} onHighlightFile={setSelectedFilePath} onSelectFile={onSelectFile} onRequestDelete={onDeleteFile ? handleRequestDelete : undefined} renamingPath={renamingPath} renameValue={renameValue} onRenameValueChange={setRenameValue} onStartRename={onRenameFile ? handleStartRename : undefined} onConfirmRename={handleConfirmRename} onCancelRename={handleCancelRename} />
                {Array.from(additionalTrees.entries()).map(([dirPath, dirTree]) => {
                  const branch = additionalBranches?.get(dirPath)
                  const subtitle = branch ?? shortenPath(dirPath)
                  return (
                    <React.Fragment key={dirPath}>
                      <WorkspaceRootHeader name={dirTree.name} subtitle={subtitle} isAdditional={true} />
                      <TreeNode node={dirTree} depth={0} changeMap={changeMap} activeFilePath={activeFilePath} selectedFilePath={selectedFilePath} openFilePaths={openFilePaths} expandedPaths={expandedPaths} onToggleExpand={onToggleExpand} onHighlightFile={setSelectedFilePath} onSelectFile={onSelectFile} onRequestDelete={onDeleteFile ? handleRequestDelete : undefined} renamingPath={renamingPath} renameValue={renameValue} onRenameValueChange={setRenameValue} onStartRename={onRenameFile ? handleStartRename : undefined} onConfirmRename={handleConfirmRename} onCancelRename={handleCancelRename} />
                    </React.Fragment>
                  )
                })}
              </>
            ) : (
              <TreeNode node={tree} depth={0} changeMap={changeMap} activeFilePath={activeFilePath} selectedFilePath={selectedFilePath} openFilePaths={openFilePaths} expandedPaths={expandedPaths} onToggleExpand={onToggleExpand} onHighlightFile={setSelectedFilePath} onSelectFile={onSelectFile} onRequestDelete={onDeleteFile ? handleRequestDelete : undefined} renamingPath={renamingPath} renameValue={renameValue} onRenameValueChange={setRenameValue} onStartRename={onRenameFile ? handleStartRename : undefined} onConfirmRename={handleConfirmRename} onCancelRename={handleCancelRename} />
            )}
          </>
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
