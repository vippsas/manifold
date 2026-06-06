import React, { useMemo, useRef, useCallback, useEffect } from 'react'
import { DiffEditor, type OnMount, type DiffOnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import type { OpenFile } from '../../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import {
  extensionToLanguage,
  isHtmlFile,
  isImageFile,
  isMarkdownFile,
} from './code-viewer-utils'
import type { FileOpenRequest } from './file-open-request'
import { TabBar, NoTabsHeader } from './CodeViewerTabs'
import { ImagePreview } from './viewer/ImagePreview'
import { MarkdownPreview } from './viewer/MarkdownPreview'
import { revealRequestedLocation } from './viewer/reveal-requested-location'
import { useResolvedHtmlPreview } from './viewer/useResolvedHtmlPreview'
import { useAutoSave } from './useAutoSave'
import { useCodeViewerModes } from './useCodeViewerModes'
import { EditorContent } from './EditorContent'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'
import type { EditorSettings } from '../../../shared/types'
import { buildEditorOptions } from './build-editor-options'

interface CodeViewerProps {
  paneId?: string
  sessionId: string | null
  fileDiffText: string | null
  originalContent: string | null
  openFiles: OpenFile[]
  activeFilePath: string | null
  fileContent: string | null
  lastFileOpenRequest: FileOpenRequest
  theme: string
  editorSettings?: EditorSettings
  onActivatePane?: () => void
  onSelectTab: (filePath: string) => void
  onMoveTabToSplitPane?: (filePath: string, direction: 'right' | 'below') => void
  onOpenLinkedFile?: (filePath: string) => void
  onCloseTab: (filePath: string) => void
  onSaveFile?: (filePath: string, content: string) => void
}

// Module-level state that survives component remounts (e.g. agent switches rebuild dockview layout)
const scrollPositionsByFile = new Map<string, number>()

export function CodeViewer({
  paneId = 'editor',
  sessionId,
  fileDiffText,
  originalContent,
  openFiles,
  activeFilePath,
  fileContent,
  lastFileOpenRequest,
  theme,
  editorSettings = DEFAULT_SETTINGS.editor as EditorSettings,
  onActivatePane = () => {},
  onSelectTab,
  onMoveTabToSplitPane,
  onOpenLinkedFile = () => {},
  onCloseTab,
  onSaveFile,
}: CodeViewerProps): React.JSX.Element {
  const monacoTheme = theme
  const editableOptions = useMemo(
    () => buildEditorOptions(editorSettings, { readOnly: false }),
    [editorSettings],
  )
  const diffOptions = useMemo(
    () => ({
      ...buildEditorOptions(editorSettings, { readOnly: true }),
      renderSideBySide: false,
      renderIndicators: true,
      renderMarginRevertIcon: false,
    }),
    [editorSettings],
  )
  const language = useMemo(() => extensionToLanguage(activeFilePath), [activeFilePath])
  const activeOpenFile = useMemo(
    () => openFiles.find((file) => file.path === activeFilePath) ?? null,
    [openFiles, activeFilePath],
  )
  const activeRefreshVersion = activeOpenFile?.refreshVersion ?? 0
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const saveRef = useRef(onSaveFile)
  const activeFilePathRef = useRef(activeFilePath)
  const lastFileOpenRequestRef = useRef(lastFileOpenRequest)
  activeFilePathRef.current = activeFilePath
  lastFileOpenRequestRef.current = lastFileOpenRequest

  const { onChange: handleEditorChange } = useAutoSave(activeFilePath, onSaveFile)

  const isHtml = isHtmlFile(activeFilePath)
  const isImage = isImageFile(activeFilePath)
  const isPreviewable = isMarkdownFile(activeFilePath) || isHtml
  const hasDiff = fileDiffText !== null
  const hasTabs = openFiles.length > 0
  const resolvedHtml = useResolvedHtmlPreview({
    isHtml,
    fileContent,
    sessionId,
    activeFilePath,
  })

  const { previewActive, diffMode, handleOpenLinkedFile } = useCodeViewerModes({
    paneId,
    activeFilePath,
    lastFileOpenRequest,
    isPreviewable,
    isImage,
    hasDiff,
    hasTabs,
    onOpenLinkedFile,
  })

  useEffect(() => {
    saveRef.current = onSaveFile
  }, [onSaveFile])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const filePath = activeFilePathRef.current
      if (!filePath) return
      saveRef.current?.(filePath, editor.getValue())
    })

    const filePath = activeFilePathRef.current
    if (filePath) {
      const scrollTop = scrollPositionsByFile.get(filePath)
      if (scrollTop !== undefined) {
        requestAnimationFrame(() => editor.setScrollTop(scrollTop))
      }
    }

    editor.onDidScrollChange((e) => {
      const fp = activeFilePathRef.current
      if (fp && e.scrollTopChanged) {
        scrollPositionsByFile.set(fp, e.scrollTop)
      }
    })

    revealRequestedLocation(editor, activeFilePathRef.current, lastFileOpenRequestRef.current)
    editor.focus()
  }, [])

  const handleDiffEditorMount: DiffOnMount = useCallback((editor) => {
    editor.getModifiedEditor().focus()
  }, [])

  useEffect(() => {
    revealRequestedLocation(editorRef.current, activeFilePath, lastFileOpenRequest)
  }, [activeFilePath, lastFileOpenRequest])

  return (
    <div style={viewerStyles.wrapper} data-pane-id={paneId}>
      {hasTabs ? (
        <TabBar
          openFiles={openFiles}
          activeFilePath={activeFilePath}
          onActivatePane={onActivatePane}
          onSelectTab={onSelectTab}
          onMoveToSplitPane={onMoveTabToSplitPane}
          onCloseTab={onCloseTab}
        />
      ) : (
        <NoTabsHeader />
      )}
      <div style={viewerStyles.editorContainer} onMouseDown={onActivatePane}>
        {isImage && activeFilePath !== null && fileContent !== null ? (
          <ImagePreview filePath={activeFilePath} dataUrl={fileContent} />
        ) : previewActive && isHtml && resolvedHtml !== null ? (
          <iframe
            srcDoc={resolvedHtml}
            sandbox="allow-scripts"
            style={viewerStyles.htmlPreview}
            title="HTML Preview"
          />
        ) : previewActive && fileContent !== null && !isHtml ? (
          activeFilePath !== null ? (
            <MarkdownPreview
              paneId={paneId}
              filePath={activeFilePath}
              fileContent={fileContent}
              onOpenLinkedFile={handleOpenLinkedFile}
            />
          ) : null
        ) : diffMode && fileContent !== null ? (
          <DiffEditor
            key={`${activeFilePath ?? '__no-file__'}:${activeRefreshVersion}`}
            original={originalContent ?? ''}
            modified={fileContent}
            language={language}
            theme={monacoTheme}
            options={diffOptions}
            onMount={handleDiffEditorMount}
          />
        ) : (
          <EditorContent
            filePath={activeFilePath}
            fileContent={fileContent}
            refreshVersion={activeRefreshVersion}
            language={language}
            monacoTheme={monacoTheme}
            options={editableOptions}
            onMount={handleEditorMount}
            onChange={handleEditorChange}
          />
        )}
      </div>
    </div>
  )
}
