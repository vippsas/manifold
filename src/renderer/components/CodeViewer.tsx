import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { OpenFile } from '../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import { extensionToLanguage, isMarkdownFile, fileName, splitDiffByFile } from './code-viewer-utils'
import type { FileDiff } from './code-viewer-utils'

type ViewMode = 'diff' | 'file'

interface CodeViewerProps {
  mode: ViewMode
  diff: string
  openFiles: OpenFile[]
  activeFilePath: string | null
  fileContent: string | null
  theme: string
  worktreeRoot: string | null
  onSelectTab: (filePath: string) => void
  onCloseTab: (filePath: string) => void
  onShowDiff: () => void
  onSaveFile?: (content: string) => void
  onClose?: () => void
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

const READONLY_OPTIONS = { ...BASE_EDITOR_OPTIONS, readOnly: true }
const EDITABLE_OPTIONS = { ...BASE_EDITOR_OPTIONS, readOnly: false }

export function CodeViewer({
  mode, diff, openFiles, activeFilePath, fileContent, theme,
  worktreeRoot, onSelectTab, onCloseTab, onShowDiff, onSaveFile, onClose,
}: CodeViewerProps): React.JSX.Element {
  const monacoTheme = theme
  const language = useMemo(() => extensionToLanguage(activeFilePath), [activeFilePath])
  const fileDiffs = useMemo(() => splitDiffByFile(diff), [diff])
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const saveRef = useRef(onSaveFile)
  const [previewActive, setPreviewActive] = useState(false)
  const isMd = isMarkdownFile(activeFilePath)

  useEffect(() => { if (!isMd) setPreviewActive(false) }, [isMd])
  useEffect(() => { saveRef.current = onSaveFile }, [onSaveFile])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current?.(editor.getValue())
    })
  }, [])

  const handleSelectDiffFile = useCallback(
    (relativePath: string): void => {
      const absPath = worktreeRoot ? `${worktreeRoot.replace(/\/$/, '')}/${relativePath}` : relativePath
      onSelectTab(absPath)
    },
    [worktreeRoot, onSelectTab]
  )

  const hasTabs = openFiles.length > 0
  const showPreviewToggle = hasTabs && mode === 'file' && isMd

  return (
    <div style={viewerStyles.wrapper}>
      {hasTabs ? (
        <TabBar
          openFiles={openFiles} activeFilePath={activeFilePath} mode={mode}
          onSelectTab={onSelectTab} onCloseTab={onCloseTab} onShowDiff={onShowDiff}
          showPreviewToggle={showPreviewToggle} previewActive={previewActive}
          onTogglePreview={() => setPreviewActive((p) => !p)} onClose={onClose}
        />
      ) : (
        <NoTabsHeader mode={mode} onClose={onClose} />
      )}
      <div style={viewerStyles.editorContainer}>
        {previewActive && fileContent !== null ? (
          <div className="markdown-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
          </div>
        ) : (
          <EditorContent
            mode={mode} fileDiffs={fileDiffs} fileContent={fileContent}
            language={language} monacoTheme={monacoTheme}
            onMount={handleEditorMount} onSelectDiffFile={handleSelectDiffFile}
          />
        )}
      </div>
    </div>
  )
}

function NoTabsHeader({ mode, onClose }: { mode: ViewMode; onClose?: () => void }): React.JSX.Element {
  return (
    <div style={viewerStyles.header}>
      <span className="mono" style={viewerStyles.headerText}>
        {mode === 'diff' ? 'Changes' : 'No file selected'}
      </span>
      {onClose && (
        <>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={viewerStyles.closeButton} title="Close Editor">{'\u00D7'}</button>
        </>
      )}
    </div>
  )
}

interface TabBarProps {
  openFiles: OpenFile[]
  activeFilePath: string | null
  mode: ViewMode
  onSelectTab: (filePath: string) => void
  onCloseTab: (filePath: string) => void
  onShowDiff: () => void
  showPreviewToggle: boolean
  previewActive: boolean
  onTogglePreview: () => void
  onClose?: () => void
}

