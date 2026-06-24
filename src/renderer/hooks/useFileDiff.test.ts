import { describe, it, expect } from 'vitest'
import { mergeFileChanges } from './useFileDiff'

describe('mergeFileChanges', () => {
  it('marks base-branch-only changes as not worktree-dirty', () => {
    const merged = mergeFileChanges([{ path: 'a.ts', type: 'added' }], [])
    expect(merged).toEqual([{ path: 'a.ts', type: 'added', worktreeDirty: false }])
  })

  it('marks working-tree (watcher) changes as worktree-dirty', () => {
    const merged = mergeFileChanges([], [{ path: 'b.ts', type: 'modified' }])
    expect(merged).toEqual([{ path: 'b.ts', type: 'modified', worktreeDirty: true }])
  })

  it('treats a path present in both sources as worktree-dirty', () => {
    const merged = mergeFileChanges(
      [{ path: 'c.ts', type: 'added' }],
      [{ path: 'c.ts', type: 'modified' }],
    )
    expect(merged).toEqual([{ path: 'c.ts', type: 'modified', worktreeDirty: true }])
  })
})
