import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./git-exec', () => ({ gitExec: vi.fn() }))

import { gitExec } from './git-exec'
import { getWorktreeDirty, getWorktreeLastCommitISO } from './worktree-status'

const mockGitExec = vi.mocked(gitExec)

describe('worktree-status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dirty when porcelain output is non-empty', async () => {
    mockGitExec.mockResolvedValue(' M src/file.ts\n')
    expect(await getWorktreeDirty('/wt')).toBe(true)
    expect(mockGitExec).toHaveBeenCalledWith(['status', '--porcelain'], '/wt')
  })

  it('clean when porcelain output is empty', async () => {
    mockGitExec.mockResolvedValue('')
    expect(await getWorktreeDirty('/wt')).toBe(false)
  })

  it('treats git failure as not-dirty', async () => {
    mockGitExec.mockRejectedValue(new Error('boom'))
    expect(await getWorktreeDirty('/wt')).toBe(false)
  })

  it('returns trimmed ISO commit date', async () => {
    mockGitExec.mockResolvedValue('2026-06-10T12:00:00+02:00\n')
    expect(await getWorktreeLastCommitISO('/wt')).toBe('2026-06-10T12:00:00+02:00')
    expect(mockGitExec).toHaveBeenCalledWith(['log', '-1', '--format=%cI'], '/wt')
  })

  it('returns null when there are no commits / on error', async () => {
    mockGitExec.mockRejectedValue(new Error('no head'))
    expect(await getWorktreeLastCommitISO('/wt')).toBeNull()
  })
})
