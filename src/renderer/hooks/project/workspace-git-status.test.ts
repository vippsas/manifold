import { describe, expect, it } from 'vitest'
import type { WorkspaceRepoStatus } from '../../../shared/workspace-types'
import { countWorkspaceChangedFiles } from './workspace-git-status'

describe('countWorkspaceChangedFiles', () => {
  it('counts distinct changed files across the active workspace', () => {
    const repos: WorkspaceRepoStatus[] = [
      {
        projectId: 'p1',
        projectName: 'one',
        checkoutPath: '/worktrees/one',
        branch: 'feature',
        staged: [
          { path: 'src/both.ts', type: 'modified' },
          { path: 'src/staged.ts', type: 'modified' },
        ],
        unstaged: [
          { path: 'src/both.ts', type: 'modified' },
          { path: 'src/unstaged.ts', type: 'modified' },
        ],
      },
      {
        projectId: 'p2',
        projectName: 'two',
        checkoutPath: '/worktrees/two',
        branch: 'feature',
        staged: [],
        unstaged: [{ path: 'src/both.ts', type: 'modified' }],
      },
    ]

    expect(countWorkspaceChangedFiles(repos)).toBe(4)
  })
})
