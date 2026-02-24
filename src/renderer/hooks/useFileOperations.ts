import { useCallback } from 'react'

export interface UseFileOperationsResult {
  handleSelectFile: (filePath: string) => void
  handleDeleteFile: (filePath: string) => Promise<void>
  handleRenameFile: (oldPath: string, newPath: string) => Promise<void>
}

export function useFileOperations(
  expandAncestors: (filePath: string) => void,
  codeViewSelectFile: (filePath: string) => void,
  codeViewCloseFile: (filePath: string) => void,
  codeViewRenameOpenFile: (oldPath: string, newPath: string) => void,
  ensureEditorVisible: () => void,
  deleteFile: (filePath: string) => Promise<boolean>,
  renameFile: (oldPath: string, newPath: string) => Promise<boolean>
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

  return {
    handleSelectFile,
    handleDeleteFile,
    handleRenameFile,
  }
}
