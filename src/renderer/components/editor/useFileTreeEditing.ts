import { useCallback, useState } from 'react'
import type { FileTreeNode } from '../../../shared/types'

export interface FileTreeEditingState {
  selectedFilePath: string | null
  setSelectedFilePath: (path: string | null) => void
  pendingDelete: { path: string; name: string; isDirectory: boolean } | null
  renamingPath: string | null
  renameValue: string
  setRenameValue: (value: string) => void
  contextMenu: { x: number; y: number; node: FileTreeNode | null } | null
  setContextMenu: (menu: { x: number; y: number; node: FileTreeNode | null } | null) => void
  creating: { parentPath: string; type: 'file' | 'directory'; afterPath?: string } | null
  createName: string
  createError: string | null
  filterQuery: string
  setFilterQuery: (query: string) => void
  handleStartRename: (path: string, name: string) => void
  handleConfirmRename: (nodePath: string, oldName: string) => void
  handleCancelRename: () => void
  handleRequestDelete: (path: string, name: string, isDirectory: boolean) => void
  handleConfirmDelete: () => void
  handleCancelDelete: () => void
  handleContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void
  startCreating: (parentPath: string, type: 'file' | 'directory', afterPath?: string) => void
  handleConfirmCreate: () => Promise<void>
  handleCancelCreate: () => void
  handleCreateNameChange: (value: string) => void
}

export function useFileTreeEditing(
  expandedPaths: Set<string>,
  onToggleExpand: (path: string) => void,
  onRenameFile?: (oldPath: string, newPath: string) => void,
  onDeleteFile?: (path: string) => void,
  onCreateFile?: (dirPath: string, fileName: string) => Promise<boolean>,
  onCreateDir?: (dirPath: string, dirName: string) => Promise<boolean>,
): FileTreeEditingState {
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ path: string; name: string; isDirectory: boolean } | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileTreeNode | null } | null>(null)
  const [creating, setCreating] = useState<{ parentPath: string; type: 'file' | 'directory'; afterPath?: string } | null>(null)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [filterQuery, setFilterQuery] = useState('')

  const handleStartRename = useCallback((path: string, name: string): void => {
    setRenamingPath(path)
    setRenameValue(name)
  }, [])

  const handleConfirmRename = useCallback((nodePath: string, oldName: string): void => {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === oldName || trimmed.includes('/') || trimmed.includes('\0')) {
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

  const handleCreateNameChange = useCallback((value: string): void => {
    setCreateName(value)
    if (createError) setCreateError(null)
  }, [createError])

  return {
    selectedFilePath, setSelectedFilePath,
    pendingDelete,
    renamingPath, renameValue, setRenameValue,
    contextMenu, setContextMenu,
    creating, createName, createError,
    filterQuery, setFilterQuery,
    handleStartRename, handleConfirmRename, handleCancelRename,
    handleRequestDelete, handleConfirmDelete, handleCancelDelete,
    handleContextMenu,
    startCreating, handleConfirmCreate, handleCancelCreate,
    handleCreateNameChange,
  }
}
