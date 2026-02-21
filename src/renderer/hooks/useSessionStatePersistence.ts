import { useEffect, useRef } from 'react'
import type { OpenFile, CodeViewMode, UseCodeViewResult } from './useCodeView'

interface ViewStatePersistence {
  saveCurrentState: (
    sessionId: string,
    openFiles: OpenFile[],
    activeFilePath: string | null,
    codeViewMode: CodeViewMode
  ) => void
  restoreCodeView: {
    openFiles: OpenFile[]
    activeFilePath: string | null
    codeViewMode: CodeViewMode
  } | null
}

/**
 * Saves code-view state when switching away from a session and restores it
 * when viewState provides restored data.
 */
export function useSessionStatePersistence(
  activeSessionId: string | null,
  viewState: ViewStatePersistence,
  codeView: UseCodeViewResult
): void {
  const prevSessionRef = useRef<string | null>(null)
  const codeViewRef = useRef(codeView)
  codeViewRef.current = codeView

  // Save state before switching away from a session
  useEffect(() => {
    const prev = prevSessionRef.current
    if (prev && prev !== activeSessionId) {
      const cv = codeViewRef.current
      viewState.saveCurrentState(prev, cv.openFiles, cv.activeFilePath, cv.codeViewMode)
    }
    prevSessionRef.current = activeSessionId
  }, [activeSessionId, viewState.saveCurrentState])

  // Restore state when viewState provides it
  useEffect(() => {
    if (viewState.restoreCodeView) {
      codeView.restoreState(
        viewState.restoreCodeView.openFiles,
        viewState.restoreCodeView.activeFilePath,
        viewState.restoreCodeView.codeViewMode
      )
    }
  }, [viewState.restoreCodeView, codeView.restoreState])
}
