import { useCallback } from 'react'

export interface UseFileOperationsResult {
  handleSelectFile: (filePath: string) => void
  handleDeleteFile: (filePath: string) => Promise<void>
  handleRenameFile: (oldPath: string, newPath: string) => Promise<void>
  handleCreateFile: (dirPath: string, fileName: string) => Promise<boolean>
  handleCreateDir: (dirPath: string, dirName: string) => Promise<boolean>
  handleImportPaths: (dirPath: string, sourcePaths: string[]) => Promise<string | null>
  handleRevealInFinder: (filePath: string) => Promise<void>
  handleOpenInTerminal: (dirPath: string) => Promise<void>
  handleCopyAbsolutePath: (filePath: string) => void
  handleCopyRelativePath: (filePath: string, rootPath: string) => void
}

export function useFileOperations(
  expandAncestors: (filePath: string) => void,
  codeViewSelectFile: (filePath: string) => void,
  codeViewCloseFile: (filePath: string) => void,
  codeViewRenameOpenFile: (oldPath: string, newPath: string) => void,
  ensureEditorVisible: () => void,
  deleteFile: (filePath: string) => Promise<boolean>,
  renameFile: (oldPath: string, newPath: string) => Promise<boolean>,
  createFile: (dirPath: string, fileName: string) => Promise<boolean>,
  createDir: (dirPath: string, dirName: string) => Promise<boolean>,
  importPaths: (dirPath: string, sourcePaths: string[]) => Promise<string | null>,
  revealInFinder: (filePath: string) => Promise<void>,
  openInTerminal: (dirPath: string) => Promise<void>
): UseFileOperationsResult {
  const handleSelectFile = useCallback(
    (filePath: string): void => {
      expandAncestors(filePath)
      codeViewSelectFile(filePath)
      ensureEditorVisible()
    },
    [expandAncestors, codeViewSelectFile, ensureEditorVisible]
  )

  const handleDeleteFile = useCallback(
    async (filePath: string): Promise<void> => {
      const success = await deleteFile(filePath)
      if (success) {
        codeViewCloseFile(filePath)
      }
    },
    [deleteFile, codeViewCloseFile]
  )

  const handleRenameFile = useCallback(
    async (oldPath: string, newPath: string): Promise<void> => {
      const success = await renameFile(oldPath, newPath)
      if (success) {
        codeViewRenameOpenFile(oldPath, newPath)
      }
    },
    [renameFile, codeViewRenameOpenFile]
  )

  const handleCreateFile = useCallback(
    async (dirPath: string, fileName: string): Promise<boolean> => {
      return createFile(dirPath, fileName)
    },
    [createFile]
  )

  const handleCreateDir = useCallback(
    async (dirPath: string, dirName: string): Promise<boolean> => {
      return createDir(dirPath, dirName)
    },
    [createDir]
  )

  const handleImportPaths = useCallback(
    async (dirPath: string, sourcePaths: string[]): Promise<string | null> => {
      return importPaths(dirPath, sourcePaths)
    },
    [importPaths]
  )

  const handleRevealInFinder = useCallback(
    async (filePath: string): Promise<void> => {
      await revealInFinder(filePath)
    },
    [revealInFinder]
  )

  const handleOpenInTerminal = useCallback(
    async (dirPath: string): Promise<void> => {
      await openInTerminal(dirPath)
    },
    [openInTerminal]
  )

  const handleCopyAbsolutePath = useCallback((filePath: string): void => {
    void navigator.clipboard.writeText(filePath)
  }, [])

  const handleCopyRelativePath = useCallback((filePath: string, rootPath: string): void => {
    const relative = filePath.startsWith(rootPath)
      ? filePath.slice(rootPath.length).replace(/^\//, '')
      : filePath
    void navigator.clipboard.writeText(relative)
  }, [])

  return {
    handleSelectFile,
    handleDeleteFile,
    handleRenameFile,
    handleCreateFile,
    handleCreateDir,
    handleImportPaths,
    handleRevealInFinder,
    handleOpenInTerminal,
    handleCopyAbsolutePath,
    handleCopyRelativePath,
  }
}
