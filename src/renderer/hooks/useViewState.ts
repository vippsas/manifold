import { useState, useCallback, useEffect, useRef } from 'react'
import type { FileTreeNode, SessionViewState } from '../../shared/types'
import type { OpenFile } from './useCodeView'

interface UseViewStateResult {
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  expandAncestors: (filePath: string) => void
  restoreCodeView: {
    openFiles: OpenFile[]
    activeFilePath: string | null
    codeViewMode: 'diff' | 'file'
  } | null
  saveCurrentState: (
    sessionId: string,
    openFiles: OpenFile[],
    activeFilePath: string | null,
    codeViewMode: 'diff' | 'file'
  ) => void
}

export function useViewState(activeSessionId: string | null, tree: FileTreeNode | null): UseViewStateResult {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [restoreCodeView, setRestoreCodeView] = useState<UseViewStateResult['restoreCodeView']>(null)
  const prevSessionIdRef = useRef<string | null>(null)
  const expandedPathsRef = useRef<Set<string>>(expandedPaths)
  expandedPathsRef.current = expandedPaths

  const onToggleExpand = useCallback((path: string): void => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const expandAncestors = useCallback((filePath: string): void => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      let dir = filePath
      // Walk up from the file's parent directory, expanding each ancestor
      while (true) {
        const parent = dir.substring(0, dir.lastIndexOf('/'))
        if (!parent || parent === dir) break
        dir = parent
        next.add(dir)
      }
      return next
    })
  }, [])

  const saveCurrentState = useCallback(
    (sessionId: string, openFiles: OpenFile[], activeFilePath: string | null, codeViewMode: 'diff' | 'file'): void => {
      const state: SessionViewState = {
        openFilePaths: openFiles.map((f) => f.path),
        activeFilePath,
        codeViewMode,
        expandedPaths: Array.from(expandedPathsRef.current),
      }

      void window.electronAPI.invoke('view-state:set', sessionId, state)
    },
    []
  )

  // On session change: load the new session's state
  useEffect(() => {
    prevSessionIdRef.current = activeSessionId

    if (!activeSessionId) {
      setExpandedPaths(new Set())
      setRestoreCodeView({ openFiles: [], activeFilePath: null, codeViewMode: 'diff' })
      return
    }

    void (async (): Promise<void> => {
      try {
        const state = (await window.electronAPI.invoke(
          'view-state:get',
          activeSessionId
        )) as SessionViewState | null

        if (state) {
          setExpandedPaths(new Set(state.expandedPaths))

          // Load file contents for restored tabs
          const openFiles: OpenFile[] = []
          for (const filePath of state.openFilePaths) {
            try {
              const content = (await window.electronAPI.invoke(
                'files:read',
                activeSessionId,
                filePath
              )) as string
              openFiles.push({ path: filePath, content })
            } catch {
              // File may have been deleted — skip it
            }
          }

          setRestoreCodeView({
            openFiles,
            activeFilePath: state.activeFilePath,
            codeViewMode: state.codeViewMode,
          })
        } else {
          // No saved state — clear tabs
          setExpandedPaths(new Set())
          setRestoreCodeView({ openFiles: [], activeFilePath: null, codeViewMode: 'diff' })
        }
      } catch {
        setExpandedPaths(new Set())
        setRestoreCodeView({ openFiles: [], activeFilePath: null, codeViewMode: 'diff' })
      }
    })()
  }, [activeSessionId])

  // Auto-expand root when tree loads for a session with no saved state
  useEffect(() => {
    if (tree && expandedPaths.size === 0) {
      setExpandedPaths(new Set([tree.path]))
    }
  }, [tree])

  return {
    expandedPaths,
    onToggleExpand,
    expandAncestors,
    restoreCodeView,
    saveCurrentState,
  }
}
