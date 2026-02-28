import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import Editor, { DiffEditor, type OnMount, type DiffOnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { OpenFile } from '../../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import { extensionToLanguage, isMarkdownFile, isHtmlFile, fileName } from './code-viewer-utils'

interface CodeViewerProps {
  sessionId: string | null
  fileDiffText: string | null
  originalContent: string | null
  openFiles: OpenFile[]
  activeFilePath: string | null
  fileContent: string | null
  theme: string
  onSelectTab: (filePath: string) => void
  onCloseTab: (filePath: string) => void
  onSaveFile?: (content: string) => void
}

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
  sessionId, fileDiffText, originalContent, openFiles, activeFilePath, fileContent, theme,
  onSelectTab, onCloseTab, onSaveFile,
}: CodeViewerProps): React.JSX.Element {
  const monacoTheme = theme
  const language = useMemo(() => extensionToLanguage(activeFilePath), [activeFilePath])
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const saveRef = useRef(onSaveFile)
  const [previewActive, setPreviewActive] = useState(false)
  const [diffMode, setDiffMode] = useState(false)
  const isMd = isMarkdownFile(activeFilePath)
  const isHtml = isHtmlFile(activeFilePath)
  const isPreviewable = isMd || isHtml
  const hasDiff = fileDiffText !== null

  const [resolvedHtml, setResolvedHtml] = useState<string | null>(null)

  // Inline <link rel="stylesheet"> references so HTML preview renders with CSS
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
      for (const re of [linkPattern, altPattern]) {
        let m: RegExpExecArray | null
        while ((m = re.exec(fileContent)) !== null) hrefs.add(m[1])
      }

      let html = fileContent
      for (const href of hrefs) {
        if (href.startsWith('http://') || href.startsWith('https://')) continue
        const cssPath = dir ? `${dir}/${href}` : href
        try {
          const css = (await window.electronAPI.invoke('files:read', sessionId, cssPath)) as string
          const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const tagPattern = new RegExp(
            `<link\\s+[^>]*href=["']${escapedHref}["'][^>]*\\/?>`,
            'gi'
          )
          html = html.replace(tagPattern, `<style>${css}</style>`)
        } catch {
          // CSS file not found — leave the link tag as-is
        }
      }
      if (!cancelled) setResolvedHtml(html)
    })()

    return () => { cancelled = true }
  }, [isHtml, fileContent, sessionId, activeFilePath])

  useEffect(() => { if (!isPreviewable) setPreviewActive(false) }, [isPreviewable])
  useEffect(() => { saveRef.current = onSaveFile }, [onSaveFile])

  // Auto-enable diff mode when diff data becomes available for the active file
  useEffect(() => {
    setDiffMode(hasDiff)
  }, [hasDiff, activeFilePath])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current?.(editor.getValue())
    })
  }, [])

  const handleDiffEditorMount: DiffOnMount = useCallback((editor) => {
    // Focus the modified editor for keyboard navigation
    editor.getModifiedEditor().focus()
  }, [])

  const hasTabs = openFiles.length > 0
  const showPreviewToggle = hasTabs && isPreviewable
  const showDiffToggle = hasTabs && hasDiff && !previewActive

  return (
    <div style={viewerStyles.wrapper}>
      {hasTabs ? (
        <TabBar
          openFiles={openFiles} activeFilePath={activeFilePath}
          onSelectTab={onSelectTab} onCloseTab={onCloseTab}
          showPreviewToggle={showPreviewToggle} previewActive={previewActive}
          onTogglePreview={() => { setPreviewActive((p) => !p); setDiffMode(false) }}
          showDiffToggle={showDiffToggle} diffActive={diffMode}
          onToggleDiff={() => setDiffMode((d) => !d)}
        />
      ) : (
        <NoTabsHeader />
      )}
      <div style={viewerStyles.editorContainer}>
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
            original={originalContent ?? ''}
            modified={fileContent}
            language={language}
            theme={monacoTheme}
            options={DIFF_EDITOR_OPTIONS}
            onMount={handleDiffEditorMount}
          />
        ) : (
          <EditorContent
            fileContent={fileContent}
            language={language} monacoTheme={monacoTheme}
            onMount={handleEditorMount}
          />
        )}
      </div>
    </div>
  )
}

function NoTabsHeader(): React.JSX.Element {
  return (
    <div style={viewerStyles.header}>
      <span className="mono" style={viewerStyles.headerText}>
        No file selected
      </span>
    </div>
  )
}

interface TabBarProps {
  openFiles: OpenFile[]
  activeFilePath: string | null
  onSelectTab: (filePath: string) => void
  onCloseTab: (filePath: string) => void
  showPreviewToggle: boolean
  previewActive: boolean
  onTogglePreview: () => void
  showDiffToggle: boolean
  diffActive: boolean
  onToggleDiff: () => void
}

function TabBar({
  openFiles, activeFilePath,
  onSelectTab, onCloseTab,
  showPreviewToggle, previewActive, onTogglePreview,
  showDiffToggle, diffActive, onToggleDiff,
}: TabBarProps): React.JSX.Element {
  return (
    <div style={viewerStyles.tabBar}>
      {openFiles.map((file) => (
        <FileTab
          key={file.path} file={file}
          isActive={file.path === activeFilePath}
          onSelect={onSelectTab} onClose={onCloseTab}
        />
      ))}
      {showDiffToggle && (
        <button
          style={{ ...viewerStyles.previewToggle, ...(diffActive ? viewerStyles.previewToggleActive : {}) }}
          onClick={onToggleDiff}
          title={diffActive ? 'Show editor' : 'Show diff'}
        >
          Diff
        </button>
      )}
      {showPreviewToggle && (
        <button
          style={{ ...viewerStyles.previewToggle, ...(previewActive ? viewerStyles.previewToggleActive : {}) }}
          onClick={onTogglePreview}
          title={previewActive ? 'Show editor' : 'Show preview'}
        >
          {previewActive ? 'Editor' : 'Preview'}
        </button>
      )}
    </div>
  )
}

function FileTab({
  file, isActive, onSelect, onClose,
}: {
  file: OpenFile; isActive: boolean
  onSelect: (filePath: string) => void; onClose: (filePath: string) => void
}): React.JSX.Element {
  return (
    <div style={{ ...viewerStyles.tab, ...(isActive ? viewerStyles.tabActive : {}) }} title={file.path}>
      <button style={viewerStyles.tabLabel} onClick={() => onSelect(file.path)}>{fileName(file.path)}</button>
      <button
        style={viewerStyles.tabClose}
        onClick={(e) => { e.stopPropagation(); onClose(file.path) }}
        title="Close"
      >
        {'\u00D7'}
      </button>
    </div>
  )
}

interface EditorContentProps {
  fileContent: string | null
  language: string
  monacoTheme: string
  onMount?: OnMount
}

function EditorContent({
  fileContent, language, monacoTheme, onMount,
}: EditorContentProps): React.JSX.Element {
  if (fileContent !== null) {
    return <Editor value={fileContent} language={language} theme={monacoTheme} options={EDITABLE_OPTIONS} onMount={onMount} />
  }
  return (
    <div style={viewerStyles.empty}>
      Select a file to view its contents
    </div>
  )
}
