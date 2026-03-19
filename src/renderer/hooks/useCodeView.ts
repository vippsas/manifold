import { useState, useCallback, useRef, useMemo } from 'react'
import type { EditorPaneState } from './editor-pane-utils'
import {
  DEFAULT_EDITOR_PANE_ID,
  collectOpenFilePaths,
  createEditorPaneState,
  ensureEditorPane,
  findPaneContainingFile,
  normalizeEditorPanes,
  resolveActiveEditorPaneId,
} from './editor-pane-utils'

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

  const handleSelectFile = useCallback(
    (filePath: string, preferredPaneId?: string | null): string => {
      const targetPaneId = preferredPaneId ?? activeEditorPaneIdRef.current ?? DEFAULT_EDITOR_PANE_ID

      setEditorPanes((prev) => ensureEditorPane(prev, targetPaneId))
      setActiveEditorPaneId(targetPaneId)

      if (!activeSessionId) {
        return targetPaneId
      }

      const targetPane = editorPanesRef.current.find((pane) => pane.id === targetPaneId) ?? null
      if (targetPane?.openFilePaths.includes(filePath)) {
        setEditorPanes((prev) =>
          prev.map((pane) =>
            pane.id === targetPaneId
              ? { ...pane, activeFilePath: filePath }
              : pane,
          ),
        )
        return targetPaneId
      }

      if (!preferredPaneId) {
        const existingPane = findPaneContainingFile(editorPanesRef.current, filePath)
        if (existingPane) {
          setEditorPanes((prev) =>
            prev.map((pane) =>
              pane.id === existingPane.id
                ? { ...pane, activeFilePath: filePath }
                : pane,
            ),
          )
          setActiveEditorPaneId(existingPane.id)
          return existingPane.id
        }
      }

      const existingFile = openFilesRef.current.find((file) => file.path === filePath)
      if (existingFile) {
        setEditorPanes((prev) =>
          prev.map((pane) => {
            if (pane.id !== targetPaneId) return pane
            if (pane.openFilePaths.includes(filePath)) {
              return { ...pane, activeFilePath: filePath }
            }
            return {
              ...pane,
              openFilePaths: [...pane.openFilePaths, filePath],
              activeFilePath: filePath,
            }
          })
        )
        return targetPaneId
      }

      void (async (): Promise<void> => {
        try {
          const content = (await window.electronAPI.invoke(
            'files:read',
            activeSessionId,
            filePath,
          )) as string

          setOpenFiles((prev) => upsertOpenFile(prev, createOpenFile(filePath, content)))
          setEditorPanes((prev) => {
            const next = ensureEditorPane(prev, targetPaneId)
            return next.map((pane) => {
              if (pane.id !== targetPaneId) return pane
              if (pane.openFilePaths.includes(filePath)) {
                return { ...pane, activeFilePath: filePath }
              }
              return {
                ...pane,
                openFilePaths: [...pane.openFilePaths, filePath],
                activeFilePath: filePath,
              }
            })
          })
        } catch {
          // Read failed — don't open the tab
        }
      })()

      return targetPaneId
    },
    [activeSessionId],
  )

  const handleCloseFile = useCallback((filePath: string, paneId?: string | null): void => {
    setEditorPanes((prev) => {
      const next = prev.map((pane) => {
        if (paneId && pane.id !== paneId) return pane
        if (!pane.openFilePaths.includes(filePath)) return pane
        return closeFileInPane(pane, filePath)
      })

      setOpenFiles((currentFiles) => pruneUnusedOpenFiles(currentFiles, next))
      return next
    })
  }, [])

  const handleSaveFile = useCallback(
    (filePath: string, content: string): void => {
      if (!activeSessionId || !filePath) return

      setOpenFiles((prev) =>
        prev.map((file) => (file.path === filePath ? { ...file, content } : file)),
      )

      void (async (): Promise<void> => {
        try {
          await window.electronAPI.invoke('files:write', activeSessionId, filePath, content)
        } catch {
          // Save failed silently
        }
      })()
    },
    [activeSessionId],
  )

  const handleRenameOpenFile = useCallback((oldPath: string, newPath: string): void => {
    setOpenFiles((prev) =>
      prev.map((file) => {
        if (file.path === oldPath) {
          return { ...file, path: newPath }
        }

        const oldPrefix = oldPath + '/'
        if (file.path.startsWith(oldPrefix)) {
          return { ...file, path: newPath + '/' + file.path.slice(oldPrefix.length) }
        }

        return file
      }),
    )

    setEditorPanes((prev) =>
      prev.map((pane) => {
        const openFilePaths = dedupePaths(
          pane.openFilePaths.map((path) => renamePath(path, oldPath, newPath)),
        )
        return {
          ...pane,
          openFilePaths,
          activeFilePath: renamePath(pane.activeFilePath, oldPath, newPath),
        }
      }),
    )
  }, [])

  const refreshOpenFiles = useCallback(async (): Promise<void> => {
    if (!activeSessionId) return
    const currentFiles = openFilesRef.current
    const openFilePaths = new Set(collectOpenFilePaths(editorPanesRef.current))
    if (currentFiles.length === 0 || openFilePaths.size === 0) return

    const updates = await Promise.all(
      currentFiles
        .filter((file) => openFilePaths.has(file.path))
        .map(async (file) => {
          try {
            const content = (await window.electronAPI.invoke(
              'files:read',
              activeSessionId,
              file.path,
            )) as string
            if (content === file.content) return file
            return {
              ...file,
              content,
              refreshVersion: file.refreshVersion + 1,
            }
          } catch {
            return file
          }
        }),
    )

    setOpenFiles(updates)
  }, [activeSessionId])

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
      setOpenFiles((currentFiles) => pruneUnusedOpenFiles(currentFiles, next))

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
          return {
            ...pane,
            openFilePaths,
            activeFilePath,
          }
        }

        if (pane.id === targetPaneId) {
          const openFilePaths = pane.openFilePaths.includes(filePath)
            ? pane.openFilePaths
            : [...pane.openFilePaths, filePath]
          return {
            ...pane,
            openFilePaths,
            activeFilePath: filePath,
          }
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
    handleSelectFile,
    handleCloseFile,
    handleSaveFile,
    handleRenameOpenFile,
    refreshOpenFiles,
    restoreState,
    createPane,
    registerPane,
    removePane,
    setActivePane,
    moveFileToPane,
  }
}

