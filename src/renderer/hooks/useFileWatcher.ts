import { useState, useCallback, useEffect, useRef } from 'react'
import type { FileTreeNode, FileChange } from '../../shared/types'
import { useIpcListener } from './useIpc'

interface UseFileWatcherResult {
  tree: FileTreeNode | null
  changes: FileChange[]
  loading: boolean
  error: string | null
  refreshTree: () => Promise<void>
  readFile: (filePath: string) => Promise<string | null>
  deleteFile: (filePath: string) => Promise<boolean>
  renameFile: (oldPath: string, newPath: string) => Promise<boolean>
  createFile: (dirPath: string, fileName: string) => Promise<boolean>
  createDir: (dirPath: string, dirName: string) => Promise<boolean>
  revealInFinder: (filePath: string) => Promise<void>
  openInTerminal: (dirPath: string) => Promise<void>
}

export function useFileWatcher(
  sessionId: string | null,
  onFilesChanged?: () => void
): UseFileWatcherResult {
  const onFilesChangedRef = useRef(onFilesChanged)
  onFilesChangedRef.current = onFilesChanged
  const [tree, setTree] = useState<FileTreeNode | null>(null)
  const [changes, setChanges] = useState<FileChange[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshTree = useCallback(async (): Promise<void> => {
    if (!sessionId) return
    setLoading(true)
    setError(null)
    try {
      const result = (await window.electronAPI.invoke('files:tree', sessionId)) as FileTreeNode
      setTree(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    if (sessionId) {
      void refreshTree()
    } else {
      setTree(null)
      setChanges([])
    }
  }, [sessionId, refreshTree])

  useIpcListener<{ sessionId: string; changes: FileChange[] }>(
    'files:changed',
    useCallback(
      (event) => {
        if (event.sessionId === sessionId) {
          setChanges(event.changes)
          void refreshTree()
          onFilesChangedRef.current?.()
        }
      },
      [sessionId, refreshTree]
    )
  )

  const readFile = useCallback(
    async (filePath: string): Promise<string | null> => {
      if (!sessionId) return null
      try {
        const content = (await window.electronAPI.invoke(
          'files:read',
          sessionId,
          filePath
        )) as string
        return content
      } catch {
        return null
      }
    },
    [sessionId]
  )

  const deleteFile = useCallback(
    async (filePath: string): Promise<boolean> => {
      if (!sessionId) return false
      try {
        const result = (await window.electronAPI.invoke('files:delete', sessionId, filePath)) as
          | { tree: FileTreeNode }
          | undefined
        if (result?.tree) setTree(result.tree)
        return true
      } catch {
        return false
      }
    },
    [sessionId]
  )

  const renameFile = useCallback(
    async (oldPath: string, newPath: string): Promise<boolean> => {
      if (!sessionId) return false
      try {
        const result = (await window.electronAPI.invoke('files:rename', sessionId, oldPath, newPath)) as
          | { tree: FileTreeNode }
          | undefined
        if (result?.tree) setTree(result.tree)
        return true
      } catch {
        return false
      }
    },
    [sessionId]
  )

  const createFile = useCallback(
    async (dirPath: string, fileName: string): Promise<boolean> => {
      if (!sessionId) return false
      try {
        const result = (await window.electronAPI.invoke('files:create-file', sessionId, dirPath, fileName)) as
          | { tree: FileTreeNode }
          | undefined
        if (result?.tree) setTree(result.tree)
        return true
      } catch {
        return false
      }
    },
    [sessionId]
  )

  const createDir = useCallback(
    async (dirPath: string, dirName: string): Promise<boolean> => {
      if (!sessionId) return false
      try {
        const result = (await window.electronAPI.invoke('files:create-dir', sessionId, dirPath, dirName)) as
          | { tree: FileTreeNode }
          | undefined
        if (result?.tree) setTree(result.tree)
        return true
      } catch {
        return false
      }
    },
    [sessionId]
  )

  const revealInFinder = useCallback(
    async (filePath: string): Promise<void> => {
      if (!sessionId) return
      await window.electronAPI.invoke('files:reveal', sessionId, filePath)
    },
    [sessionId]
  )

  const openInTerminal = useCallback(
    async (dirPath: string): Promise<void> => {
      if (!sessionId) return
      await window.electronAPI.invoke('files:open-terminal', sessionId, dirPath)
    },
    [sessionId]
  )

  return {
    tree,
    changes,
    loading,
    error,
    refreshTree,
    readFile,
    deleteFile,
    renameFile,
    createFile,
    createDir,
    revealInFinder,
    openInTerminal,
  }
}
