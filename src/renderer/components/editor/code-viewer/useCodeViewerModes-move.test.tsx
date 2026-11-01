import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCodeViewerModes } from './useCodeViewerModes'
import { getEditorPaneModeControls } from '../editor-pane-mode-controls'
import { useCodeView } from '../../../hooks/editor/useCodeView'
import { useEditorPaneHandlers } from '../../../hooks/editor/useEditorPaneHandlers'

const scm = { workspaceId: 'workspace', projectId: 'project', relPath: 'a.md', staged: false }

function setup(
  targetPaneId: string,
  existing: boolean,
  filePath = '/a.md',
  source: 'sourceControl' | 'default' | 'fileTree' = 'sourceControl',
) {
  const { result } = renderHook(() => {
    const codeView = useCodeView(null)
    const handlers = useEditorPaneHandlers({
      activeSessionId: null,
      activeProjectId: null,
      primarySessionId: null,
      sessionsByProject: {},
      projects: [],
      restoredSessionId: null,
      codeView,
      dockLayout: {
        splitEditorPane: () => targetPaneId,
        focusPanel: () => {},
        closePanel: () => {},
        editorPanelIds: ['editor', targetPaneId],
        findEditorPanelForSplit: () => existing ? targetPaneId : null,
      },
      ensureEditorVisible: () => 'editor',
      handleSelectFile: () => 'editor',
      setActiveSession: () => {},
      onRequestDeleteAgent: () => {},
    })
    return { codeView, handlers }
  })
  act(() => {
    result.current.codeView.restoreState({
      openFiles: [{ path: filePath, content: '# A', refreshVersion: 0 }],
      editorPanes: [
        { id: 'editor', openFilePaths: [filePath], activeFilePath: filePath },
        ...(existing ? [{ id: targetPaneId, openFilePaths: [filePath], activeFilePath: filePath }] : []),
      ],
      activeEditorPaneId: 'editor',
    })
    if (source === 'sourceControl') result.current.handlers.handleSelectFileFromSourceControl(filePath, scm)
    else if (source === 'default') result.current.handlers.handleSelectFileWithDefaultView(filePath)
    else result.current.handlers.handleSelectFileFromFileTree(filePath)
  })
  const propsFor = (paneId: string) => ({
    paneId,
    activeFilePath: result.current.codeView.getEditorPane(paneId).activeFilePath,
    lastFileOpenRequest: result.current.handlers.lastFileOpenRequest,
    isPreviewable: filePath.endsWith('.md'),
    isImage: false,
    hasDiff: true,
    hasTabs: true,
    onOpenLinkedFile: () => {},
  })
  renderHook((p) => useCodeViewerModes(p), { initialProps: propsFor('editor') })
  return { result, propsFor }
}

describe('moving editor tabs preserves their view mode', () => {
  it.each(['sourceControl', 'default', 'editor', 'diff', 'preview'] as const)(
    'keeps %s mode in a new split, on revisits, and after remounting',
    (choice) => {
      const targetPaneId = `move-new-${choice}`
      const defaultDiff = choice === 'sourceControl' || choice === 'default'
      const filePath = defaultDiff ? '/a.tf' : '/a.md'
      const source = defaultDiff ? choice : 'fileTree'
      const { result, propsFor } = setup(targetPaneId, false, filePath, source)
      act(() => {
        const controls = getEditorPaneModeControls('editor')!
        if (choice === 'editor') controls.showEditor()
        else if (choice === 'diff') controls.showDiff()
        else if (choice === 'preview') controls.showPreview()
      })
      const expectedMode = defaultDiff ? 'diff' : choice
      expect(getEditorPaneModeControls('editor')!.mode).toBe(expectedMode)

      const request = result.current.handlers.lastFileOpenRequest
      act(() => { result.current.handlers.handleMoveFileToSplitPane(filePath, 'editor', 'right') })
      expect(result.current.codeView.getEditorPane('editor').openFiles).toHaveLength(0)
      expect(result.current.codeView.getEditorPane(targetPaneId).activeFilePath).toBe(filePath)
      expect(result.current.handlers.lastFileOpenRequest).toBe(request)

      const props = propsFor(targetPaneId)
      const target = renderHook((p) => useCodeViewerModes(p), { initialProps: props })
      expect(getEditorPaneModeControls(targetPaneId)!.mode).toBe(expectedMode)
      target.rerender({ ...props, activeFilePath: '/c.tf', isPreviewable: false })
      target.rerender({ ...props, hasDiff: false })
      target.rerender(props)
      expect(getEditorPaneModeControls(targetPaneId)!.mode).toBe(expectedMode)
      target.unmount()
      renderHook(() => useCodeViewerModes(props))
      expect(getEditorPaneModeControls(targetPaneId)!.mode).toBe(expectedMode)
    },
  )

  describe.each(['pane', 'split'] as const)('moving to an existing %s', (move) => {
    it.each(['editor', 'diff', 'preview'] as const)('replaces the mounted destination choice with %s', (choice) => {
      const targetPaneId = `move-existing-${move}-${choice}`
      const { result, propsFor } = setup(targetPaneId, true)
      act(() => {
        const controls = getEditorPaneModeControls('editor')!
        if (choice === 'editor') controls.showEditor()
        else if (choice === 'diff') controls.showDiff()
        else controls.showPreview()
      })
      const target = renderHook((p) => useCodeViewerModes(p), { initialProps: propsFor(targetPaneId) })
      act(() => {
        const controls = getEditorPaneModeControls(targetPaneId)!
        if (choice === 'diff') controls.showEditor()
        else controls.showDiff()
      })
      expect(getEditorPaneModeControls(targetPaneId)!.mode).not.toBe(choice)

      act(() => {
        if (move === 'pane') result.current.handlers.handleMoveFileToPane('/a.md', targetPaneId)
        else result.current.handlers.handleMoveFileToSplitPane('/a.md', 'editor', 'right')
      })
      target.rerender(propsFor(targetPaneId))
      expect(getEditorPaneModeControls(targetPaneId)!.mode).toBe(choice)
    })
  })
})
