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
  restoredSessionId: string | null
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

  // Restore state when viewState provides it for the currently active session.
  // Guard against a stale restore from a session we've already switched away from.
  useEffect(() => {
    if (viewState.restoreCodeView && viewState.restoredSessionId === activeSessionId) {
      codeView.restoreState(viewState.restoreCodeView)
    }
  }, [viewState.restoreCodeView, viewState.restoredSessionId, activeSessionId, codeView.restoreState])
}
