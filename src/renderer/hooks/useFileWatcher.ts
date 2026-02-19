import { useState, useCallback, useEffect } from 'react'
import type { FileTreeNode, FileChange } from '../../shared/types'
import { useIpcListener } from './useIpc'

interface UseFileWatcherResult {
  tree: FileTreeNode | null
  changes: FileChange[]
  loading: boolean
  error: string | null
  refreshTree: () => Promise<void>
  readFile: (filePath: string) => Promise<string | null>
}

export function useFileWatcher(sessionId: string | null): UseFileWatcherResult {
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

  return {
    tree,
    changes,
    loading,
    error,
    refreshTree,
    readFile,
  }
}
