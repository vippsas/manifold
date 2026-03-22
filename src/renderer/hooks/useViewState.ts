import { useState, useCallback, useEffect, useRef } from 'react'
import type { FileTreeNode, SessionViewState } from '../../shared/types'
import type { RestoredCodeViewState } from './useCodeView'
import type { EditorPaneState } from './editor-pane-utils'
import {
  buildLegacyEditorPanes,
  collectOpenFilePaths,
  normalizeEditorPanes,
  resolveActiveEditorPaneId,
} from './editor-pane-utils'

interface UseViewStateResult {
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  expandAncestors: (filePath: string) => void
  restoreCodeView: RestoredCodeViewState | null
  restoredSessionId: string | null
  saveCurrentState: (
    sessionId: string,
    editorPanes: EditorPaneState[],
    activeEditorPaneId: string | null
  ) => void
}

export function useViewState(activeSessionId: string | null, tree: FileTreeNode | null): UseViewStateResult {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [restoreCodeView, setRestoreCodeView] = useState<RestoredCodeViewState | null>(null)
  const [restoredSessionId, setRestoredSessionId] = useState<string | null>(null)
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
      while (true) {
        const parent = dir.substring(0, dir.lastIndexOf('/'))
        if (!parent || parent === dir) break
        dir = parent
        next.add(dir)
      }
      return next
    })
  }, [])

  const saveCurrentState = useCallback((
    sessionId: string,
    editorPanes: EditorPaneState[],
    activeEditorPaneId: string | null,
  ): void => {
    const activePane = editorPanes.find((pane) => pane.id === activeEditorPaneId) ?? editorPanes[0] ?? null
    const state: SessionViewState = {
      openFilePaths: collectOpenFilePaths(editorPanes),
      activeFilePath: activePane?.activeFilePath ?? null,
      expandedPaths: Array.from(expandedPathsRef.current),
      editorPanes: editorPanes.map((pane) => ({
        id: pane.id,
        openFilePaths: [...pane.openFilePaths],
        activeFilePath: pane.activeFilePath,
      })),
      activeEditorPaneId,
    }

    void window.electronAPI.invoke('view-state:set', sessionId, state)
  }, [])

  useEffect(() => {
    if (!activeSessionId) {
      setExpandedPaths(new Set())
      setRestoreCodeView({
        openFiles: [],
        editorPanes: buildLegacyEditorPanes([], null),
        activeEditorPaneId: null,
      })
      setRestoredSessionId(null)
      return
    }

    let cancelled = false

    void (async (): Promise<void> => {
      try {
        const state = (await window.electronAPI.invoke(
          'view-state:get',
          activeSessionId,
        )) as SessionViewState | null

        if (!state) {
          if (cancelled) return
          setExpandedPaths(new Set())
          setRestoreCodeView({
            openFiles: [],
            editorPanes: buildLegacyEditorPanes([], null),
            activeEditorPaneId: null,
          })
          setRestoredSessionId(activeSessionId)
          return
        }

        if (cancelled) return
        setExpandedPaths(new Set(state.expandedPaths))

        const paneState = state.editorPanes && state.editorPanes.length > 0
          ? state.editorPanes
          : buildLegacyEditorPanes(state.openFilePaths, state.activeFilePath)

        const uniqueOpenFilePaths = collectOpenFilePaths(paneState)
        const openFiles = []

        for (const filePath of uniqueOpenFilePaths) {
          try {
            const content = (await window.electronAPI.invoke(
              'files:read',
              activeSessionId,
              filePath,
            )) as string
            openFiles.push({ path: filePath, content, refreshVersion: 0 })
          } catch {
            // File may have been deleted — skip it
          }
        }

        const normalizedPanes = normalizeEditorPanes(
          paneState,
          openFiles.map((file) => file.path),
        )

        setRestoreCodeView({
          openFiles,
          editorPanes: normalizedPanes,
          activeEditorPaneId: resolveActiveEditorPaneId(normalizedPanes, state.activeEditorPaneId),
        })
        setRestoredSessionId(activeSessionId)
      } catch {
        if (cancelled) return
        setExpandedPaths(new Set())
        setRestoreCodeView({
          openFiles: [],
          editorPanes: buildLegacyEditorPanes([], null),
          activeEditorPaneId: null,
        })
        setRestoredSessionId(activeSessionId)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeSessionId])

  useEffect(() => {
    if (tree && expandedPaths.size === 0) {
      setExpandedPaths(new Set([tree.path]))
    }
  }, [tree, expandedPaths.size])

  return {
    expandedPaths,
    onToggleExpand,
    expandAncestors,
    restoreCodeView,
    restoredSessionId,
    saveCurrentState,
  }
}
