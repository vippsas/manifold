import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { OpenFile } from '../hooks/useCodeView'
import { viewerStyles } from './CodeViewer.styles'
import { extensionToLanguage, isMarkdownFile, fileName } from './code-viewer-utils'

interface CodeViewerProps {
  fileDiffText: string | null
  openFiles: OpenFile[]
  activeFilePath: string | null
  fileContent: string | null
  theme: string
  worktreeRoot: string | null
  onSelectTab: (filePath: string) => void
  onCloseTab: (filePath: string) => void
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

const EDITABLE_OPTIONS = { ...BASE_EDITOR_OPTIONS, readOnly: false }

export function CodeViewer({
  fileDiffText, openFiles, activeFilePath, fileContent, theme,
  worktreeRoot, onSelectTab, onCloseTab, onSaveFile, onClose,
}: CodeViewerProps): React.JSX.Element {
  const monacoTheme = theme
  const language = useMemo(() => extensionToLanguage(activeFilePath), [activeFilePath])
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

  const hasTabs = openFiles.length > 0
  const showPreviewToggle = hasTabs && isMd

  return (
    <div style={viewerStyles.wrapper}>
      {hasTabs ? (
        <TabBar
          openFiles={openFiles} activeFilePath={activeFilePath}
          onSelectTab={onSelectTab} onCloseTab={onCloseTab}
          showPreviewToggle={showPreviewToggle} previewActive={previewActive}
          onTogglePreview={() => setPreviewActive((p) => !p)} onClose={onClose}
        />
      ) : (
        <NoTabsHeader onClose={onClose} />
      )}
      <div style={viewerStyles.editorContainer}>
        {previewActive && fileContent !== null ? (
          <div className="markdown-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
          </div>
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

function NoTabsHeader({ onClose }: { onClose?: () => void }): React.JSX.Element {
  return (
    <div style={viewerStyles.header}>
      <span className="mono" style={viewerStyles.headerText}>
        No file selected
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
  onSelectTab: (filePath: string) => void
  onCloseTab: (filePath: string) => void
  showPreviewToggle: boolean
  previewActive: boolean
  onTogglePreview: () => void
  onClose?: () => void
}

function TabBar({
  openFiles, activeFilePath,
  onSelectTab, onCloseTab,
  showPreviewToggle, previewActive, onTogglePreview, onClose,
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
