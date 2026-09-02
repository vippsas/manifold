import { describe, it, expect } from 'vitest'
import type { FileChange } from '../../../shared/types'
import { buildScmTree, pathsUnder, type ScmTreeDir } from './scm-file-tree'

function changes(...paths: string[]): FileChange[] {
  return paths.map((path) => ({ path, type: 'modified' as const }))
}

describe('buildScmTree', () => {
  it('nests files under their directories', () => {
    const [dir] = buildScmTree(changes('src/a.ts', 'src/b.ts')) as [ScmTreeDir]
    expect(dir.kind).toBe('dir')
    expect(dir.label).toBe('src')
    expect(dir.children.map((c) => (c.kind === 'file' ? c.change.path : c.label))).toEqual([
      'src/a.ts',
      'src/b.ts',
    ])
  })

  it('keeps a checkout-root file at the top level', () => {
    const nodes = buildScmTree(changes('README.md'))
    expect(nodes).toHaveLength(1)
    expect(nodes[0].kind).toBe('file')
  })

  it('compresses a chain of single-child directories into one row', () => {
    const [dir] = buildScmTree(changes('src/components/git/Panel.tsx')) as [ScmTreeDir]
    expect(dir.label).toBe('src/components/git')
    expect(dir.path).toBe('src/components/git')
    expect(dir.children).toHaveLength(1)
  })

  it('stops compressing where the tree actually branches', () => {
    const [dir] = buildScmTree(changes('src/git/a.ts', 'src/scm/b.ts')) as [ScmTreeDir]
    expect(dir.label).toBe('src')
    expect(dir.children.map((c) => (c.kind === 'dir' ? c.label : c.change.path))).toEqual(['git', 'scm'])
  })

  it('stops compressing at a directory that holds files of its own', () => {
    const [dir] = buildScmTree(changes('src/index.ts', 'src/git/a.ts')) as [ScmTreeDir]
    expect(dir.label).toBe('src')
    expect(dir.children.map((c) => (c.kind === 'dir' ? c.label : c.change.path))).toEqual([
      'git',
      'src/index.ts',
    ])
  })

  it('orders directories before files, each alphabetically', () => {
    const nodes = buildScmTree(changes('z.md', 'a.md', 'src/x.ts'))
    expect(nodes.map((n) => (n.kind === 'dir' ? n.label : n.change.path))).toEqual(['src', 'a.md', 'z.md'])
  })
})

describe('pathsUnder', () => {
  it('collects every file below a directory, however deep', () => {
    const [dir] = buildScmTree(changes('src/a.ts', 'src/git/b.ts', 'src/git/deep/c.ts'))
    expect(pathsUnder(dir).sort()).toEqual(['src/a.ts', 'src/git/b.ts', 'src/git/deep/c.ts'])
  })
})
