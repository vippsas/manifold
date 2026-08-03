import { useCallback, useEffect, useState } from 'react'
import type { FileOpenRequest } from '../file-open-request'
import { isMarkdownFile } from './code-viewer-utils'
import {
  registerEditorPaneModeControls,
  unregisterEditorPaneModeControls,
} from '../editor-pane-mode-controls'
import { addBounded } from '../bounded-cache'

// Module-level state that survives component remounts (e.g. agent switches
// rebuild dockview layout). The per-pane Sets accumulate file paths and never
// shed closed tabs, so they're capped to stay bounded across a long session.
const previewPathsByPane = new Map<string, Set<string>>()
const MAX_PATHS_PER_PANE = 200

// Tracks files already auto-defaulted to preview (per pane), so the markdown
// auto-preview only applies on first open and never overrides a later manual
// switch to editor mode.
const autoPreviewedPathsByPane = new Map<string, Set<string>>()

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

  // Auto-open markdown files in preview mode — but only the FIRST time a file is
  // opened in this pane. After that the user's explicit Editor/Preview choice
  // (stored in previewPaths) is respected on revisits.
  useEffect(() => {
    if (!activeFilePath || !isMarkdownFile(activeFilePath)) return
    const seen = autoPreviewedPathsByPane.get(paneId) ?? new Set<string>()
    if (seen.has(activeFilePath)) return
    addBounded(seen, activeFilePath, MAX_PATHS_PER_PANE)
    autoPreviewedPathsByPane.set(paneId, seen)
    updatePreviewPaths((prev) => {
      if (prev.has(activeFilePath)) return prev
      const next = new Set(prev)
      next.add(activeFilePath)
      return next
    })
  }, [activeFilePath, paneId, updatePreviewPaths])

  useEffect(() => {
    // 'default' (Modified Files) and 'sourceControl' clicks open in diff mode;
    // every other source (file tree, search, …) opens the plain editor.
    const wantsDiff = lastFileOpenRequest.source === 'default' || lastFileOpenRequest.source === 'sourceControl'
    if (!wantsDiff && lastFileOpenRequest.path === activeFilePath) {
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

  const mode: 'editor' | 'preview' | 'diff' = previewActive ? 'preview' : diffMode ? 'diff' : 'editor'

  useEffect(() => {
    const controls = {
      canShowPreview: showPreviewToggle,
      canShowDiff: showDiffToggle,
      mode,
      showEditor: showEditorMode,
      showPreview: showPreviewMode,
      showDiff: showDiffMode,
    }

    registerEditorPaneModeControls(paneId, controls)
    return () => unregisterEditorPaneModeControls(paneId, controls)
  }, [paneId, showPreviewToggle, showDiffToggle, mode, showEditorMode, showPreviewMode, showDiffMode])

  return { previewActive, diffMode, handleOpenLinkedFile }
}
