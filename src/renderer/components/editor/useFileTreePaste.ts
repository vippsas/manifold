import { useCallback, useState } from 'react'
import type React from 'react'
import type { FileTreeNode } from '../../../shared/types'
import type { VisibleNode } from './file-tree-visible'
import type { FileTreeClipboard } from './useFileTreeClipboard'

const ACCEPTED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

interface UseFileTreePasteArgs {
  clipboard: FileTreeClipboard
  visibleNodes: VisibleNode[]
  cursorPath: string | null
  worktreeRootPath?: string
  treePath?: string
  onPasteImage?: (dirPath: string, dataUrl: string) => Promise<string | null>
  onPasteClipboardImage?: (dirPath: string) => Promise<{ pasted: boolean; error: string | null }>
}

export function resolveFileTreePasteTargetDir({
  cursorPath,
  visibleNodes,
  worktreeRootPath,
  treePath,
}: {
  cursorPath: string | null
  visibleNodes: VisibleNode[]
  worktreeRootPath?: string
  treePath?: string
}): string {
  const node = cursorPath ? visibleNodes.find((v) => v.node.path === cursorPath)?.node : undefined
  if (node) return node.isDirectory ? node.path : parentDir(node.path)
  return worktreeRootPath ?? treePath ?? ''
}

export function collectClipboardImageFiles(
  items: DataTransferItemList | null | undefined,
  fileList: FileList | null | undefined,
): File[] {
  const collected: File[] = []
  const seenKeys = new Set<string>()
  const fileKey = (file: File): string => `${file.name}|${file.size}|${file.type}|${file.lastModified}`
  const tryAdd = (file: File | null | undefined): void => {
    if (!file) return
    if (!ACCEPTED_IMAGE_MIME.has(file.type)) return
    const key = fileKey(file)
    if (seenKeys.has(key)) return
    seenKeys.add(key)
    collected.push(file)
  }

  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') continue
      if (item.type && !item.type.startsWith('image/')) continue
      tryAdd(item.getAsFile())
    }
  }
  if (fileList) {
    for (const file of Array.from(fileList)) tryAdd(file)
  }
  return collected
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Failed to read pasted image'))
    }
    reader.onerror = (): void => {
      reject(reader.error ?? new Error('Failed to read pasted image'))
    }
    reader.readAsDataURL(file)
  })
}

export function useFileTreePaste({
  clipboard,
  visibleNodes,
  cursorPath,
  worktreeRootPath,
  treePath,
  onPasteImage,
  onPasteClipboardImage,
}: UseFileTreePasteArgs): {
  pasteError: string | null
  handleKeyboardPaste: () => void
  handlePaste: (e: React.ClipboardEvent<HTMLDivElement>) => void
} {
  const [pasteError, setPasteError] = useState<string | null>(null)

  const targetDir = useCallback((): string => {
    return resolveFileTreePasteTargetDir({ cursorPath, visibleNodes, worktreeRootPath, treePath })
  }, [cursorPath, visibleNodes, worktreeRootPath, treePath])

  const pasteImages = useCallback(async (files: File[]): Promise<void> => {
    if (!onPasteImage) return
    setPasteError(null)
    for (const file of files) {
      const dataUrl = await readImageFileAsDataUrl(file)
      const error = await onPasteImage(targetDir(), dataUrl)
      if (error) {
        setPasteError(error)
        return
      }
    }
  }, [onPasteImage, targetDir])

  const pasteInternalClipboard = useCallback((): void => {
    if (!clipboard.hasClipboard) return
    setPasteError(null)
    void clipboard.paste(targetDir())
  }, [clipboard, targetDir])

  const handleKeyboardPaste = useCallback((): void => {
    void (async (): Promise<void> => {
      if (onPasteClipboardImage) {
        setPasteError(null)
        const result = await onPasteClipboardImage(targetDir())
        if (result.error) {
          setPasteError(result.error)
          return
        }
        if (result.pasted) return
      }
      pasteInternalClipboard()
    })()
  }, [onPasteClipboardImage, pasteInternalClipboard, targetDir])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>): void => {
    const imageFiles = collectClipboardImageFiles(e.clipboardData?.items, e.clipboardData?.files)
    if (imageFiles.length > 0) {
      e.preventDefault()
      void pasteImages(imageFiles)
      return
    }
    if (clipboard.hasClipboard) {
      e.preventDefault()
      pasteInternalClipboard()
    }
  }, [clipboard.hasClipboard, pasteImages, pasteInternalClipboard])

  return { pasteError, handleKeyboardPaste, handlePaste }
}

function parentDir(filePath: string): string {
  const separatorIndex = filePath.lastIndexOf('/')
  if (separatorIndex < 0) return ''
  if (separatorIndex === 0) return '/'
  return filePath.slice(0, separatorIndex)
}
