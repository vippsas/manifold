import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import Editor, { DiffEditor, type OnMount, type DiffOnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { OpenFile } from '../../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import { extensionToLanguage, isMarkdownFile, isHtmlFile } from './code-viewer-utils'
import type { FileOpenRequest } from './file-open-request'
import { ContextMenu } from './ContextMenu'
import { TabBar, NoTabsHeader } from './CodeViewerTabs'
import type { MoveTarget } from './CodeViewerTabs'

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
  moveTargets?: MoveTarget[]
  onActivatePane?: () => void
  onSplitPane?: (direction: 'right' | 'below') => void
  onMoveFile?: (filePath: string, targetPaneId: string) => void
  onSelectTab: (filePath: string) => void
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
  moveTargets = [],
  onActivatePane = () => {},
  onSplitPane = () => {},
  onMoveFile = () => {},
  onSelectTab,
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
  activeFilePathRef.current = activeFilePath

  const [previewPaths, setPreviewPaths] = useState<Set<string>>(
    () => previewPathsByPane.get(paneId) ?? new Set(),
  )
  const [diffMode, setDiffMode] = useState(false)
  const [moveMenu, setMoveMenu] = useState<{ x: number; y: number } | null>(null)
  const isMd = isMarkdownFile(activeFilePath)
  const isHtml = isHtmlFile(activeFilePath)
  const isPreviewable = isMd || isHtml
  const hasDiff = fileDiffText !== null
  const previewActive = isPreviewable && activeFilePath !== null && previewPaths.has(activeFilePath)

  const [resolvedHtml, setResolvedHtml] = useState<string | null>(null)

  useEffect(() => {
    if (!isHtml || !fileContent || !sessionId || !activeFilePath) {
      setResolvedHtml(null)
      return
    }

    let cancelled = false
    const dir = activeFilePath.includes('/') ? activeFilePath.replace(/\/[^/]+$/, '') : ''

    void (async (): Promise<void> => {
      const linkPattern = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi
      const altPattern = /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi
      const hrefs = new Set<string>()
      for (const regex of [linkPattern, altPattern]) {
        let match: RegExpExecArray | null
        while ((match = regex.exec(fileContent)) !== null) hrefs.add(match[1])
      }

      let html = fileContent
      for (const href of hrefs) {
        if (href.startsWith('http://') || href.startsWith('https://')) continue
        const cssPath = dir ? `${dir}/${href}` : href
        try {
          const css = (await window.electronAPI.invoke('files:read', sessionId, cssPath)) as string
          const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const tagPattern = new RegExp(`<link\\s+[^>]*href=["']${escapedHref}["'][^>]*\\/?>`, 'gi')
          html = html.replace(tagPattern, `<style>${css}</style>`)
        } catch {
          // CSS file not found — leave the link tag as-is
        }
      }

      if (!cancelled) setResolvedHtml(html)
    })()

    return () => { cancelled = true }
  }, [isHtml, fileContent, sessionId, activeFilePath])

  useEffect(() => {
    previewPathsByPane.set(paneId, previewPaths)
  }, [paneId, previewPaths])

  useEffect(() => {
    saveRef.current = onSaveFile
  }, [onSaveFile])

  useEffect(() => {
    if (lastFileOpenRequest.source === 'fileTree' && lastFileOpenRequest.path === activeFilePath) {
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

    editor.focus()
  }, [])

  const handleDiffEditorMount: DiffOnMount = useCallback((editor) => {
    editor.getModifiedEditor().focus()
  }, [])

  const hasTabs = openFiles.length > 0
  const showPreviewToggle = hasTabs && isPreviewable
  const showDiffToggle = hasTabs && hasDiff && !previewActive

  return (
    <div style={viewerStyles.wrapper} data-pane-id={paneId}>
      {hasTabs ? (
        <TabBar
          openFiles={openFiles}
          activeFilePath={activeFilePath}
          moveTargets={moveTargets}
          onActivatePane={onActivatePane}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onOpenMoveMenu={(x, y) => setMoveMenu({ x, y })}
          onSplitPane={onSplitPane}
          showPreviewToggle={showPreviewToggle}
          previewActive={previewActive}
          onTogglePreview={() => {
            if (activeFilePath) {
              setPreviewPaths((prev) => {
                const next = new Set(prev)
                if (next.has(activeFilePath)) next.delete(activeFilePath)
                else next.add(activeFilePath)
                return next
              })
            }
            setDiffMode(false)
          }}
          showDiffToggle={showDiffToggle}
          diffActive={diffMode}
          onToggleDiff={() => setDiffMode((value) => !value)}
        />
      ) : (
        <NoTabsHeader onActivatePane={onActivatePane} onSplitPane={onSplitPane} />
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
          <div className="markdown-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
          </div>
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
      {moveMenu && activeFilePath && moveTargets.length > 0 && (
        <ContextMenu
          x={moveMenu.x}
          y={moveMenu.y}
          items={moveTargets.map((target) => ({
            label: `Move to ${target.label}`,
            action: () => onMoveFile(activeFilePath, target.id),
          }))}
          onClose={() => setMoveMenu(null)}
        />
      )}
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
