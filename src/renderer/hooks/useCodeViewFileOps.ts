import { useCallback, useRef } from 'react'
import type { EditorPaneState } from './editor-pane-utils'
import {
  closeFileInPane,
  collectOpenFilePaths,
  dedupePaths,
  ensureEditorPane,
  findPaneContainingFile,
  renamePath,
} from './editor-pane-utils'
import type { OpenFile } from './useCodeView'

export interface CodeViewFileOps {
  handleSelectFile: (filePath: string, preferredPaneId?: string | null) => string
  handleCloseFile: (filePath: string, paneId?: string | null) => void
  handleSaveFile: (filePath: string, content: string) => void
  handleRenameOpenFile: (oldPath: string, newPath: string) => void
  refreshOpenFiles: () => Promise<void>
}

interface StateRefs {
  openFilesRef: React.MutableRefObject<OpenFile[]>
  editorPanesRef: React.MutableRefObject<EditorPaneState[]>
  activeEditorPaneIdRef: React.MutableRefObject<string | null>
}

interface StateSetters {
  setOpenFiles: React.Dispatch<React.SetStateAction<OpenFile[]>>
  setEditorPanes: React.Dispatch<React.SetStateAction<EditorPaneState[]>>
  setActiveEditorPaneId: React.Dispatch<React.SetStateAction<string | null>>
}

const DEFAULT_EDITOR_PANE_ID = 'editor'

export function useCodeViewFileOps(
  activeSessionId: string | null,
  refs: StateRefs,
  setters: StateSetters,
): CodeViewFileOps {
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId

  const handleSelectFile = useCallback(
    (filePath: string, preferredPaneId?: string | null): string => {
      const targetPaneId = preferredPaneId ?? refs.activeEditorPaneIdRef.current ?? DEFAULT_EDITOR_PANE_ID

      setters.setEditorPanes((prev) => ensureEditorPane(prev, targetPaneId))
      setters.setActiveEditorPaneId(targetPaneId)

      if (!activeSessionIdRef.current) {
        return targetPaneId
      }

      const targetPane = refs.editorPanesRef.current.find((pane) => pane.id === targetPaneId) ?? null
      if (targetPane?.openFilePaths.includes(filePath)) {
        setters.setEditorPanes((prev) =>
          prev.map((pane) =>
            pane.id === targetPaneId
              ? { ...pane, activeFilePath: filePath }
              : pane,
          ),
        )
        return targetPaneId
      }

      if (!preferredPaneId) {
        const existingPane = findPaneContainingFile(refs.editorPanesRef.current, filePath)
        if (existingPane) {
          setters.setEditorPanes((prev) =>
            prev.map((pane) =>
              pane.id === existingPane.id
                ? { ...pane, activeFilePath: filePath }
                : pane,
            ),
          )
          setters.setActiveEditorPaneId(existingPane.id)
          return existingPane.id
        }
      }

      const existingFile = refs.openFilesRef.current.find((file) => file.path === filePath)
      if (existingFile) {
        setters.setEditorPanes((prev) =>
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
            activeSessionIdRef.current,
            filePath,
          )) as string

          setters.setOpenFiles((prev) => upsertOpenFile(prev, createOpenFile(filePath, content)))
          setters.setEditorPanes((prev) => {
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
    [],
  )

  const handleCloseFile = useCallback((filePath: string, paneId?: string | null): void => {
    setters.setEditorPanes((prev) => {
      const next = prev.map((pane) => {
        if (paneId && pane.id !== paneId) return pane
        if (!pane.openFilePaths.includes(filePath)) return pane
        return closeFileInPane(pane, filePath)
      })

      setters.setOpenFiles((currentFiles) => pruneUnusedOpenFiles(currentFiles, next))
      return next
    })
  }, [])

  const handleSaveFile = useCallback(
    (filePath: string, content: string): void => {
      if (!activeSessionIdRef.current || !filePath) return

      setters.setOpenFiles((prev) =>
        prev.map((file) => (file.path === filePath ? { ...file, content } : file)),
      )

      void (async (): Promise<void> => {
        try {
          await window.electronAPI.invoke('files:write', activeSessionIdRef.current, filePath, content)
        } catch {
          // Save failed silently
        }
      })()
    },
    [],
  )

  const handleRenameOpenFile = useCallback((oldPath: string, newPath: string): void => {
    setters.setOpenFiles((prev) =>
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

    setters.setEditorPanes((prev) =>
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
    if (!activeSessionIdRef.current) return
    const currentFiles = refs.openFilesRef.current
    const openFilePaths = new Set(collectOpenFilePaths(refs.editorPanesRef.current))
    if (currentFiles.length === 0 || openFilePaths.size === 0) return

    const updates = await Promise.all(
      currentFiles
        .filter((file) => openFilePaths.has(file.path))
        .map(async (file) => {
          try {
            const content = (await window.electronAPI.invoke(
              'files:read',
              activeSessionIdRef.current,
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

    setters.setOpenFiles(updates)
  }, [])

  return {
    handleSelectFile,
    handleCloseFile,
    handleSaveFile,
    handleRenameOpenFile,
    refreshOpenFiles,
  }
}

function createOpenFile(path: string, content: string): OpenFile {
  return { path, content, refreshVersion: 0 }
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
