import React, { useCallback, useMemo, useState } from 'react'
import type { FileTreeNode, FileChange, FileChangeType } from '../../shared/types'

// Devicon SVG imports — import raw SVG content for inline rendering
const iconModules = import.meta.glob<string>('../assets/devicons/*.svg', { eager: true, query: '?raw', import: 'default' })

const deviconSvgs: Record<string, string> = {}
for (const [path, svg] of Object.entries(iconModules)) {
  const name = path.split('/').pop()?.replace('.svg', '') ?? ''
  deviconSvgs[name] = svg
}

const EXT_TO_ICON: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', pyw: 'python', pyi: 'python',
  java: 'java', jar: 'java',
  cs: 'csharp',
  cpp: 'cplusplus', cc: 'cplusplus', cxx: 'cplusplus', hpp: 'cplusplus', hxx: 'cplusplus',
  c: 'c', h: 'c',
  go: 'go',
  rs: 'rust',
  rb: 'ruby', erb: 'ruby', gemspec: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  html: 'html5', htm: 'html5',
  css: 'css3',
  scss: 'sass', sass: 'sass',
  graphql: 'graphql', gql: 'graphql',
  lua: 'lua',
  dart: 'dart',
  ex: 'elixir', exs: 'elixir',
  hs: 'haskell', lhs: 'haskell',
  scala: 'scala', sc: 'scala',
  clj: 'clojure', cljs: 'clojure', cljc: 'clojure', edn: 'clojure',
  json: 'json',
  xml: 'xml', xsl: 'xml', xslt: 'xml',
  yaml: 'yaml', yml: 'yaml',
  md: 'markdown', mdx: 'markdown',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'postgresql',
}

const FILENAME_TO_ICON: Record<string, string> = {
  'Dockerfile': 'docker',
  'docker-compose.yml': 'docker',
  'docker-compose.yaml': 'docker',
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.gitmodules': 'git',
  '.gitkeep': 'git',
  '.gitconfig': 'git',
  '.dockerignore': 'docker',
  '.editorconfig': 'eslint',
  '.prettierrc': 'eslint',
  '.prettierrc.json': 'eslint',
  '.prettierignore': 'eslint',
  'tsconfig.json': 'typescript',
  'tsconfig.node.json': 'typescript',
  'tsconfig.web.json': 'typescript',
  '.artifactignore': 'azure',
  'azure-pipelines.yml': 'azure',
  'azure-pipelines.yaml': 'azure',
  'package.json': 'nodejs',
  'package-lock.json': 'npm',
  '.npmrc': 'npm',
  'yarn.lock': 'yarn',
  '.yarnrc': 'yarn',
  'webpack.config.js': 'webpack',
  'webpack.config.ts': 'webpack',
  'vite.config.ts': 'vite',
  'vite.config.js': 'vite',
  'tailwind.config.js': 'tailwindcss',
  'tailwind.config.ts': 'tailwindcss',
  '.eslintrc': 'eslint',
  '.eslintrc.js': 'eslint',
  '.eslintrc.json': 'eslint',
  'eslint.config.js': 'eslint',
  'eslint.config.mjs': 'eslint',
  'jest.config.js': 'jest',
  'jest.config.ts': 'jest',
  'vitest.config.ts': 'vitest',
  'vitest.config.js': 'vitest',
  'firebase.json': 'firebase',
  '.firebaserc': 'firebase',
  'go.mod': 'go',
  'go.sum': 'go',
  'Makefile': 'bash',
  'makefile': 'bash',
  'Gemfile': 'ruby',
  'Rakefile': 'ruby',
}

// Icons that use dark fills and need currentColor to be visible in dark mode
const CURRENT_COLOR_ICONS = new Set(['apple', 'markdown', 'rust', 'github', 'bash'])

function getFileIconSvg(filename: string): string | null {
  // Check exact filename match first
  let iconName = FILENAME_TO_ICON[filename]

  // Then check extension
  if (!iconName) {
    const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : null
    if (ext) iconName = EXT_TO_ICON[ext]
  }

  if (!iconName || !deviconSvgs[iconName]) return null

  let svg = deviconSvgs[iconName]
  if (CURRENT_COLOR_ICONS.has(iconName)) {
    svg = svg.replace(/fill="[^"]*"/g, 'fill="currentColor"')
    // For SVGs with no fill attributes on paths (defaults to black), set fill on the root <svg>
    svg = svg.replace('<svg ', '<svg fill="currentColor" ')
  }

  return svg
}

