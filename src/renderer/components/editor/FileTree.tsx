import React, { useCallback, useMemo, useState } from 'react'
import type { FileTreeNode, FileChange, FileChangeType } from '../../../shared/types'
import { TreeNode } from './tree-node'
import { ContextMenu } from './ContextMenu'
import type { ContextMenuAction } from './ContextMenu'
import { treeStyles } from './FileTree.styles'
import {
  collectDroppedPaths,
  describeDropTarget,
  hasDraggedFiles,
  resolveDropDirectory,
} from './file-tree-drop'

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
  onCreateFile?: (dirPath: string, fileName: string) => Promise<boolean>
  onCreateDir?: (dirPath: string, dirName: string) => Promise<boolean>
  onImportPaths?: (dirPath: string, sourcePaths: string[]) => Promise<string | null>
  onRevealInFinder?: (filePath: string) => Promise<void>
  onOpenInTerminal?: (dirPath: string) => Promise<void>
  onCopyAbsolutePath?: (filePath: string) => void
  onCopyRelativePath?: (filePath: string, rootPath: string) => void
  worktreeRootPath?: string
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

function filterTree(node: FileTreeNode, query: string): FileTreeNode | null {
  const lowerQuery = query.toLowerCase()
  function walk(n: FileTreeNode): FileTreeNode | null {
    if (!n.isDirectory) {
      return n.name.toLowerCase().includes(lowerQuery) ? n : null
    }
    const filteredChildren = (n.children ?? [])
      .map(walk)
      .filter((child): child is FileTreeNode => child !== null)
    if (filteredChildren.length > 0) {
      return { ...n, children: filteredChildren }
    }
    return n.name.toLowerCase().includes(lowerQuery) ? { ...n, children: [] } : null
  }
  return walk(node)
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
  onCreateFile,
  onCreateDir,
  onImportPaths,
  onRevealInFinder,
  onOpenInTerminal,
  onCopyAbsolutePath,
  onCopyRelativePath,
  worktreeRootPath,
}: FileTreeProps): React.JSX.Element {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ path: string; name: string; isDirectory: boolean } | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    node: FileTreeNode | null
  } | null>(null)
  const [creating, setCreating] = useState<{
    parentPath: string
    type: 'file' | 'directory'
    afterPath?: string
  } | null>(null)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const defaultDropDir = worktreeRootPath ?? tree?.path ?? null
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

  const filteredTree = useMemo(
    () => (tree && filterQuery ? filterTree(tree, filterQuery) : tree),
    [tree, filterQuery]
  )
  const filteredAdditionalTrees = useMemo(() => {
    if (!additionalTrees || !filterQuery) return additionalTrees
    const result = new Map<string, FileTreeNode>()
    for (const [dirPath, dirTree] of additionalTrees) {
      const filtered = filterTree(dirTree, filterQuery)
      if (filtered) result.set(dirPath, filtered)
    }
    return result
  }, [additionalTrees, filterQuery])

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

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileTreeNode): void => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

  const startCreating = useCallback((parentPath: string, type: 'file' | 'directory', afterPath?: string): void => {
    setCreating({ parentPath, type, afterPath })
    setCreateName('')
    setCreateError(null)
    if (!expandedPaths.has(parentPath)) {
      onToggleExpand(parentPath)
    }
  }, [expandedPaths, onToggleExpand])

  const handleConfirmCreate = useCallback(async (): Promise<void> => {
    if (!creating) return
    const trimmed = createName.trim()
    if (!trimmed || trimmed.includes('/') || trimmed.includes('\0')) {
      setCreating(null)
      return
    }
    let success = false
    if (creating.type === 'file' && onCreateFile) {
      success = await onCreateFile(creating.parentPath, trimmed)
    } else if (creating.type === 'directory' && onCreateDir) {
      success = await onCreateDir(creating.parentPath, trimmed)
    }
    if (success) {
      setCreating(null)
    } else {
      setCreateError(`"${trimmed}" already exists`)
    }
  }, [creating, createName, onCreateFile, onCreateDir])

  const handleCancelCreate = useCallback((): void => {
    setCreating(null)
    setCreateError(null)
  }, [])

  const updateDropTarget = useCallback((target: EventTarget | null): string | null => {
    const nextTarget = resolveDropDirectory(target, defaultDropDir)
    setDropTargetPath(nextTarget)
    return nextTarget
  }, [defaultDropDir])

  const clearDropState = useCallback((): void => {
    setIsDraggingFiles(false)
    setDropTargetPath(null)
  }, [])

  const handleCreateNameChange = useCallback((value: string): void => {
    setCreateName(value)
    if (createError) setCreateError(null)
  }, [createError])

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasDraggedFiles(e.dataTransfer)) return
    e.preventDefault()
    setImportError(null)
    setIsDraggingFiles(true)
    updateDropTarget(e.target)
  }, [updateDropTarget])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    if (!hasDraggedFiles(e.dataTransfer)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDraggingFiles(true)
    updateDropTarget(e.target)
  }, [updateDropTarget])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    clearDropState()
  }, [clearDropState])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    if (!hasDraggedFiles(e.dataTransfer)) {
      clearDropState()
      return
    }
    e.preventDefault()

    const targetDir = updateDropTarget(e.target)
    clearDropState()

    if (!targetDir || !onImportPaths) return

    const sourcePaths = collectDroppedPaths(
      Array.from(e.dataTransfer.files),
      (file) => window.electronAPI.getPathForFile(file)
    )

    if (sourcePaths.length === 0) {
      setImportError('Could not read the dropped file paths.')
      return
    }

    const error = await onImportPaths(targetDir, sourcePaths)
    setImportError(error)
  }, [clearDropState, onImportPaths, updateDropTarget])

  const buildContextMenuItems = useCallback((targetNode: FileTreeNode | null): (ContextMenuAction | 'separator')[] => {
    const items: (ContextMenuAction | 'separator')[] = []
    const rootPath = worktreeRootPath ?? tree?.path ?? ''

    if (!targetNode) {
      if (onCreateFile) items.push({ label: 'New File', action: () => startCreating(tree?.path ?? '', 'file') })
      if (onCreateDir) items.push({ label: 'New Folder', action: () => startCreating(tree?.path ?? '', 'directory') })
      return items
    }

    const isDir = targetNode.isDirectory
    const dirPath = targetNode.path.substring(0, targetNode.path.lastIndexOf('/'))
    const parentPath = dirPath
    const afterSibling = targetNode.path

    // Create operations
    if (onCreateFile) items.push({ label: 'New File', action: () => startCreating(parentPath, 'file', afterSibling) })
    if (onCreateDir) items.push({ label: 'New Folder', action: () => startCreating(parentPath, 'directory', afterSibling) })
    if (items.length > 0) items.push('separator')

    // Edit operations
    if (onRenameFile) items.push({ label: 'Rename', action: () => handleStartRename(targetNode.path, targetNode.name) })
    if (onDeleteFile) items.push({ label: 'Delete', action: () => handleRequestDelete(targetNode.path, targetNode.name, isDir) })
    items.push('separator')

    // Path operations
    if (onCopyAbsolutePath) items.push({ label: 'Copy Absolute Path', action: () => onCopyAbsolutePath(targetNode.path) })
    if (onCopyRelativePath) items.push({ label: 'Copy Relative Path', action: () => onCopyRelativePath(targetNode.path, rootPath) })
    items.push('separator')

    // System operations
    if (onRevealInFinder) items.push({ label: 'Reveal in Finder', action: () => { void onRevealInFinder(targetNode.path) } })
    if (onOpenInTerminal) {
      const termDir = isDir ? targetNode.path : dirPath
      items.push({ label: 'Open in Terminal', action: () => { void onOpenInTerminal(termDir) } })
    }

    return items
  }, [tree?.path, worktreeRootPath, onCreateFile, onCreateDir, onRenameFile, onDeleteFile, onCopyAbsolutePath, onCopyRelativePath, onRevealInFinder, onOpenInTerminal, startCreating, handleStartRename, handleRequestDelete])

  return (
    <div style={treeStyles.wrapper}>
      <div style={treeStyles.filterContainer}>
        <input
          type="text"
          style={treeStyles.filterInput}
          placeholder="Filter files..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setFilterQuery('') }}
        />
        {filterQuery && (
          <button
            style={treeStyles.filterClear}
            onClick={() => setFilterQuery('')}
            title="Clear filter"
          >
            {'\u00D7'}
          </button>
        )}
      </div>
      {(isDraggingFiles || importError) && (
        <div
          style={{
            ...treeStyles.statusBanner,
            ...(importError ? treeStyles.statusBannerError : treeStyles.statusBannerInfo),
          }}
        >
          {importError ?? `Drop to import into ${describeDropTarget(dropTargetPath ?? defaultDropDir)}`}
        </div>
      )}
      <div
        style={{
          ...treeStyles.treeContainer,
          ...(isDraggingFiles ? treeStyles.treeContainerDragActive : {}),
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setContextMenu({ x: e.clientX, y: e.clientY, node: null })
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => { void handleDrop(e) }}
      >
        {filteredTree ? (
          <>
            {filteredAdditionalTrees && filteredAdditionalTrees.size > 0 ? (
              <>
                <div data-tree-root-path={filteredTree.path}>
                  <WorkspaceRootHeader name={filteredTree.name} subtitle={primaryBranch} isAdditional={false} />
                  <TreeNode node={filteredTree} depth={0} changeMap={changeMap} activeFilePath={activeFilePath} selectedFilePath={selectedFilePath} openFilePaths={openFilePaths} expandedPaths={expandedPaths} onToggleExpand={onToggleExpand} onHighlightFile={setSelectedFilePath} onSelectFile={onSelectFile} onRequestDelete={onDeleteFile ? handleRequestDelete : undefined} renamingPath={renamingPath} renameValue={renameValue} onRenameValueChange={setRenameValue} onConfirmRename={handleConfirmRename} onCancelRename={handleCancelRename} onContextMenu={handleContextMenu} creating={creating} createName={createName} onCreateNameChange={handleCreateNameChange} createError={createError} onConfirmCreate={handleConfirmCreate} onCancelCreate={handleCancelCreate} />
                </div>
                {Array.from(filteredAdditionalTrees.entries()).map(([dirPath, dirTree]) => {
                  const branch = additionalBranches?.get(dirPath)
                  const subtitle = branch ?? shortenPath(dirPath)
                  return (
                    <div key={dirPath} data-tree-root-path={dirPath}>
                      <WorkspaceRootHeader name={dirTree.name} subtitle={subtitle} isAdditional={true} />
                      <TreeNode node={dirTree} depth={0} changeMap={changeMap} activeFilePath={activeFilePath} selectedFilePath={selectedFilePath} openFilePaths={openFilePaths} expandedPaths={expandedPaths} onToggleExpand={onToggleExpand} onHighlightFile={setSelectedFilePath} onSelectFile={onSelectFile} onRequestDelete={onDeleteFile ? handleRequestDelete : undefined} renamingPath={renamingPath} renameValue={renameValue} onRenameValueChange={setRenameValue} onConfirmRename={handleConfirmRename} onCancelRename={handleCancelRename} onContextMenu={handleContextMenu} creating={creating} createName={createName} onCreateNameChange={handleCreateNameChange} createError={createError} onConfirmCreate={handleConfirmCreate} onCancelCreate={handleCancelCreate} />
                    </div>
                  )
                })}
              </>
            ) : (
              <div data-tree-root-path={filteredTree.path}>
                <TreeNode node={filteredTree} depth={0} changeMap={changeMap} activeFilePath={activeFilePath} selectedFilePath={selectedFilePath} openFilePaths={openFilePaths} expandedPaths={expandedPaths} onToggleExpand={onToggleExpand} onHighlightFile={setSelectedFilePath} onSelectFile={onSelectFile} onRequestDelete={onDeleteFile ? handleRequestDelete : undefined} renamingPath={renamingPath} renameValue={renameValue} onRenameValueChange={setRenameValue} onConfirmRename={handleConfirmRename} onCancelRename={handleCancelRename} onContextMenu={handleContextMenu} creating={creating} createName={createName} onCreateNameChange={handleCreateNameChange} createError={createError} onConfirmCreate={handleConfirmCreate} onCancelCreate={handleCancelCreate} />
              </div>
            )}
          </>
        ) : (
          <div style={treeStyles.empty}>No files to display</div>
        )}
        {isDraggingFiles && (
          <div style={treeStyles.dropOverlay}>
            <div style={treeStyles.dropOverlayLabel}>
              {`Import to ${describeDropTarget(dropTargetPath ?? defaultDropDir)}`}
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextMenuItems(contextMenu.node)}
          onClose={() => setContextMenu(null)}
        />
      )}

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
