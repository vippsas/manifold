import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import Editor, { DiffEditor, type OnMount, type DiffOnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { OpenFile } from '../../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import { extensionToLanguage, isMarkdownFile, isHtmlFile, fileName } from './code-viewer-utils'
import type { FileOpenRequest } from './file-open-request'
import { ContextMenu } from './ContextMenu'

interface MoveTarget {
  id: string
  label: string
}

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

  const [previewActive, setPreviewActive] = useState(false)
  const [diffMode, setDiffMode] = useState(false)
  const [moveMenu, setMoveMenu] = useState<{ x: number; y: number } | null>(null)
  const isMd = isMarkdownFile(activeFilePath)
  const isHtml = isHtmlFile(activeFilePath)
  const isPreviewable = isMd || isHtml
  const hasDiff = fileDiffText !== null

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
    if (!isPreviewable) setPreviewActive(false)
  }, [isPreviewable])

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
          onTogglePreview={() => { setPreviewActive((value) => !value); setDiffMode(false) }}
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

function NoTabsHeader({
  onActivatePane,
  onSplitPane,
}: {
  onActivatePane: () => void
  onSplitPane: (direction: 'right' | 'below') => void
}): React.JSX.Element {
  return (
    <div style={viewerStyles.header}>
      <span className="mono" style={viewerStyles.headerText}>
        No file selected
      </span>
      <PaneActions
        hasMoveTargets={false}
        onActivatePane={onActivatePane}
        onOpenMoveMenu={undefined}
        onSplitPane={onSplitPane}
      />
    </div>
  )
}

interface TabBarProps {
  openFiles: OpenFile[]
  activeFilePath: string | null
  moveTargets: MoveTarget[]
  onActivatePane: () => void
  onSelectTab: (filePath: string) => void
  onCloseTab: (filePath: string) => void
  onOpenMoveMenu: (x: number, y: number) => void
  onSplitPane: (direction: 'right' | 'below') => void
  showPreviewToggle: boolean
  previewActive: boolean
  onTogglePreview: () => void
  showDiffToggle: boolean
  diffActive: boolean
  onToggleDiff: () => void
}

function TabBar({
  openFiles,
  activeFilePath,
  moveTargets,
  onActivatePane,
  onSelectTab,
  onCloseTab,
  onOpenMoveMenu,
  onSplitPane,
  showPreviewToggle,
  previewActive,
  onTogglePreview,
  showDiffToggle,
  diffActive,
  onToggleDiff,
}: TabBarProps): React.JSX.Element {
  return (
    <div style={viewerStyles.tabBar}>
      <div style={viewerStyles.tabStrip}>
        {openFiles.map((file) => (
          <FileTab
            key={file.path}
            file={file}
            isActive={file.path === activeFilePath}
            onActivatePane={onActivatePane}
            onSelect={onSelectTab}
            onClose={onCloseTab}
          />
        ))}
      </div>
      <div style={viewerStyles.tabActions}>
        {showDiffToggle && (
          <button
            style={{ ...viewerStyles.previewToggle, ...(diffActive ? viewerStyles.previewToggleActive : {}) }}
            onClick={() => {
              onActivatePane()
              onToggleDiff()
            }}
            title={diffActive ? 'Show editor' : 'Show diff'}
          >
            Diff
          </button>
        )}
        {showPreviewToggle && (
          <button
            style={{ ...viewerStyles.previewToggle, ...(previewActive ? viewerStyles.previewToggleActive : {}) }}
            onClick={() => {
              onActivatePane()
              onTogglePreview()
            }}
            title={previewActive ? 'Show editor' : 'Show preview'}
          >
            {previewActive ? 'Editor' : 'Preview'}
          </button>
        )}
        <PaneActions
          hasMoveTargets={moveTargets.length > 0 && activeFilePath !== null}
          onActivatePane={onActivatePane}
          onOpenMoveMenu={onOpenMoveMenu}
          onSplitPane={onSplitPane}
        />
      </div>
    </div>
  )
}

function PaneActions({
  hasMoveTargets,
  onActivatePane,
  onOpenMoveMenu,
  onSplitPane,
}: {
  hasMoveTargets: boolean
  onActivatePane: () => void
  onOpenMoveMenu?: (x: number, y: number) => void
  onSplitPane: (direction: 'right' | 'below') => void
}): React.JSX.Element {
  const moveButtonRef = useRef<HTMLButtonElement | null>(null)

  const handleMoveClick = useCallback(() => {
    if (!hasMoveTargets || !moveButtonRef.current || !onOpenMoveMenu) return
    onActivatePane()
    const rect = moveButtonRef.current.getBoundingClientRect()
    onOpenMoveMenu(rect.left, rect.bottom + 4)
  }, [hasMoveTargets, onActivatePane, onOpenMoveMenu])

  return (
    <>
      <button
        style={viewerStyles.actionButton}
        onClick={() => {
          onActivatePane()
          onSplitPane('right')
        }}
        title="Split editor vertically"
      >
        Split Right
      </button>
      <button
        style={viewerStyles.actionButton}
        onClick={() => {
          onActivatePane()
          onSplitPane('below')
        }}
        title="Split editor horizontally"
      >
        Split Down
      </button>
      {hasMoveTargets && (
        <button
          ref={moveButtonRef}
          style={viewerStyles.actionButton}
          onClick={handleMoveClick}
          title="Move file to another editor"
        >
          Move
        </button>
      )}
    </>
  )
}

function FileTab({
  file,
  isActive,
  onActivatePane,
  onSelect,
  onClose,
}: {
  file: OpenFile
  isActive: boolean
  onActivatePane: () => void
  onSelect: (filePath: string) => void
  onClose: (filePath: string) => void
}): React.JSX.Element {
  return (
    <div style={{ ...viewerStyles.tab, ...(isActive ? viewerStyles.tabActive : {}) }} title={file.path}>
      <button
        style={viewerStyles.tabLabel}
        onClick={() => {
          onActivatePane()
          onSelect(file.path)
        }}
      >
        {fileName(file.path)}
      </button>
      <button
        style={viewerStyles.tabClose}
        onClick={(event) => {
          event.stopPropagation()
          onActivatePane()
          onClose(file.path)
        }}
        title="Close"
      >
        {'\u00D7'}
      </button>
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
        value={fileContent}
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
