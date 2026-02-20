import { useState, useCallback, useRef } from 'react'

export type CodeViewMode = 'diff' | 'file'

export interface OpenFile {
  path: string
  content: string
}

export interface UseCodeViewResult {
  codeViewMode: CodeViewMode
  openFiles: OpenFile[]
  activeFilePath: string | null
  activeFileContent: string | null
  handleSelectFile: (filePath: string) => void
  handleCloseFile: (filePath: string) => void
  handleShowDiff: () => void
  handleSaveFile: (content: string) => void
  refreshOpenFiles: () => Promise<void>
}

export function useCodeView(activeSessionId: string | null): UseCodeViewResult {
  const [codeViewMode, setCodeViewMode] = useState<CodeViewMode>('diff')
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
        setCodeViewMode('file')
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
          setCodeViewMode('file')
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

        // If we closed the active tab, switch to an adjacent one or diff view
        if (activeFilePathRef.current === filePath) {
          const closedIdx = prev.findIndex((f) => f.path === filePath)
          if (next.length > 0) {
            const newIdx = Math.min(closedIdx, next.length - 1)
            setActiveFilePath(next[newIdx].path)
          } else {
            setActiveFilePath(null)
            setCodeViewMode('diff')
          }
        }

        return next
      })
    },
    []
  )

  const handleShowDiff = useCallback((): void => {
    setCodeViewMode('diff')
    setActiveFilePath(null)
  }, [])

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

  return {
    codeViewMode,
    openFiles,
    activeFilePath,
    activeFileContent: activeFile?.content ?? null,
    handleSelectFile,
    handleCloseFile,
    handleShowDiff,
    handleSaveFile,
    refreshOpenFiles,
  }
}