function createOpenFile(path: string, content: string): OpenFile {
  return {
    path,
    content,
    refreshVersion: 0,
  }
}

function normalizeOpenFile(file: OpenFile): OpenFile {
  return {
    ...file,
    refreshVersion: file.refreshVersion ?? 0,
  }
}

function upsertOpenFile(files: OpenFile[], nextFile: OpenFile): OpenFile[] {
  const existingIndex = files.findIndex((file) => file.path === nextFile.path)
  if (existingIndex === -1) return [...files, nextFile]

  const next = [...files]
  next[existingIndex] = nextFile
  return next
}

function pruneUnusedOpenFiles(files: OpenFile[], panes: EditorPaneState[]): OpenFile[] {
  const openFilePaths = new Set(collectOpenFilePaths(panes))
  return files.filter((file) => openFilePaths.has(file.path))
}

function closeFileInPane(pane: EditorPaneState, filePath: string): EditorPaneState {
  const openFilePaths = pane.openFilePaths.filter((path) => path !== filePath)
  const closedIndex = pane.openFilePaths.indexOf(filePath)
  const activeFilePath = pane.activeFilePath === filePath
    ? (openFilePaths[Math.min(closedIndex, openFilePaths.length - 1)] ?? null)
    : pane.activeFilePath

  return {
    ...pane,
    openFilePaths,
    activeFilePath,
  }
}

function dedupePaths(paths: string[]): string[] {
  return Array.from(new Set(paths))
}

function renamePath(
  path: string | null,
  oldPath: string,
  newPath: string,
): string | null {
  if (!path) return path
  if (path === oldPath) return newPath

  const oldPrefix = oldPath + '/'
  if (path.startsWith(oldPrefix)) {
    return newPath + '/' + path.slice(oldPrefix.length)
  }

  return path
}
