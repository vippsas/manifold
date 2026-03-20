import { useState, useCallback, useRef, useMemo } from 'react'
import type { EditorPaneState } from './editor-pane-utils'
import {
  DEFAULT_EDITOR_PANE_ID,
  collectOpenFilePaths,
  createEditorPaneState,
  dedupePaths,
  ensureEditorPane,
  findPaneContainingFile,
  normalizeEditorPanes,
  resolveActiveEditorPaneId,
} from './editor-pane-utils'
import { useCodeViewFileOps } from './useCodeViewFileOps'

export interface OpenFile {
  path: string
  content: string
  refreshVersion: number
}

export interface EditorPaneView {
  id: string
  openFiles: OpenFile[]
  activeFilePath: string | null
  fileContent: string | null
}

export interface RestoredCodeViewState {
  openFiles: OpenFile[]
  editorPanes: EditorPaneState[]
  activeEditorPaneId: string | null
}

export interface UseCodeViewResult {
  openFiles: OpenFile[]
  editorPanes: EditorPaneState[]
  activeEditorPaneId: string | null
  activeFilePath: string | null
  activeFileContent: string | null
  getEditorPane: (paneId: string) => EditorPaneView
  handleSelectFile: (filePath: string, preferredPaneId?: string | null) => string
  handleCloseFile: (filePath: string, paneId?: string | null) => void
  handleSaveFile: (filePath: string, content: string) => void
  handleRenameOpenFile: (oldPath: string, newPath: string) => void
  refreshOpenFiles: () => Promise<void>
  restoreState: (state: RestoredCodeViewState) => void
  createPane: (paneId: string, referencePaneId?: string | null) => void
  registerPane: (paneId: string) => void
  removePane: (paneId: string, fallbackPaneId?: string | null) => void
  setActivePane: (paneId: string) => void
  moveFileToPane: (filePath: string, targetPaneId: string, sourcePaneId?: string | null) => void
}

