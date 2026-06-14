import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./git-exec', () => ({ gitExec: vi.fn() }))
vi.mock('../app/debug-log', () => ({ debugLog: vi.fn() }))

import { gitExec } from './git-exec'
import { listMergedBranches, listWorktreeBranches, getBranchDates } from './branch-status'

const mockGitExec = vi.mocked(gitExec)

describe('branch-status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists branches merged into the base branch', async () => {
    mockGitExec.mockResolvedValue('main\nfeat/x\nfeat/y\n')
    expect(await listMergedBranches('/repo', 'main')).toEqual(['main', 'feat/x', 'feat/y'])
    expect(mockGitExec).toHaveBeenCalledWith(['branch', '--merged', 'main', '--format=%(refname:short)'], '/repo')
  })

  it('returns [] when the merged-branch listing fails (e.g. base missing)', async () => {
    mockGitExec.mockRejectedValue(new Error('bad base'))
    expect(await listMergedBranches('/repo', 'main')).toEqual([])
  })

  it('parses the branches checked out in any worktree', async () => {
    mockGitExec.mockResolvedValue('worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /wt/a\nHEAD def\nbranch refs/heads/feat/active\n\n')
    expect(await listWorktreeBranches('/repo')).toEqual(['main', 'feat/active'])
  })

  it('maps every branch to its last-commit ISO date in one for-each-ref call', async () => {
    mockGitExec.mockResolvedValue('feat/x\t2026-03-15T10:00:00+02:00\nfeat/y\t2026-04-01T09:00:00+02:00\n')
    expect(await getBranchDates('/repo')).toEqual({ 'feat/x': '2026-03-15T10:00:00+02:00', 'feat/y': '2026-04-01T09:00:00+02:00' })
    expect(mockGitExec).toHaveBeenCalledWith(['for-each-ref', '--format=%(refname:short)%09%(committerdate:iso-strict)', 'refs/heads'], '/repo')
  })

  it('returns {} when the date lookup fails', async () => {
    mockGitExec.mockRejectedValue(new Error('no'))
    expect(await getBranchDates('/repo')).toEqual({})
  })
})
