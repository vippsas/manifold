import { useState, useCallback, useRef } from 'react'

export interface OpenFile {
  path: string
  content: string
}

export interface UseCodeViewResult {
  openFiles: OpenFile[]
  activeFilePath: string | null
  activeFileContent: string | null
  handleSelectFile: (filePath: string) => void
  handleCloseFile: (filePath: string) => void
  handleSaveFile: (content: string) => void
  handleRenameOpenFile: (oldPath: string, newPath: string) => void
  refreshOpenFiles: () => Promise<void>
  restoreState: (openFiles: OpenFile[], activeFilePath: string | null) => void
}

export function useCodeView(activeSessionId: string | null): UseCodeViewResult {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)

  // Keep a ref so save always targets the current active file
  const activeFilePathRef = useRef<string | null>(null)
  activeFilePathRef.current = activeFilePath

  const activeFile = openFiles.find((f) => f.path === activeFilePath) ?? null

  const handleSelectFile = useCallback(
    (filePath: string): void => {
      if (!activeSessionId) return

      // If already open, just switch to it
      const existing = openFiles.find((f) => f.path === filePath)
      if (existing) {
        setActiveFilePath(filePath)
        return
      }

      void (async (): Promise<void> => {
        try {
          const content = (await window.electronAPI.invoke(
            'files:read',
            activeSessionId,
            filePath
          )) as string
          setOpenFiles((prev) => [...prev, { path: filePath, content }])
          setActiveFilePath(filePath)
        } catch {
          // Read failed — don't open the tab
        }
      })()
    },
    [activeSessionId, openFiles]
  )

  const handleCloseFile = useCallback(
    (filePath: string): void => {
      setOpenFiles((prev) => {
        const next = prev.filter((f) => f.path !== filePath)

        // If we closed the active tab, switch to an adjacent one
        if (activeFilePathRef.current === filePath) {
          const closedIdx = prev.findIndex((f) => f.path === filePath)
          if (next.length > 0) {
            const newIdx = Math.min(closedIdx, next.length - 1)
            setActiveFilePath(next[newIdx].path)
          } else {
            setActiveFilePath(null)
          }
        }

        return next
      })
    },
    []
  )

  const handleSaveFile = useCallback(
    (content: string): void => {
      const path = activeFilePathRef.current
      if (!activeSessionId || !path) return

      // Update cached content immediately
      setOpenFiles((prev) =>
        prev.map((f) => (f.path === path ? { ...f, content } : f))
      )

      void (async (): Promise<void> => {
        try {
          await window.electronAPI.invoke('files:write', activeSessionId, path, content)
        } catch {
          // Save failed silently
        }
      })()
    },
    [activeSessionId]
  )

  const handleRenameOpenFile = useCallback(
    (oldPath: string, newPath: string): void => {
      setOpenFiles((prev) =>
        prev.map((f) => {
          if (f.path === oldPath) {
            return { ...f, path: newPath }
          }
          // Directory rename: update child paths
          const oldPrefix = oldPath + '/'
          if (f.path.startsWith(oldPrefix)) {
            return { ...f, path: newPath + '/' + f.path.slice(oldPrefix.length) }
          }
          return f
        })
      )
      setActiveFilePath((prev) => {
        if (!prev) return prev
        if (prev === oldPath) return newPath
        const oldPrefix = oldPath + '/'
        if (prev.startsWith(oldPrefix)) {
          return newPath + '/' + prev.slice(oldPrefix.length)
        }
        return prev
      })
    },
    []
  )

  const openFilesRef = useRef<OpenFile[]>([])
  openFilesRef.current = openFiles

  const refreshOpenFiles = useCallback(async (): Promise<void> => {
    if (!activeSessionId) return
    const currentFiles = openFilesRef.current
    if (currentFiles.length === 0) return

    const updates = await Promise.all(
      currentFiles.map(async (file) => {
        try {
          const content = (await window.electronAPI.invoke(
            'files:read',
            activeSessionId,
            file.path
          )) as string
          return { path: file.path, content }
        } catch {
          return file
        }
      })
    )
    setOpenFiles(updates)
  }, [activeSessionId])

  const restoreState = useCallback(
    (files: OpenFile[], filePath: string | null): void => {
      setOpenFiles(files)
      setActiveFilePath(filePath)
    },
    []
  )

  return {
    openFiles,
    activeFilePath,
    activeFileContent: activeFile?.content ?? null,
    handleSelectFile,
    handleCloseFile,
    handleSaveFile,
    handleRenameOpenFile,
    refreshOpenFiles,
    restoreState,
  }
}
