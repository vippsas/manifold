// Screenshot fixture for the file tree rows — one glyph column (chevron for
// directories, type icon for files) with names in a single aligned column.
// `npm run screenshot:component FileTree`.
import React from 'react'
import type { FileTreeNode } from '../../../../shared/types'
import { FileTree } from './FileTree'

const dir = (name: string, children: FileTreeNode[] = []): FileTreeNode => ({
  name, path: `/repo/${name}`, isDirectory: true, children,
})
const file = (name: string, parent = '/repo'): FileTreeNode => ({
  name, path: `${parent}/${name}`, isDirectory: false,
})

const tree: FileTreeNode = {
  name: 'manifold-2',
  path: '/repo',
  isDirectory: true,
  children: [
    dir('docs'),
    dir('scripts'),
    { ...dir('src'), children: [
      { name: 'main', path: '/repo/src/main', isDirectory: true, children: [] },
      { name: 'renderer', path: '/repo/src/renderer', isDirectory: true, children: [] },
      file('index.ts', '/repo/src'),
    ] },
    dir('test'),
    file('AGENTS.md'),
    file('CLAUDE.md'),
    file('electron.vite.config.ts'),
    file('install.sh'),
    file('package.json'),
    file('README.md'),
  ],
}

export default (
  <div style={{ width: 260, height: 420, background: 'var(--bg-primary)' }}>
    <FileTree
      tree={tree}
      changes={[{ path: 'AGENTS.md', type: 'modified' }]}
      activeFilePath="/repo/package.json"
      openFilePaths={new Set(['/repo/package.json'])}
      expandedPaths={new Set(['/repo', '/repo/src'])}
      onToggleExpand={() => {}}
      onSelectFile={() => {}}
    />
  </div>
)
