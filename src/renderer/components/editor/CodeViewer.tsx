import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import Editor, { DiffEditor, type OnMount, type DiffOnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import type { OpenFile } from '../../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import {
  extensionToLanguage,
  isHtmlFile,
  isMarkdownFile,
} from './code-viewer-utils'
import type { FileOpenRequest } from './file-open-request'
import { TabBar, NoTabsHeader } from './CodeViewerTabs'
import { MarkdownPreview } from './viewer/MarkdownPreview'
import { revealRequestedLocation } from './viewer/reveal-requested-location'
import { useResolvedHtmlPreview } from './viewer/useResolvedHtmlPreview'
import {
  registerEditorPaneModeControls,
  unregisterEditorPaneModeControls,
} from './editor-pane-mode-controls'

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
  onActivatePane?: () => void
  onSelectTab: (filePath: string) => void
  onOpenLinkedFile?: (filePath: string) => void
  onCloseTab: (filePath: string) => void
  onSaveFile?: (filePath: string, content: string) => void
}

// Module-level state that survives component remounts (e.g. agent switches rebuild dockview layout)
const previewPathsByPane = new Map<string, Set<string>>()
const scrollPositionsByFile = new Map<string, number>()

const BASE_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  fontFamily: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
  lineNumbers: 'on' as const,
  renderLineHighlight: 'none' as const,
  wordWrap: 'on' as const,
}

const EDITABLE_OPTIONS = { ...BASE_EDITOR_OPTIONS, readOnly: false }

const DIFF_EDITOR_OPTIONS = {
  ...BASE_EDITOR_OPTIONS,
  readOnly: true,
  renderSideBySide: false,
  renderIndicators: true,
  renderMarginRevertIcon: false,
}

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
  onActivatePane = () => {},
  onSelectTab,
  onOpenLinkedFile = () => {},
  onCloseTab,
  onSaveFile,
}: CodeViewerProps): React.JSX.Element {
  const monacoTheme = theme
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

  const [previewPaths, setPreviewPaths] = useState<Set<string>>(
    () => previewPathsByPane.get(paneId) ?? new Set(),
  )
  const [diffMode, setDiffMode] = useState(false)
  const isMd = isMarkdownFile(activeFilePath)
  const isHtml = isHtmlFile(activeFilePath)
  const isPreviewable = isMd || isHtml
  const hasDiff = fileDiffText !== null
  const previewActive = isPreviewable && activeFilePath !== null && previewPaths.has(activeFilePath)
  const resolvedHtml = useResolvedHtmlPreview({
    isHtml,
    fileContent,
    sessionId,
    activeFilePath,
  })

  useEffect(() => {
    previewPathsByPane.set(paneId, previewPaths)
  }, [paneId, previewPaths])

  // Auto-open markdown files in preview mode
  useEffect(() => {
    if (activeFilePath && isMarkdownFile(activeFilePath) && !previewPaths.has(activeFilePath)) {
      setPreviewPaths((prev) => {
        const next = new Set(prev)
        next.add(activeFilePath)
        return next
      })
    }
  }, [activeFilePath])

  useEffect(() => {
    saveRef.current = onSaveFile
  }, [onSaveFile])

  useEffect(() => {
    if (lastFileOpenRequest.source !== 'default' && lastFileOpenRequest.path === activeFilePath) {
      setDiffMode(false)
      return
    }
    setDiffMode(hasDiff)
  }, [hasDiff, activeFilePath, lastFileOpenRequest])

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

  const handleOpenLinkedFile = useCallback((filePath: string): void => {
    setPreviewPaths((prev) => {
      if (prev.has(filePath)) return prev
      const next = new Set(prev)
      next.add(filePath)
      return next
    })
    setDiffMode(false)
    onOpenLinkedFile(filePath)
  }, [onOpenLinkedFile])

  const hasTabs = openFiles.length > 0
  const showPreviewToggle = hasTabs && isPreviewable
  const showDiffToggle = hasTabs && hasDiff

  const showEditorMode = useCallback(() => {
    if (activeFilePath) {
      setPreviewPaths((prev) => {
        if (!prev.has(activeFilePath)) return prev
        const next = new Set(prev)
        next.delete(activeFilePath)
        return next
      })
    }
    setDiffMode(false)
  }, [activeFilePath])

  const showPreviewMode = useCallback(() => {
    if (!activeFilePath || !isPreviewable) return

    setPreviewPaths((prev) => {
      if (prev.has(activeFilePath)) return prev
      const next = new Set(prev)
      next.add(activeFilePath)
      return next
    })
    setDiffMode(false)
  }, [activeFilePath, isPreviewable])

  const showDiffMode = useCallback(() => {
    if (!hasDiff) return

    if (activeFilePath) {
      setPreviewPaths((prev) => {
        if (!prev.has(activeFilePath)) return prev
        const next = new Set(prev)
        next.delete(activeFilePath)
        return next
      })
    }
    setDiffMode(true)
  }, [activeFilePath, hasDiff])

  useEffect(() => {
    revealRequestedLocation(editorRef.current, activeFilePath, lastFileOpenRequest)
  }, [activeFilePath, lastFileOpenRequest])

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

  return (
    <div style={viewerStyles.wrapper} data-pane-id={paneId}>
      {hasTabs ? (
        <TabBar
          openFiles={openFiles}
          activeFilePath={activeFilePath}
          onActivatePane={onActivatePane}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
        />
      ) : (
        <NoTabsHeader />
      )}
      <div style={viewerStyles.editorContainer} onMouseDown={onActivatePane}>
        {previewActive && isHtml && resolvedHtml !== null ? (
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
            options={DIFF_EDITOR_OPTIONS}
            onMount={handleDiffEditorMount}
          />
        ) : (
          <EditorContent
            filePath={activeFilePath}
            fileContent={fileContent}
            refreshVersion={activeRefreshVersion}
            language={language}
            monacoTheme={monacoTheme}
            onMount={handleEditorMount}
          />
        )}
      </div>
    </div>
  )
}

interface EditorContentProps {
  filePath: string | null
  fileContent: string | null
  refreshVersion: number
  language: string
  monacoTheme: string
  onMount?: OnMount
}

function EditorContent({
  filePath,
  fileContent,
  refreshVersion,
  language,
  monacoTheme,
  onMount,
}: EditorContentProps): React.JSX.Element {
  if (fileContent !== null) {
    return (
      <Editor
        key={`${filePath ?? '__no-file__'}:${refreshVersion}`}
        defaultValue={fileContent}
        language={language}
        theme={monacoTheme}
        options={EDITABLE_OPTIONS}
        onMount={onMount}
      />
    )
  }

  return (
    <div style={viewerStyles.empty}>
      Select a file to view its contents
    </div>
  )
}
