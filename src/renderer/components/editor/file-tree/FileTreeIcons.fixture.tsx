// Fixture for `npm run screenshot:component FileTreeIcons --theme <id>`: a slice of the file tree
// covering every icon lookup path (exact file name, extension, detected language, default) plus a
// directory chevron and an active row, so icon colours can be eyeballed per theme.
import React from 'react'
import type { FileTreeNode } from '../../../../shared/types'
import { NodeRow } from './tree-node-row'
import { treeStyles } from './FileTree.styles'

const NAMES = [
  'src/', 'index.ts', 'App.tsx', 'main.js', 'styles.css', 'index.html', 'schema.graphql',
  'main.py', 'server.go', 'lib.rs', 'Main.java', 'Program.cs', 'app.rb', 'vector.cpp',
  'package.json', 'tsconfig.json', 'vite.config.ts', 'yarn.lock', '.env.local', '.gitignore',
  'Dockerfile', 'docker-compose.yml', 'Makefile', 'config.yml', 'Cargo.toml',
  'README.md', 'LICENSE', 'notes.txt', 'query.sql', 'script.sh', 'logo.svg', 'screenshot.png',
  'archive.zip', 'notebook.ipynb', 'component.spec.ts', 'mystery.qqq',
]

function node(name: string): FileTreeNode {
  const isDirectory = name.endsWith('/')
  const bare = isDirectory ? name.slice(0, -1) : name
  return { name: bare, path: `/repo/${bare}`, isDirectory }
}

const noop = (): void => {}

export default (
  <div style={{ ...treeStyles.wrapper, width: 300, height: 'auto' }}>
    <div style={treeStyles.treeContainer}>
      {NAMES.map((name) => (
        <NodeRow
          key={name}
          node={node(name)}
          depth={name.endsWith('/') ? 0 : 1}
          expanded={name.endsWith('/')}
          isActive={name === 'App.tsx'}
          isSelected={false}
          changeType={null}
          worktreeDirty={false}
          onClick={noop}
          onDoubleClick={noop}
          isRenaming={false}
          renameValue=""
          onRenameValueChange={noop}
          onConfirmRename={noop}
          onCancelRename={noop}
        />
      ))}
    </div>
  </div>
)
