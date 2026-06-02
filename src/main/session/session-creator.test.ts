import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../agent/runtimes', () => ({
  getRuntimeById: vi.fn(() => ({
    id: 'codex',
    name: 'Codex',
    binary: 'codex',
    args: [],
    env: undefined,
  })),
}))

vi.mock('../git/git-exec', () => ({
  gitExec: vi.fn().mockResolvedValue('manifold/oslo\n'),
}))

vi.mock('../git/worktree-meta', () => ({
  readWorktreeMeta: vi.fn().mockResolvedValue({
    runtimeId: 'codex',
    additionalDirs: [],
  }),
  writeWorktreeMeta: vi.fn().mockResolvedValue(undefined),
}))

import { SessionCreator } from './session-creator'
import { gitExec } from '../git/git-exec'
import { readWorktreeMeta, writeWorktreeMeta } from '../git/worktree-meta'
import type { WorktreeManager } from '../git/worktree-manager'
import type { PtyPool } from '../agent/pty-pool'
import type { ProjectRegistry } from '../store/project-registry'
import type { SessionStreamWirer } from './session-stream-wirer'

function createProjectRegistry(): ProjectRegistry {
  return {
    getProject: vi.fn(() => ({
      id: 'proj-1',
      name: 'manifold',
      path: '/repo',
      baseBranch: 'main',
      addedAt: '2026-05-24T00:00:00.000Z',
      kind: 'git',
    })),
  } as unknown as ProjectRegistry
}

function createPtyPool(): PtyPool {
  return {
    spawn: vi.fn().mockReturnValue({ id: 'pty-1', pid: 123 }),
  } as unknown as PtyPool
}

function createStreamWirer(): SessionStreamWirer {
  return {
    wireOutputStreaming: vi.fn(),
    wireExitHandling: vi.fn(),
    wireStreamJsonOutput: vi.fn(),
    wirePrintModeInitialExitHandling: vi.fn(),
  } as unknown as SessionStreamWirer
}

describe('SessionCreator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reuses an existing worktree when existingWorktreePath is provided', async () => {
    const creator = new SessionCreator(
      {} as WorktreeManager,
      createPtyPool(),
      createProjectRegistry(),
      createStreamWirer(),
      () => null,
    )

    const session = await creator.create({
      projectId: 'proj-1',
      runtimeId: 'codex',
      prompt: 'test',
      existingWorktreePath: '/repo/.manifold/worktrees/manifold-oslo',
    })

    expect(readWorktreeMeta).toHaveBeenCalledWith('/repo/.manifold/worktrees/manifold-oslo')
    expect(session.worktreePath).toBe('/repo/.manifold/worktrees/manifold-oslo')
    expect(writeWorktreeMeta).toHaveBeenCalledWith(
      '/repo/.manifold/worktrees/manifold-oslo',
      expect.objectContaining({
        runtimeId: 'codex',
      }),
    )
  })

  it('runs no-worktree stay-on-branch sessions directly in the project path', async () => {
    vi.mocked(gitExec).mockResolvedValueOnce('main\n')
    const creator = new SessionCreator(
      {} as WorktreeManager,
      createPtyPool(),
      createProjectRegistry(),
      createStreamWirer(),
      () => null,
    )

    const session = await creator.create({
      projectId: 'proj-1',
      runtimeId: 'codex',
      prompt: 'build the app',
      branchName: 'main',
      noWorktree: true,
      stayOnBranch: true,
    })

    expect(gitExec).toHaveBeenCalledWith(['rev-parse', '--abbrev-ref', 'HEAD'], '/repo')
    expect(session.branchName).toBe('main')
    expect(session.worktreePath).toBe('/repo')
    expect(session.noWorktree).toBe(true)
    expect(readWorktreeMeta).not.toHaveBeenCalled()
    expect(writeWorktreeMeta).not.toHaveBeenCalled()
  })
})
