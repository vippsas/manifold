import { describe, it, expect } from 'vitest'
import type { FileTreeNode } from '../../../../shared/types'
import { flattenVisible, buildVisibleNodes, fuzzyMatch } from './file-tree-visible'

function dir(name: string, path: string, children: FileTreeNode[]): FileTreeNode {
  return { name, path, isDirectory: true, children }
}
function file(name: string, path: string): FileTreeNode {
  return { name, path, isDirectory: false }
}

describe('fuzzyMatch', () => {
  it('returns matched indices for a subsequence', () => {
    expect(fuzzyMatch('FileTree.tsx', 'ftt')).toEqual([0, 4, 9])
  })

  it('is case-insensitive', () => {
    expect(fuzzyMatch('README.md', 'rm')).toEqual([0, 4])
  })

  it('returns null when not a subsequence', () => {
    expect(fuzzyMatch('index.ts', 'xyz')).toBeNull()
  })

  it('matches everything with an empty query', () => {
    expect(fuzzyMatch('anything', '')).toEqual([])
  })
})

describe('flattenVisible', () => {
  const tree = dir('root', '/root', [
    dir('src', '/root/src', [file('a.ts', '/root/src/a.ts')]),
    file('z.ts', '/root/z.ts'),
  ])

  it('descends only into expanded directories, folders first', () => {
    const collapsed = flattenVisible(tree, new Set(['/root'])).map((v) => v.node.path)
    expect(collapsed).toEqual(['/root', '/root/src', '/root/z.ts'])
  })

  it('includes children of expanded directories with correct depth', () => {
    const expanded = flattenVisible(tree, new Set(['/root', '/root/src']))
    expect(expanded.map((v) => [v.node.path, v.depth])).toEqual([
      ['/root', 0],
      ['/root/src', 1],
      ['/root/src/a.ts', 2],
      ['/root/z.ts', 1],
    ])
  })

  it('records the parent path for navigation', () => {
    const expanded = flattenVisible(tree, new Set(['/root', '/root/src']))
    const child = expanded.find((v) => v.node.path === '/root/src/a.ts')
    expect(child?.parentPath).toBe('/root/src')
  })
})

describe('buildVisibleNodes', () => {
  it('walks primary then additional roots in order', () => {
    const primary = dir('app', '/app', [file('main.ts', '/app/main.ts')])
    const additional = new Map([['/lib', dir('lib', '/lib', [file('util.ts', '/lib/util.ts')])]])
    const order = buildVisibleNodes({
      primary,
      additional,
      flattenRoots: false,
      hasHeaderedRoots: true,
      expandedPaths: new Set(['/app', '/lib']),
    }).map((v) => v.node.path)
    expect(order).toEqual(['/app', '/app/main.ts', '/lib', '/lib/util.ts'])
  })

  it('flattens headered roots when flattenRoots is set', () => {
    const primary = dir('app', '/app', [file('main.ts', '/app/main.ts')])
    const order = buildVisibleNodes({
      primary,
      flattenRoots: true,
      hasHeaderedRoots: true,
      expandedPaths: new Set(['/app']),
    }).map((v) => v.node.path)
    expect(order).toEqual(['/app/main.ts'])
  })
})
