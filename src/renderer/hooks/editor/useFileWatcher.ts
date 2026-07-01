import { useState, useCallback, useEffect, useRef } from 'react'
import type { FileTreeNode, FileChange } from '../../../shared/types'
import { useIpcListener } from '../app/useIpc'

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
  importPaths: (dirPath: string, sourcePaths: string[]) => Promise<string | null>
  pasteImage: (dirPath: string, dataUrl: string) => Promise<string | null>
  pasteClipboardImage: (dirPath: string) => Promise<{ pasted: boolean; error: string | null }>
  movePath: (sourcePath: string, targetDir: string, overwrite?: boolean) => Promise<string | null>
  revealInFinder: (filePath: string) => Promise<void>
  openInTerminal: (dirPath: string) => Promise<void>
}

export function useFileWatcher(
  sessionId: string | null,
  onFilesChanged?: () => void,
  fallbackProjectId?: string | null,
): UseFileWatcherResult {
  const onFilesChangedRef = useRef(onFilesChanged)
  onFilesChangedRef.current = onFilesChanged
  const [tree, setTree] = useState<FileTreeNode | null>(null)
  const [changes, setChanges] = useState<FileChange[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshTree = useCallback(async (): Promise<void> => {
    if (!sessionId && !fallbackProjectId) return
    setLoading(true)
    setError(null)
    try {
      const result = (await (
        sessionId
          ? window.electronAPI.invoke('files:tree', sessionId)
          : window.electronAPI.invoke('files:tree-by-project', fallbackProjectId)
      )) as FileTreeNode
      setTree(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [sessionId, fallbackProjectId])

  useEffect(() => {
    if (sessionId) {
      void refreshTree()
      return
    }
    setChanges([])
    if (!fallbackProjectId) {
      setTree(null)
      return
    }
    setLoading(true)
    setError(null)
    let cancelled = false
    void window.electronAPI.invoke('files:tree-by-project', fallbackProjectId)
      .then((result) => { if (!cancelled) setTree(result as FileTreeNode) })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionId, fallbackProjectId, refreshTree])

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

  useIpcListener<{ sessionId: string; source?: string }>(
    'files:tree-changed',
    useCallback(
      (event) => {
        if (event.sessionId !== sessionId) return
        void refreshTree()
        onFilesChangedRef.current?.()
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

  const movePath = useCallback(
    async (sourcePath: string, targetDir: string, overwrite?: boolean): Promise<string | null> => {
      if (!sessionId) return 'No active session'
      const baseName = sourcePath.slice(sourcePath.lastIndexOf('/') + 1)
      const newPath = targetDir === '/' ? `/${baseName}` : `${targetDir}/${baseName}`
      try {
        if (overwrite) {
          try {
            await window.electronAPI.invoke('files:delete', sessionId, newPath)
          } catch {
            // Target may not exist (race) — proceed to rename
          }
        }
        const result = (await window.electronAPI.invoke('files:rename', sessionId, sourcePath, newPath)) as
          | { tree: FileTreeNode }
          | undefined
        if (result?.tree) setTree(result.tree)
        return null
      } catch (err: unknown) {
        return err instanceof Error ? err.message : String(err)
      }
    },
    [sessionId]
  )

  const importPaths = useCallback(
    async (dirPath: string, sourcePaths: string[]): Promise<string | null> => {
      if (!sessionId) return 'No active session'
      try {
        const result = (await window.electronAPI.invoke('files:import', sessionId, dirPath, sourcePaths)) as
          | { tree: FileTreeNode }
          | undefined
        if (result?.tree) setTree(result.tree)
        return null
      } catch (err: unknown) {
        return err instanceof Error ? err.message : String(err)
      }
    },
    [sessionId]
  )

  const pasteImage = useCallback(
    async (dirPath: string, dataUrl: string): Promise<string | null> => {
      if (!sessionId) return 'No active session'
      try {
        const result = (await window.electronAPI.invoke('files:paste-image', sessionId, dirPath, dataUrl)) as
          | { tree: FileTreeNode }
          | undefined
        if (result?.tree) setTree(result.tree)
        return null
      } catch (err: unknown) {
        return err instanceof Error ? err.message : String(err)
      }
    },
    [sessionId]
  )

  const pasteClipboardImage = useCallback(
    async (dirPath: string): Promise<{ pasted: boolean; error: string | null }> => {
      if (!sessionId) return { pasted: false, error: 'No active session' }
      try {
        const result = (await window.electronAPI.invoke('files:paste-clipboard-image', sessionId, dirPath)) as
          | { pasted: boolean; tree?: FileTreeNode }
          | undefined
        if (result?.tree) setTree(result.tree)
        return { pasted: Boolean(result?.pasted), error: null }
      } catch (err: unknown) {
        return { pasted: false, error: err instanceof Error ? err.message : String(err) }
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
    importPaths,
    pasteImage,
    pasteClipboardImage,
    movePath,
    revealInFinder,
    openInTerminal,
  }
}
