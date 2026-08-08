import { describe, expect, it } from 'vitest'
import { buildChangeMaps } from './file-tree-changes'

describe('buildChangeMaps', () => {
  it('keys changed files by absolute path', () => {
    const { changeMap } = buildChangeMaps([
      { rootPath: '/repo', changes: [{ path: 'src/index.ts', type: 'modified' }] },
    ])

    expect(changeMap.get('/repo/src/index.ts')).toEqual({ type: 'modified', worktreeDirty: true })
  })

  // The point of the roll-up: a change stays findable while the folders above it
  // are collapsed.
  it('credits a change to every directory up to its root', () => {
    const { dirChangeMap } = buildChangeMaps([
      { rootPath: '/repo', changes: [{ path: 'src/deep/nested/index.ts', type: 'modified' }] },
    ])

    expect([...dirChangeMap.keys()].sort()).toEqual([
      '/repo', '/repo/src', '/repo/src/deep', '/repo/src/deep/nested',
    ])
    expect(dirChangeMap.get('/repo/src')).toEqual({ count: 1, worktreeDirty: true })
  })

  it('stops at the root rather than walking on up the filesystem', () => {
    const { dirChangeMap } = buildChangeMaps([
      { rootPath: '/Users/me/git/repo', changes: [{ path: 'a.ts', type: 'added' }] },
    ])

    expect([...dirChangeMap.keys()]).toEqual(['/Users/me/git/repo'])
  })

  it('counts every change inside a folder', () => {
    const { dirChangeMap } = buildChangeMaps([
      {
        rootPath: '/repo',
        changes: [
          { path: 'src/a.ts', type: 'modified' },
          { path: 'src/b.ts', type: 'added' },
          { path: 'README.md', type: 'modified' },
        ],
      },
    ])

    expect(dirChangeMap.get('/repo/src')?.count).toBe(2)
    expect(dirChangeMap.get('/repo')?.count).toBe(3)
  })

  // A folder holding nothing but base-branch differences recedes the same way
  // those files do — a faint dot, not the vivid one.
  it('marks a folder dirty only when a change inside it is', () => {
    const { dirChangeMap } = buildChangeMaps([
      {
        rootPath: '/repo',
        changes: [
          { path: 'docs/old.md', type: 'modified', worktreeDirty: false },
          { path: 'src/new.ts', type: 'modified', worktreeDirty: true },
        ],
      },
    ])

    expect(dirChangeMap.get('/repo/docs')?.worktreeDirty).toBe(false)
    expect(dirChangeMap.get('/repo/src')?.worktreeDirty).toBe(true)
    expect(dirChangeMap.get('/repo')?.worktreeDirty).toBe(true)
  })

  it('prefixes each root with its own path', () => {
    const { changeMap, dirChangeMap } = buildChangeMaps([
      { rootPath: '/repoA', changes: [{ path: 'src/a.ts', type: 'modified' }] },
      { rootPath: '/repoB/', changes: [{ path: 'src/b.ts', type: 'added' }] },
    ])

    expect(changeMap.has('/repoA/src/a.ts')).toBe(true)
    expect(changeMap.has('/repoB/src/b.ts')).toBe(true)
    expect(dirChangeMap.has('/repoA/src')).toBe(true)
    expect(dirChangeMap.has('/repoB/src')).toBe(true)
  })
})
