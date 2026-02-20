import { useState, useCallback, useEffect, useRef } from 'react'
import type { FileTreeNode, SessionViewState } from '../../shared/types'
import type { OpenFile } from './useCodeView'

interface UseViewStateResult {
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  restoreCodeView: {
    openFiles: OpenFile[]
    activeFilePath: string | null
    codeViewMode: 'diff' | 'file'
  } | null
  saveCurrentState: (
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

  const saveCurrentState = useCallback(
    (openFiles: OpenFile[], activeFilePath: string | null, codeViewMode: 'diff' | 'file'): void => {
      const sessionId = prevSessionIdRef.current
      if (!sessionId) return

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
      setRestoreCodeView(null)
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
          // No saved state
          setExpandedPaths(new Set())
          setRestoreCodeView(null)
        }
      } catch {
        setExpandedPaths(new Set())
        setRestoreCodeView(null)
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
    restoreCodeView,
    saveCurrentState,
  }
}
