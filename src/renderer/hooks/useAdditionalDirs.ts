import { useState, useEffect, useCallback } from 'react'
import type { FileTreeNode } from '../../shared/types'

interface UseAdditionalDirsResult {
  additionalDirs: string[]
  additionalTrees: Map<string, FileTreeNode>
  additionalBranches: Map<string, string | null>
  refreshTree: (dirPath: string) => Promise<void>
}

export function useAdditionalDirs(activeSessionId: string | null, initialDirs: string[] = []): UseAdditionalDirsResult {
  const [additionalDirs, setAdditionalDirs] = useState<string[]>([])
  const [additionalTrees, setAdditionalTrees] = useState<Map<string, FileTreeNode>>(new Map())
  const [additionalBranches, setAdditionalBranches] = useState<Map<string, string | null>>(new Map())

  // Seed from the already-fetched session data (avoids a redundant global discovery call)
  useEffect(() => {
    if (!activeSessionId) {
      setAdditionalDirs([])
      setAdditionalTrees(new Map())
      setAdditionalBranches(new Map())
      return
    }

    if (initialDirs.length > 0) {
      setAdditionalDirs(initialDirs)
      for (const dir of initialDirs) {
        fetchTree(activeSessionId, dir)
        fetchBranch(activeSessionId, dir)
      }
    }
  }, [activeSessionId, initialDirs.join(',')])

  // Listen for new dirs added
  useEffect(() => {
    if (!activeSessionId) return

    const unsub = window.electronAPI.on('agent:dirs-changed', (payload: unknown) => {
      const { sessionId, additionalDirs: dirs } = payload as {
        sessionId: string
        additionalDirs: string[]
      }
      if (sessionId !== activeSessionId) return
      setAdditionalDirs(dirs)

      for (const dir of dirs) {
        fetchTree(activeSessionId, dir)
        fetchBranch(activeSessionId, dir)
      }
    })

    return unsub
  }, [activeSessionId])

  // Refresh trees on files:changed with source
  useEffect(() => {
    if (!activeSessionId || additionalDirs.length === 0) return

    const unsub = window.electronAPI.on('files:changed', (payload: unknown) => {
      const { sessionId, source } = payload as { sessionId: string; source?: string }
      if (sessionId !== activeSessionId || !source) return
      if (additionalDirs.includes(source)) {
        fetchTree(activeSessionId, source)
      }
    })

    return unsub
  }, [activeSessionId, additionalDirs])

  function fetchTree(sessionId: string, dirPath: string): void {
    window.electronAPI.invoke('files:tree-dir', sessionId, dirPath).then((tree) => {
      setAdditionalTrees((prev) => {
        const next = new Map(prev)
        next.set(dirPath, tree as FileTreeNode)
        return next
      })
    }).catch(() => {})
  }

  function fetchBranch(sessionId: string, dirPath: string): void {
    window.electronAPI.invoke('files:dir-branch', sessionId, dirPath).then((branch) => {
      setAdditionalBranches((prev) => {
        const next = new Map(prev)
        next.set(dirPath, branch as string | null)
        return next
      })
    }).catch(() => {})
  }

  const refreshTree = useCallback(async (dirPath: string) => {
    if (!activeSessionId) return
    fetchTree(activeSessionId, dirPath)
  }, [activeSessionId])

  return { additionalDirs, additionalTrees, additionalBranches, refreshTree }
}
