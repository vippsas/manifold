import { useCallback, useState } from 'react'
import type React from 'react'
import type { FileTreeNode } from '../../../shared/types'
import {
  collectDroppedPaths,
  hasDraggedFiles,
  resolveDropDirectory,
  resolveDropRootPath,
  validateInternalMove,
} from './file-tree-drop'
import {
  hasInternalMoveDragData,
  readInternalMoveDragData,
} from './file-tree-drag'

export interface PendingOverwrite {
  sourcePath: string
  targetDir: string
  newPath: string
}

export interface FileTreeDragDropState {
  isDraggingFiles: boolean
  isDraggingInternal: boolean
  dropTargetPath: string | null
  importError: string | null
  pendingOverwrite: PendingOverwrite | null
  handlers: {
    onDragEnter: (e: React.DragEvent<HTMLDivElement>) => void
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  }
  confirmOverwrite: () => Promise<void>
  cancelOverwrite: () => void
}

interface UseFileTreeDragDropArgs {
  tree: FileTreeNode | null
  additionalTrees?: Map<string, FileTreeNode>
  defaultDropDir: string | null
  onImportPaths?: (dirPath: string, sourcePaths: string[]) => Promise<string | null>
  onMovePath?: (sourcePath: string, targetDir: string, options?: { overwrite?: boolean }) => Promise<string | null>
}

export function useFileTreeDragDrop({
  tree, additionalTrees, defaultDropDir, onImportPaths, onMovePath,
}: UseFileTreeDragDropArgs): FileTreeDragDropState {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [isDraggingInternal, setIsDraggingInternal] = useState(false)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite | null>(null)

  const updateDropTarget = useCallback((target: EventTarget | null): string | null => {
    const next = resolveDropDirectory(target, defaultDropDir)
    setDropTargetPath(next)
    return next
  }, [defaultDropDir])

  const clearDropState = useCallback((): void => {
    setIsDraggingFiles(false)
    setIsDraggingInternal(false)
    setDropTargetPath(null)
  }, [])

  const onDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    const internal = hasInternalMoveDragData(e.dataTransfer)
    const external = hasDraggedFiles(e.dataTransfer)
    if (!internal && !external) return
    e.preventDefault()
    setImportError(null)
    if (internal) setIsDraggingInternal(true)
    else setIsDraggingFiles(true)
    updateDropTarget(e.target)
  }, [updateDropTarget])

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    const internal = hasInternalMoveDragData(e.dataTransfer)
    const external = !internal && hasDraggedFiles(e.dataTransfer)
    if (!internal && !external) return
    e.preventDefault()
    e.dataTransfer.dropEffect = internal ? 'move' : 'copy'
    if (internal) setIsDraggingInternal(true)
    else setIsDraggingFiles(true)
    updateDropTarget(e.target)
  }, [updateDropTarget])

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    clearDropState()
  }, [clearDropState])

  const performMove = useCallback(async (e: React.DragEvent<HTMLDivElement>): Promise<boolean> => {
    const moveData = readInternalMoveDragData(e.dataTransfer)
    if (!moveData) return false
    e.preventDefault()
    const targetDir = updateDropTarget(e.target)
    const targetRoot = resolveDropRootPath(e.target)
    clearDropState()
    if (!targetDir || !onMovePath) return true
    const validation = validateInternalMove(moveData.sourcePath, moveData.rootPath, targetDir, targetRoot)
    if (!validation.ok || !validation.newPath) {
      if (validation.reason && validation.reason !== 'Already in this folder.') {
        setImportError(validation.reason)
      }
      return true
    }
    if (treeContains(tree, validation.newPath) || additionalTreesContain(additionalTrees, validation.newPath)) {
      setPendingOverwrite({ sourcePath: moveData.sourcePath, targetDir, newPath: validation.newPath })
      return true
    }
    const error = await onMovePath(moveData.sourcePath, targetDir)
    if (error) setImportError(error)
    return true
  }, [updateDropTarget, clearDropState, onMovePath, tree, additionalTrees])

  const performImport = useCallback(async (e: React.DragEvent<HTMLDivElement>): Promise<void> => {
    if (!hasDraggedFiles(e.dataTransfer)) { clearDropState(); return }
    e.preventDefault()
    const targetDir = updateDropTarget(e.target)
    clearDropState()
    if (!targetDir || !onImportPaths) return
    const sourcePaths = collectDroppedPaths(
      Array.from(e.dataTransfer.files),
      (file) => window.electronAPI.getPathForFile(file),
    )
    if (sourcePaths.length === 0) { setImportError('Could not read the dropped file paths.'); return }
    const error = await onImportPaths(targetDir, sourcePaths)
    setImportError(error)
  }, [clearDropState, updateDropTarget, onImportPaths])

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    void (async (): Promise<void> => {
      const handled = await performMove(e)
      if (!handled) await performImport(e)
    })()
  }, [performMove, performImport])

  const confirmOverwrite = useCallback(async (): Promise<void> => {
    if (!pendingOverwrite || !onMovePath) return
    const { sourcePath, targetDir } = pendingOverwrite
    setPendingOverwrite(null)
    const error = await onMovePath(sourcePath, targetDir, { overwrite: true })
    if (error) setImportError(error)
  }, [pendingOverwrite, onMovePath])

  const cancelOverwrite = useCallback((): void => {
    setPendingOverwrite(null)
  }, [])

  return {
    isDraggingFiles, isDraggingInternal, dropTargetPath, importError, pendingOverwrite,
    handlers: { onDragEnter, onDragOver, onDragLeave, onDrop },
    confirmOverwrite, cancelOverwrite,
  }
}

function treeContains(node: FileTreeNode | null, path: string): boolean {
  if (!node) return false
  if (node.path === path) return true
  if (!node.children || !path.startsWith(`${node.path}/`)) return false
  for (const child of node.children) {
    if (treeContains(child, path)) return true
  }
  return false
}

function additionalTreesContain(trees: Map<string, FileTreeNode> | undefined, path: string): boolean {
  if (!trees) return false
  for (const [, tree] of trees) {
    if (treeContains(tree, path)) return true
  }
  return false
}