interface FileTreeProps {
  tree: FileTreeNode | null
  changes: FileChange[]
  activeFilePath: string | null
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onSelectFile: (path: string) => void
  onDeleteFile?: (path: string) => void
  onRenameFile?: (oldPath: string, newPath: string) => void
  onClose?: () => void
}

const CHANGE_INDICATORS: Record<FileChangeType, { color: string; label: string }> = {
  modified: { color: 'var(--warning)', label: 'M' },
  added: { color: 'var(--success)', label: 'A' },
  deleted: { color: 'var(--error)', label: 'D' },
}

export function FileTree({
  tree,
  changes,
  activeFilePath,
  expandedPaths,
  onToggleExpand,
  onSelectFile,
  onDeleteFile,
  onRenameFile,
  onClose,
}: FileTreeProps): React.JSX.Element {
  const [pendingDelete, setPendingDelete] = useState<{ path: string; name: string; isDirectory: boolean } | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const changeMap = useMemo(() => {
    const map = new Map<string, FileChangeType>()
    const root = tree?.path ?? ''
    for (const change of changes) {
      // Resolve relative change paths against tree root to match absolute node paths
      const absPath = root ? `${root.replace(/\/$/, '')}/${change.path}` : change.path
      map.set(absPath, change.type)
    }
    return map
  }, [changes, tree?.path])

  const handleStartRename = useCallback((path: string, name: string): void => {
    setRenamingPath(path)
    setRenameValue(name)
  }, [])

  const handleConfirmRename = useCallback((nodePath: string, oldName: string): void => {
    const trimmed = renameValue.trim()
    if (
      !trimmed ||
      trimmed === oldName ||
      trimmed.includes('/') ||
      trimmed.includes('\0')
    ) {
      setRenamingPath(null)
      return
    }
    if (onRenameFile) {
      const parentDir = nodePath.substring(0, nodePath.length - oldName.length)
      const newPath = parentDir + trimmed
      onRenameFile(nodePath, newPath)
    }
    setRenamingPath(null)
  }, [renameValue, onRenameFile])

  const handleCancelRename = useCallback((): void => {
    setRenamingPath(null)
  }, [])

  const handleRequestDelete = useCallback((path: string, name: string, isDirectory: boolean): void => {
    setPendingDelete({ path, name, isDirectory })
  }, [])

  const handleConfirmDelete = useCallback((): void => {
    if (pendingDelete && onDeleteFile) {
      onDeleteFile(pendingDelete.path)
    }
    setPendingDelete(null)
  }, [pendingDelete, onDeleteFile])

  const handleCancelDelete = useCallback((): void => {
    setPendingDelete(null)
  }, [])

  return (
    <div style={treeStyles.wrapper}>
      <div style={treeStyles.header}>
        <span style={treeStyles.headerTitle}>Files</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {changes.length > 0 && (
            <span style={treeStyles.changesButton}>
              {changes.length} changed
            </span>
          )}
          {onClose && (
            <button onClick={onClose} style={treeStyles.closeButton} title="Close Files">
              ×
            </button>
          )}
        </span>
      </div>
      <div style={treeStyles.treeContainer}>
        {tree ? (
          <TreeNode
            node={tree}
            depth={0}
            changeMap={changeMap}
            activeFilePath={activeFilePath}
            expandedPaths={expandedPaths}
            onToggleExpand={onToggleExpand}
            onSelectFile={onSelectFile}
            onRequestDelete={onDeleteFile ? handleRequestDelete : undefined}
            renamingPath={renamingPath}
            renameValue={renameValue}
            onRenameValueChange={setRenameValue}
            onStartRename={onRenameFile ? handleStartRename : undefined}
            onConfirmRename={handleConfirmRename}
            onCancelRename={handleCancelRename}
          />
        ) : (
          <div style={treeStyles.empty}>No files to display</div>
        )}
      </div>

      {pendingDelete && (
        <div style={treeStyles.dialogOverlay} onClick={handleCancelDelete}>
          <div style={treeStyles.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={treeStyles.dialogTitle}>
              Delete {pendingDelete.isDirectory ? 'folder' : 'file'}
            </div>
            <div style={treeStyles.dialogMessage}>
              Are you sure you want to delete <strong>{pendingDelete.name}</strong>?
              {pendingDelete.isDirectory && ' This will delete all contents.'}
            </div>
            <div style={treeStyles.dialogActions}>
              <button style={treeStyles.dialogCancel} onClick={handleCancelDelete}>Cancel</button>
              <button style={treeStyles.dialogConfirm} onClick={handleConfirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface TreeNodeProps {
  node: FileTreeNode
  depth: number
  changeMap: Map<string, FileChangeType>
  activeFilePath: string | null
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  onSelectFile: (path: string) => void
  onRequestDelete?: (path: string, name: string, isDirectory: boolean) => void
  renamingPath: string | null
  renameValue: string
  onRenameValueChange: (value: string) => void
  onStartRename?: (path: string, name: string) => void
  onConfirmRename: (nodePath: string, oldName: string) => void
  onCancelRename: () => void
}

function TreeNode({
  node,
  depth,
  changeMap,
  activeFilePath,
  expandedPaths,
  onToggleExpand,
  onSelectFile,
  onRequestDelete,
  renamingPath,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onConfirmRename,
  onCancelRename,
}: TreeNodeProps): React.JSX.Element {
  const expanded = expandedPaths.has(node.path)

  const handleToggle = useCallback((): void => {
    if (node.isDirectory) {
      onToggleExpand(node.path)
    } else {
      onSelectFile(node.path)
    }
  }, [node.isDirectory, node.path, onToggleExpand, onSelectFile])

  const handleDelete = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation()
    onRequestDelete?.(node.path, node.name, node.isDirectory)
  }, [node.path, node.name, node.isDirectory, onRequestDelete])

  const changeType = changeMap.get(node.path)

  return (
    <>
      <NodeRow
        node={node}
        depth={depth}
        expanded={expanded}
        isActive={!node.isDirectory && node.path === activeFilePath}
        changeType={changeType ?? null}
        onToggle={handleToggle}
        onDelete={onRequestDelete ? handleDelete : undefined}
        isRenaming={renamingPath === node.path}
        renameValue={renameValue}
        onRenameValueChange={onRenameValueChange}
        onStartRename={onStartRename}
        onConfirmRename={onConfirmRename}
        onCancelRename={onCancelRename}
      />
      {node.isDirectory && expanded && node.children && (
        <>
          {sortChildren(node.children).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              changeMap={changeMap}
              activeFilePath={activeFilePath}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              onSelectFile={onSelectFile}
              onRequestDelete={onRequestDelete}
              renamingPath={renamingPath}
              renameValue={renameValue}
              onRenameValueChange={onRenameValueChange}
              onStartRename={onStartRename}
              onConfirmRename={onConfirmRename}
              onCancelRename={onCancelRename}
            />
          ))}
        </>
      )}
    </>
  )
}

// Inline SVG chevron for directory expand/collapse
const CHEVRON_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4"/></svg>'

function NodeRow({
  node,
  depth,
  expanded,
  isActive,
  changeType,
  onToggle,
  onDelete,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onConfirmRename,
  onCancelRename,
}: {
  node: FileTreeNode
  depth: number
  expanded: boolean
  isActive: boolean
  changeType: FileChangeType | null
  onToggle: () => void
  onDelete?: (e: React.MouseEvent) => void
  isRenaming: boolean
  renameValue: string
  onRenameValueChange: (value: string) => void
  onStartRename?: (path: string, name: string) => void
  onConfirmRename: (nodePath: string, oldName: string) => void
  onCancelRename: () => void
}): React.JSX.Element {
  const indicator = changeType ? CHANGE_INDICATORS[changeType] : null
  const indent = depth * 8

  const handleDoubleClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation()
    onStartRename?.(node.path, node.name)
  }, [node.path, node.name, onStartRename])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      onConfirmRename(node.path, node.name)
    } else if (e.key === 'Escape') {
      onCancelRename()
    }
  }, [node.path, node.name, onConfirmRename, onCancelRename])

  const handleInputClick = useCallback((e: React.MouseEvent): void => {
    e.stopPropagation()
  }, [])

  return (
    <div
      className={`file-tree-row${isActive ? ' file-tree-row--active' : ''}`}
      onClick={onToggle}
      style={{
        ...treeStyles.node,
        paddingLeft: `${indent + 4}px`,
      }}
      role="button"
      tabIndex={0}
      title={node.path}
    >
      {/* Indent guides */}
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          style={{
            position: 'absolute' as const,
            left: `${i * 8 + 12}px`,
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'var(--tree-indent-guide)',
            opacity: 0.4,
          }}
        />
      ))}
      {/* Chevron (directories) or spacer (files) */}
      {node.isDirectory ? (
        <span
          style={{
            ...treeStyles.chevron,
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
          dangerouslySetInnerHTML={{ __html: CHEVRON_SVG }}
        />
      ) : (
        <span style={treeStyles.chevronSpacer} />
      )}
      {/* File/folder icon */}
      {node.isDirectory ? (
        <span style={treeStyles.fileIcon}>{expanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1'}</span>
      ) : (
        (() => {
          const svg = getFileIconSvg(node.name)
          return svg
            ? <span style={treeStyles.fileIconImg} dangerouslySetInnerHTML={{ __html: svg }} />
            : <span style={treeStyles.fileIcon}>{'\uD83D\uDCC4'}</span>
        })()
      )}
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={() => onCancelRename()}
          onClick={handleInputClick}
          style={treeStyles.renameInput}
        />
      ) : (
        <span
          className="truncate"
          style={{ ...treeStyles.nodeName, fontWeight: node.isDirectory ? 600 : 400 }}
          onDoubleClick={onStartRename ? handleDoubleClick : undefined}
        >
          {node.name}
        </span>
      )}
      {!isRenaming && indicator && (
        <span style={{ ...treeStyles.indicator, color: indicator.color }} title={changeType ?? undefined}>
          {indicator.label}
        </span>
      )}
      {!isRenaming && onDelete && (
        <span
          className="file-tree-delete-btn"
          onClick={onDelete}
          style={treeStyles.deleteButton}
          title="Delete"
          role="button"
          tabIndex={-1}
        >
          {'\uD83D\uDDD1'}
        </span>
      )}
    </div>
  )
}