function TabBar({
  openFiles, activeFilePath, mode,
  onSelectTab, onCloseTab, onShowDiff,
  showPreviewToggle, previewActive, onTogglePreview, onClose,
}: TabBarProps): React.JSX.Element {
  return (
    <div style={viewerStyles.tabBar}>
      <button
        style={{ ...viewerStyles.tab, ...(mode === 'diff' ? viewerStyles.tabActive : {}) }}
        onClick={onShowDiff}
      >
        Changes
      </button>
      {openFiles.map((file) => (
        <FileTab
          key={file.path} file={file}
          isActive={mode === 'file' && file.path === activeFilePath}
          onSelect={onSelectTab} onClose={onCloseTab}
        />
      ))}
      {showPreviewToggle && (
        <button
          style={{ ...viewerStyles.previewToggle, ...(previewActive ? viewerStyles.previewToggleActive : {}) }}
          onClick={onTogglePreview}
          title={previewActive ? 'Show editor' : 'Show preview'}
        >
          {previewActive ? 'Editor' : 'Preview'}
        </button>
      )}
      {onClose && (
        <>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={viewerStyles.closeButton} title="Close Editor">{'\u00D7'}</button>
        </>
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
  mode: ViewMode
  fileDiffs: FileDiff[]
  fileContent: string | null
  language: string
  monacoTheme: string
  onMount?: OnMount
  onSelectDiffFile?: (relativePath: string) => void
}

const LINE_HEIGHT = 19
const EDITOR_PADDING = 8

function EditorContent({
  mode, fileDiffs, fileContent, language, monacoTheme, onMount, onSelectDiffFile,
}: EditorContentProps): React.JSX.Element {
  if (mode === 'diff' && fileDiffs.length === 1) {
    return <SingleFileDiff fileDiff={fileDiffs[0]} monacoTheme={monacoTheme} onSelectFile={onSelectDiffFile} />
  }
  if (mode === 'diff' && fileDiffs.length > 1) {
    return (
      <div style={viewerStyles.diffScroller}>
        {fileDiffs.map((fd) => (
          <FileDiffSection key={fd.filePath} fileDiff={fd} monacoTheme={monacoTheme} onSelectFile={onSelectDiffFile} />
        ))}
      </div>
    )
  }
  if (mode === 'file' && fileContent !== null) {
    return <Editor value={fileContent} language={language} theme={monacoTheme} options={EDITABLE_OPTIONS} onMount={onMount} />
  }
  return (
    <div style={viewerStyles.empty}>
      {mode === 'diff' ? 'No changes to display' : 'Select a file to view its contents'}
    </div>
  )
}

function FileDiffSection({
  fileDiff, monacoTheme, onSelectFile,
}: {
  fileDiff: FileDiff; monacoTheme: string; onSelectFile?: (relativePath: string) => void
}): React.JSX.Element {
  const editorHeight = Math.max(fileDiff.lineCount * LINE_HEIGHT + EDITOR_PADDING, 60)
  return (
    <div style={viewerStyles.fileDiffSection}>
      <DiffFileHeader filePath={fileDiff.filePath} onSelectFile={onSelectFile} />
      <div style={{ height: editorHeight }}>
        <DiffEditor
          original={fileDiff.original} modified={fileDiff.modified}
          language={extensionToLanguage(fileDiff.filePath)} theme={monacoTheme}
          options={{ ...READONLY_OPTIONS, renderSideBySide: false }}
        />
      </div>
    </div>
  )
}

function DiffFileHeader({
  filePath, onSelectFile,
}: {
  filePath: string; onSelectFile?: (relativePath: string) => void
}): React.JSX.Element {
  return (
    <div style={viewerStyles.fileDiffHeader}>
      <span style={viewerStyles.fileDiffPath} onClick={() => onSelectFile?.(filePath)} role="button" tabIndex={0}>
        {filePath}
      </span>
    </div>
  )
}

function SingleFileDiff({
  fileDiff, monacoTheme, onSelectFile,
}: {
  fileDiff: FileDiff; monacoTheme: string; onSelectFile?: (relativePath: string) => void
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <DiffFileHeader filePath={fileDiff.filePath} onSelectFile={onSelectFile} />
      <div style={{ flex: 1 }}>
        <DiffEditor
          original={fileDiff.original} modified={fileDiff.modified}
          language={extensionToLanguage(fileDiff.filePath)} theme={monacoTheme}
          options={{ ...READONLY_OPTIONS, renderSideBySide: false }}
        />
      </div>
    </div>
  )
}
