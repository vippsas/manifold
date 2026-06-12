import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react'
import { DiffEditor, type OnMount, type DiffOnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import type { OpenFile } from '../../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import {
  extensionToLanguage,
  isHtmlFile,
  isImageFile,
  isMarkdownFile,
  isPdfFile,
} from './code-viewer-utils'
import type { FileOpenRequest } from './file-open-request'
import { TabBar, NoTabsHeader } from './CodeViewerTabs'
import { ImagePreview } from './viewer/ImagePreview'
import { PdfPreview } from './viewer/PdfPreview'
import { PdfErrorBoundary } from './viewer/PdfErrorBoundary'
import { MarkdownPreview } from './viewer/MarkdownPreview'
import { revealRequestedLocation } from './viewer/reveal-requested-location'
import { useResolvedHtmlPreview } from './viewer/useResolvedHtmlPreview'
import { useAutoSave } from './useAutoSave'
import { useCodeViewerModes } from './useCodeViewerModes'
import { EditorContent } from './EditorContent'
import { useEditorStatusBar } from './useEditorStatusBar'
import { EditorStatusBar } from './EditorStatusBar'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'
import type { EditorSettings } from '../../../shared/types'
import { buildEditorOptions } from './build-editor-options'
import { useDiffGutter } from './useDiffGutter'
import { registerEditorNavCommands } from './editor-nav-commands'
import { setBounded } from './bounded-cache'

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

// Module-level state that survives component remounts (e.g. agent switches
// rebuild dockview layout). Keyed by pane+path so two split panes showing the
// same file keep independent scroll positions, and LRU-capped so it doesn't
// grow without bound as files/panes/sessions open and close.
const scrollPositionsByFile = new Map<string, number>()
const MAX_SCROLL_POSITIONS = 200
const scrollKeyFor = (paneId: string, filePath: string): string => `${paneId}\u0000${filePath}`

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
  const isMarkdown = isMarkdownFile(activeFilePath)
  const editableOptions = useMemo(
    () => buildEditorOptions(editorSettings, { readOnly: false, isMarkdown }),
    [editorSettings, isMarkdown],
  )
  const diffOptions = useMemo(
    () => ({
      ...buildEditorOptions(editorSettings, { readOnly: true, isMarkdown }),
      renderSideBySide: false,
      renderIndicators: true,
      renderMarginRevertIcon: false,
    }),
    [editorSettings, isMarkdown],
  )
  const language = useMemo(() => extensionToLanguage(activeFilePath), [activeFilePath])
  const activeOpenFile = useMemo(
    () => openFiles.find((file) => file.path === activeFilePath) ?? null,
    [openFiles, activeFilePath],
  )
  const activeRefreshVersion = activeOpenFile?.refreshVersion ?? 0
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)
  const [mountTick, setMountTick] = useState(0)
  const saveRef = useRef(onSaveFile)
  const activeFilePathRef = useRef(activeFilePath)
  const lastFileOpenRequestRef = useRef(lastFileOpenRequest)
  activeFilePathRef.current = activeFilePath
  lastFileOpenRequestRef.current = lastFileOpenRequest

  const { onChange: handleEditorChange } = useAutoSave(activeFilePath, onSaveFile)

  const isHtml = isHtmlFile(activeFilePath)
  const isImage = isImageFile(activeFilePath)
  const isPdf = isPdfFile(activeFilePath)
  const isPreviewable = isMarkdown || isHtml
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

  const { statusInfo, bindEditor } = useEditorStatusBar(language)

  // Must mirror the editor-container render ternary's fall-through to <EditorContent>:
  // if a new preview/diff branch is added there, negate it here too.
  const showPlainEditor =
    !(isPdf && activeFilePath !== null && fileContent !== null) &&
    !(isImage && activeFilePath !== null && fileContent !== null) &&
    !(previewActive && isHtml && resolvedHtml !== null) &&
    !(previewActive && fileContent !== null && !isHtml && activeFilePath !== null) &&
    !(diffMode && fileContent !== null)

  useDiffGutter({
    editorRef,
    monacoRef,
    active: showPlainEditor && fileContent !== null,
    mountTick,
    diffText: fileDiffText,
  })

  useEffect(() => {
    saveRef.current = onSaveFile
  }, [onSaveFile])

  const handleEditorMount: OnMount = useCallback((editor, monacoApi) => {
    editorRef.current = editor
    bindEditor(editor)
    monacoRef.current = monacoApi
    setMountTick((tick) => tick + 1)
    registerEditorNavCommands(editor, monacoApi)
    editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () => {
      const filePath = activeFilePathRef.current
      if (!filePath) return
      saveRef.current?.(filePath, editor.getValue())
    })

    const filePath = activeFilePathRef.current
    if (filePath) {
      const scrollTop = scrollPositionsByFile.get(scrollKeyFor(paneId, filePath))
      if (scrollTop !== undefined) {
        requestAnimationFrame(() => editor.setScrollTop(scrollTop))
      }
    }

    editor.onDidScrollChange((e) => {
      const fp = activeFilePathRef.current
      if (fp && e.scrollTopChanged) {
        setBounded(scrollPositionsByFile, scrollKeyFor(paneId, fp), e.scrollTop, MAX_SCROLL_POSITIONS)
      }
    })

    revealRequestedLocation(editor, activeFilePathRef.current, lastFileOpenRequestRef.current)
    editor.focus()
  }, [bindEditor, paneId])

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
        {isPdf && activeFilePath !== null && fileContent !== null ? (
          <PdfErrorBoundary key={activeFilePath}>
            <PdfPreview filePath={activeFilePath} dataUrl={fileContent} />
          </PdfErrorBoundary>
        ) : isImage && activeFilePath !== null && fileContent !== null ? (
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
      {showPlainEditor && fileContent !== null && activeFilePath !== null && (
        <EditorStatusBar info={statusInfo} />
      )}
    </div>
  )
}