export function useCodeView(activeSessionId: string | null): UseCodeViewResult {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [editorPanes, setEditorPanes] = useState<EditorPaneState[]>([createEditorPaneState()])
  const [activeEditorPaneId, setActiveEditorPaneId] = useState<string | null>(DEFAULT_EDITOR_PANE_ID)

  const openFilesRef = useRef<OpenFile[]>([])
  const editorPanesRef = useRef<EditorPaneState[]>(editorPanes)
  const activeEditorPaneIdRef = useRef<string | null>(activeEditorPaneId)
  openFilesRef.current = openFiles
  editorPanesRef.current = editorPanes
  activeEditorPaneIdRef.current = activeEditorPaneId

  const refs = { openFilesRef, editorPanesRef, activeEditorPaneIdRef }
  const setters = { setOpenFiles, setEditorPanes, setActiveEditorPaneId }

  const fileOps = useCodeViewFileOps(activeSessionId, refs, setters)

  const activePane = useMemo(() => {
    if (!activeEditorPaneId) return editorPanes[0] ?? null
    return editorPanes.find((pane) => pane.id === activeEditorPaneId) ?? editorPanes[0] ?? null
  }, [editorPanes, activeEditorPaneId])

  const activeFilePath = activePane?.activeFilePath ?? null
  const activeFileContent = openFiles.find((file) => file.path === activeFilePath)?.content ?? null

  const getEditorPane = useCallback((paneId: string): EditorPaneView => {
    const pane = editorPanesRef.current.find((candidate) => candidate.id === paneId) ?? createEditorPaneState(paneId)
    const paneOpenFiles = pane.openFilePaths
      .map((path) => openFilesRef.current.find((file) => file.path === path) ?? null)
      .filter((file): file is OpenFile => file !== null)

    return {
      id: pane.id,
      openFiles: paneOpenFiles,
      activeFilePath: pane.activeFilePath,
      fileContent: paneOpenFiles.find((file) => file.path === pane.activeFilePath)?.content ?? null,
    }
  }, [])

  const setActivePane = useCallback((paneId: string): void => {
    setEditorPanes((prev) => ensureEditorPane(prev, paneId))
    setActiveEditorPaneId(paneId)
  }, [])

  const registerPane = useCallback((paneId: string): void => {
    setEditorPanes((prev) => ensureEditorPane(prev, paneId))
  }, [])

  const createPane = useCallback((paneId: string, referencePaneId?: string | null): void => {
    setEditorPanes((prev) => ensureEditorPane(prev, paneId, referencePaneId))
  }, [])

  const restoreState = useCallback((state: RestoredCodeViewState): void => {
    const normalizedFiles = state.openFiles.map(normalizeOpenFile)
    const normalizedPanes = normalizeEditorPanes(
      state.editorPanes,
      normalizedFiles.map((file) => file.path),
    )

    setOpenFiles(normalizedFiles)
    setEditorPanes(normalizedPanes)
    setActiveEditorPaneId(resolveActiveEditorPaneId(normalizedPanes, state.activeEditorPaneId))
  }, [])

  const removePane = useCallback((paneId: string, fallbackPaneId?: string | null): void => {
    setEditorPanes((prev) => {
      const sourcePane = prev.find((pane) => pane.id === paneId)
      if (!sourcePane) return prev

      if (paneId === DEFAULT_EDITOR_PANE_ID && !fallbackPaneId) {
        return prev
      }

      const resolvedFallbackPaneId =
        fallbackPaneId && fallbackPaneId !== paneId
          ? fallbackPaneId
          : (paneId === DEFAULT_EDITOR_PANE_ID ? null : DEFAULT_EDITOR_PANE_ID)

      let next = prev

      if (resolvedFallbackPaneId) {
        next = ensureEditorPane(next, resolvedFallbackPaneId)
        next = next.map((pane) => {
          if (pane.id !== resolvedFallbackPaneId) return pane

          const openFilePaths = dedupePaths([
            ...pane.openFilePaths,
            ...sourcePane.openFilePaths,
          ])

          return {
            ...pane,
            openFilePaths,
            activeFilePath: pane.activeFilePath ?? sourcePane.activeFilePath ?? openFilePaths[0] ?? null,
          }
        })
      }

      next = next.filter((pane) => pane.id !== paneId)
      setOpenFiles((currentFiles) => {
        const allPaths = new Set(collectOpenFilePaths(next))
        return currentFiles.filter((file) => allPaths.has(file.path))
      })

      const nextActivePaneId = resolvedFallbackPaneId ?? resolveActiveEditorPaneId(next, activeEditorPaneIdRef.current)
      setActiveEditorPaneId(nextActivePaneId)
      return next.length > 0 ? next : [createEditorPaneState()]
    })
  }, [])

  const moveFileToPane = useCallback((filePath: string, targetPaneId: string, sourcePaneId?: string | null): void => {
    setEditorPanes((prev) => {
      const sourcePane = sourcePaneId
        ? prev.find((pane) => pane.id === sourcePaneId) ?? null
        : findPaneContainingFile(prev, filePath)

      if (!sourcePane || sourcePane.id === targetPaneId) {
        return ensureEditorPane(prev, targetPaneId)
      }

      const next = ensureEditorPane(prev, targetPaneId, sourcePane.id).map((pane) => {
        if (pane.id === sourcePane.id) {
          const openFilePaths = pane.openFilePaths.filter((path) => path !== filePath)
          const activeFilePath = pane.activeFilePath === filePath
            ? (openFilePaths[0] ?? null)
            : pane.activeFilePath
          return { ...pane, openFilePaths, activeFilePath }
        }

        if (pane.id === targetPaneId) {
          const openFilePaths = pane.openFilePaths.includes(filePath)
            ? pane.openFilePaths
            : [...pane.openFilePaths, filePath]
          return { ...pane, openFilePaths, activeFilePath: filePath }
        }

        return pane
      })

      setActiveEditorPaneId(targetPaneId)
      return next
    })
  }, [])

  return {
    openFiles,
    editorPanes,
    activeEditorPaneId,
    activeFilePath,
    activeFileContent,
    getEditorPane,
    handleSelectFile: fileOps.handleSelectFile,
    handleCloseFile: fileOps.handleCloseFile,
    handleSaveFile: fileOps.handleSaveFile,
    handleRenameOpenFile: fileOps.handleRenameOpenFile,
    refreshOpenFiles: fileOps.refreshOpenFiles,
    restoreState,
    createPane,
    registerPane,
    removePane,
    setActivePane,
    moveFileToPane,
  }
}

function normalizeOpenFile(file: OpenFile): OpenFile {
  return {
    ...file,
    refreshVersion: file.refreshVersion ?? 0,
  }
}
