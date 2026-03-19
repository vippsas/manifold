import { useEffect, useRef } from 'react'
import type { RestoredCodeViewState, UseCodeViewResult } from './useCodeView'
import type { EditorPaneState } from './editor-pane-utils'

interface ViewStatePersistence {
  saveCurrentState: (
    sessionId: string,
    editorPanes: EditorPaneState[],
    activeEditorPaneId: string | null,
  ) => void
  restoreCodeView: RestoredCodeViewState | null
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
      viewState.saveCurrentState(prev, cv.editorPanes, cv.activeEditorPaneId)
    }
    prevSessionRef.current = activeSessionId
  }, [activeSessionId, viewState.saveCurrentState])

  // Restore state when viewState provides it
  useEffect(() => {
    if (viewState.restoreCodeView) {
      codeView.restoreState(viewState.restoreCodeView)
    }
  }, [viewState.restoreCodeView, codeView.restoreState])
}
