import { useCallback, useEffect, useState } from 'react'
import type { FileOpenRequest } from './file-open-request'
import { isMarkdownFile } from './code-viewer-utils'
import {
  registerEditorPaneModeControls,
  unregisterEditorPaneModeControls,
} from './editor-pane-mode-controls'

// Module-level state that survives component remounts (e.g. agent switches
// rebuild dockview layout).
const previewPathsByPane = new Map<string, Set<string>>()

interface UseCodeViewerModesParams {
  paneId: string
  activeFilePath: string | null
  lastFileOpenRequest: FileOpenRequest
  isPreviewable: boolean
  isImage: boolean
  hasDiff: boolean
  hasTabs: boolean
  onOpenLinkedFile: (filePath: string) => void
}

interface CodeViewerModes {
  previewActive: boolean
  diffMode: boolean
  handleOpenLinkedFile: (filePath: string) => void
}

/**
 * Owns CodeViewer's editor/preview/diff mode state for a pane: which files are
 * shown as preview, whether the diff editor is active, and the registered
 * mode-control affordances. Survives remounts via the module-level pane map.
 */
export function useCodeViewerModes({
  paneId,
  activeFilePath,
  lastFileOpenRequest,
  isPreviewable,
  isImage,
  hasDiff,
  hasTabs,
  onOpenLinkedFile,
}: UseCodeViewerModesParams): CodeViewerModes {
  const [previewPaths, setPreviewPaths] = useState<Set<string>>(
    () => previewPathsByPane.get(paneId) ?? new Set(),
  )
  const [diffMode, setDiffMode] = useState(false)
  const previewActive = isPreviewable && activeFilePath !== null && previewPaths.has(activeFilePath)

  const updatePreviewPaths = useCallback((updater: (prev: Set<string>) => Set<string>): void => {
    setPreviewPaths((prev) => {
      const next = updater(prev)
      previewPathsByPane.set(paneId, next)
      return next
    })
  }, [paneId])

  useEffect(() => {
    previewPathsByPane.set(paneId, previewPaths)
  }, [paneId, previewPaths])

  // Auto-open markdown files in preview mode. Intentionally omits previewPaths
  // from deps: re-running when previewPaths changes would undo a manual switch
  // to editor mode by re-adding the active file.
  useEffect(() => {
    if (activeFilePath && isMarkdownFile(activeFilePath)) {
      updatePreviewPaths((prev) => {
        if (prev.has(activeFilePath)) return prev
        const next = new Set(prev)
        next.add(activeFilePath)
        return next
      })
    }
  }, [activeFilePath, updatePreviewPaths])

  useEffect(() => {
    if (lastFileOpenRequest.source !== 'default' && lastFileOpenRequest.path === activeFilePath) {
      setDiffMode(false)
      return
    }
    setDiffMode(hasDiff)
  }, [hasDiff, activeFilePath, lastFileOpenRequest])

  const handleOpenLinkedFile = useCallback((filePath: string): void => {
    updatePreviewPaths((prev) => {
      if (prev.has(filePath)) return prev
      const next = new Set(prev)
      next.add(filePath)
      return next
    })
    setDiffMode(false)
    onOpenLinkedFile(filePath)
  }, [onOpenLinkedFile, updatePreviewPaths])

  const showPreviewToggle = hasTabs && isPreviewable && !isImage
  const showDiffToggle = hasTabs && hasDiff && !isImage

  const showEditorMode = useCallback(() => {
    if (activeFilePath) {
      updatePreviewPaths((prev) => {
        if (!prev.has(activeFilePath)) return prev
        const next = new Set(prev)
        next.delete(activeFilePath)
        return next
      })
    }
    setDiffMode(false)
  }, [activeFilePath, updatePreviewPaths])

  const showPreviewMode = useCallback(() => {
    if (!activeFilePath || !isPreviewable) return

    updatePreviewPaths((prev) => {
      if (prev.has(activeFilePath)) return prev
      const next = new Set(prev)
      next.add(activeFilePath)
      return next
    })
    setDiffMode(false)
  }, [activeFilePath, isPreviewable, updatePreviewPaths])

  const showDiffMode = useCallback(() => {
    if (!hasDiff) return

    if (activeFilePath) {
      updatePreviewPaths((prev) => {
        if (!prev.has(activeFilePath)) return prev
        const next = new Set(prev)
        next.delete(activeFilePath)
        return next
      })
    }
    setDiffMode(true)
  }, [activeFilePath, hasDiff, updatePreviewPaths])

  useEffect(() => {
    const controls = {
      canShowPreview: showPreviewToggle,
      canShowDiff: showDiffToggle,
      showEditor: showEditorMode,
      showPreview: showPreviewMode,
      showDiff: showDiffMode,
    }

    registerEditorPaneModeControls(paneId, controls)
    return () => unregisterEditorPaneModeControls(paneId, controls)
  }, [paneId, showPreviewToggle, showDiffToggle, showEditorMode, showPreviewMode, showDiffMode])

  return { previewActive, diffMode, handleOpenLinkedFile }
}