function sortChildren(children: FileTreeNode[]): FileTreeNode[] {
  return [...children].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })
}

const treeStyles: Record<string, React.CSSProperties> = {
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
    justifyContent: 'space-between',
    padding: '4px 8px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  changesButton: {
    fontSize: '10px',
    color: 'var(--accent)',
    padding: '1px 6px',
    borderRadius: '8px',
    background: 'rgba(79, 195, 247, 0.12)',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    borderRadius: '3px',
    color: 'var(--text-muted)',
    fontSize: '14px',
    lineHeight: 1,
    cursor: 'pointer',
  },
  treeContainer: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '2px 0',
  },
  node: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    height: '22px',
    paddingRight: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontFamily: 'var(--font-sans)',
    lineHeight: '22px',
    color: 'var(--text-primary)',
  },
  chevron: {
    width: '16px',
    height: '16px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.1s ease',
    color: 'var(--text-secondary)',
  },
  chevronSpacer: {
    width: '16px',
    flexShrink: 0,
  },
  fileIcon: {
    width: '16px',
    fontSize: '14px',
    flexShrink: 0,
    textAlign: 'center' as const,
    lineHeight: '16px',
  },
  fileIconImg: {
    width: '16px',
    height: '16px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeName: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--font-sans)',
    fontSize: '13px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  indicator: {
    flexShrink: 0,
    fontSize: '11px',
    fontWeight: 600,
    marginLeft: 'auto',
  },
  deleteButton: {
    flexShrink: 0,
    fontSize: '12px',
    marginLeft: '4px',
    cursor: 'pointer',
    padding: '0 2px',
    borderRadius: '3px',
  },
  renameInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    padding: '0 4px',
    border: '1px solid var(--accent)',
    borderRadius: '3px',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    outline: 'none',
    lineHeight: '18px',
  },
  dialogOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  dialog: {
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '16px',
    maxWidth: '300px',
    width: '90%',
  },
  dialogTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '8px',
  },
  dialogMessage: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
    marginBottom: '16px',
  },
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  dialogCancel: {
    fontSize: '12px',
    padding: '4px 12px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  dialogConfirm: {
    fontSize: '12px',
    padding: '4px 12px',
    borderRadius: '4px',
    border: 'none',
    background: 'var(--error)',
    color: '#fff',
    cursor: 'pointer',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
}
