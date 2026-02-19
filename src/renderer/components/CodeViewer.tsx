import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import Editor, { DiffEditor, type OnMount } from '@monaco-editor/react'
import type { editor as monacoEditor } from 'monaco-editor'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { OpenFile } from '../hooks/useCodeView'

type ViewMode = 'diff' | 'file'

interface CodeViewerProps {
  mode: ViewMode
  diff: string
  openFiles: OpenFile[]
  activeFilePath: string | null
  fileContent: string | null
  theme: 'dark' | 'light'
  onSelectTab: (filePath: string) => void
  onCloseTab: (filePath: string) => void
  onShowDiff: () => void
  onSaveFile?: (content: string) => void
}

function isMarkdownFile(filePath: string | null): boolean {
  if (!filePath) return false
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'md' || ext === 'mdx' || ext === 'markdown'
}

function extensionToLanguage(filePath: string | null): string {
  if (!filePath) return 'plaintext'
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    xml: 'xml',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    sql: 'sql',
    graphql: 'graphql',
    dockerfile: 'dockerfile',
    makefile: 'plaintext',
    gitignore: 'plaintext',
  }
  return languageMap[ext] ?? 'plaintext'
}

function parseDiffSides(diffText: string): { original: string; modified: string } {
  const lines = diffText.split('\n')
  const originalLines: string[] = []
  const modifiedLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) {
      continue
    }
    if (line.startsWith('diff ') || line.startsWith('index ')) {
      continue
    }
    if (line.startsWith('-')) {
      originalLines.push(line.slice(1))
    } else if (line.startsWith('+')) {
      modifiedLines.push(line.slice(1))
    } else {
      const content = line.startsWith(' ') ? line.slice(1) : line
      originalLines.push(content)
      modifiedLines.push(content)
    }
  }

  return {
    original: originalLines.join('\n'),
    modified: modifiedLines.join('\n'),
  }
}

function fileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
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
  mode,
  diff,
  openFiles,
  activeFilePath,
  fileContent,
  theme,
  onSelectTab,
  onCloseTab,
  onShowDiff,
  onSaveFile,
}: CodeViewerProps): React.JSX.Element {
  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs'
  const language = useMemo(() => extensionToLanguage(activeFilePath), [activeFilePath])
  const diffSides = useMemo(() => parseDiffSides(diff), [diff])
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null)
  const saveRef = useRef(onSaveFile)
  const [previewActive, setPreviewActive] = useState(false)

  const isMd = isMarkdownFile(activeFilePath)

  // Reset preview when switching away from a markdown file
  useEffect(() => {
    if (!isMd) setPreviewActive(false)
  }, [isMd])

  useEffect(() => {
    saveRef.current = onSaveFile
  }, [onSaveFile])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current?.(editor.getValue())
    })
  }, [])

  const hasTabs = openFiles.length > 0
  const showPreviewToggle = hasTabs && mode === 'file' && isMd

  return (
    <div style={viewerStyles.wrapper}>
      {hasTabs && (
        <TabBar
          openFiles={openFiles}
          activeFilePath={activeFilePath}
          mode={mode}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onShowDiff={onShowDiff}
          showPreviewToggle={showPreviewToggle}
          previewActive={previewActive}
          onTogglePreview={() => setPreviewActive((p) => !p)}
        />
      )}
      {!hasTabs && (
        <div style={viewerStyles.header}>
          <span className="mono" style={viewerStyles.headerText}>
            {mode === 'diff' ? 'Changes' : 'No file selected'}
          </span>
        </div>
      )}
      <div style={viewerStyles.editorContainer}>
        {previewActive && fileContent !== null ? (
          <div className="markdown-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{fileContent}</ReactMarkdown>
          </div>
        ) : (
          <EditorContent
            mode={mode}
            diff={diff}
            diffSides={diffSides}
            fileContent={fileContent}
            language={language}
            monacoTheme={monacoTheme}
            onMount={handleEditorMount}
          />
        )}
      </div>
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
}

function TabBar({
  openFiles,
  activeFilePath,
  mode,
  onSelectTab,
  onCloseTab,
  onShowDiff,
  showPreviewToggle,
  previewActive,
  onTogglePreview,
}: TabBarProps): React.JSX.Element {
  return (
    <div style={viewerStyles.tabBar}>
      <button
        style={{
          ...viewerStyles.tab,
          ...(mode === 'diff' ? viewerStyles.tabActive : {}),
        }}
        onClick={onShowDiff}
      >
        Changes
      </button>
      {openFiles.map((file) => {
        const isActive = mode === 'file' && file.path === activeFilePath
        return (
          <div
            key={file.path}
            style={{
              ...viewerStyles.tab,
              ...(isActive ? viewerStyles.tabActive : {}),
            }}
            title={file.path}
          >
            <button
              style={viewerStyles.tabLabel}
              onClick={() => onSelectTab(file.path)}
            >
              {fileName(file.path)}
            </button>
            <button
              style={viewerStyles.tabClose}
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(file.path)
              }}
              title="Close"
            >
              {'\u00D7'}
            </button>
          </div>
        )
      })}
      {showPreviewToggle && (
        <button
          style={{
            ...viewerStyles.previewToggle,
            ...(previewActive ? viewerStyles.previewToggleActive : {}),
          }}
          onClick={onTogglePreview}
          title={previewActive ? 'Show editor' : 'Show preview'}
        >
          {previewActive ? 'Editor' : 'Preview'}
        </button>
      )}
    </div>
  )
}

interface EditorContentProps {
  mode: ViewMode
  diff: string
  diffSides: { original: string; modified: string }
  fileContent: string | null
  language: string
  monacoTheme: string
  onMount?: OnMount
}

function EditorContent({
  mode,
  diff,
  diffSides,
  fileContent,
  language,
  monacoTheme,
  onMount,
}: EditorContentProps): React.JSX.Element {
  if (mode === 'diff' && diff) {
    return (
      <DiffEditor
        original={diffSides.original}
        modified={diffSides.modified}
        language="plaintext"
        theme={monacoTheme}
        options={{ ...READONLY_OPTIONS, renderSideBySide: false }}
      />
    )
  }

  if (mode === 'file' && fileContent !== null) {
    return (
      <Editor
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
      {mode === 'diff' ? 'No changes to display' : 'Select a file to view its contents'}
    </div>
  )
}

const viewerStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  headerText: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
    gap: 0,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    fontSize: '11px',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  tabActive: {
    color: 'var(--text-primary)',
    background: 'var(--bg-primary)',
  },
  tabLabel: {
    padding: 0,
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    color: 'inherit',
  },
  tabClose: {
    padding: '0 2px',
    fontSize: '14px',
    lineHeight: 1,
    color: 'var(--text-muted)',
    borderRadius: '3px',
  },
  previewToggle: {
    marginLeft: 'auto',
    padding: '2px 8px',
    fontSize: '10px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    borderRadius: '3px',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    marginRight: '4px',
  },
  previewToggleActive: {
    color: 'var(--accent)',
    borderColor: 'var(--accent)',
  },
  editorContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
}
