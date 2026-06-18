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

vi.mock('../agent/agent-env', () => ({
  agentSpawnEnv: vi.fn(() => ({ AGENT_ENV_INJECTED: '1' })),
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
import { getRuntimeById } from '../agent/runtimes'
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
    vi.mocked(readWorktreeMeta).mockResolvedValueOnce({
      runtimeId: 'codex',
      displayName: 'Persisted agent',
      additionalDirs: [],
    })
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
    expect(session.displayName).toBe('Persisted agent')
    expect(session.worktreePath).toBe('/repo/.manifold/worktrees/manifold-oslo')
    expect(writeWorktreeMeta).toHaveBeenCalledWith(
      '/repo/.manifold/worktrees/manifold-oslo',
      expect.objectContaining({
        displayName: 'Persisted agent',
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

  function createInteractiveClaude(getThemeType?: () => 'light' | 'dark') {
    vi.mocked(getRuntimeById).mockReturnValueOnce({
      id: 'claude',
      name: 'Claude Code',
      binary: 'claude',
      args: ['--allow-dangerously-skip-permissions'],
      env: undefined,
    } as ReturnType<typeof getRuntimeById>)
    const ptyPool = createPtyPool()
    const creator = new SessionCreator(
      {} as WorktreeManager,
      ptyPool,
      createProjectRegistry(),
      createStreamWirer(),
      () => null,
      undefined,
      undefined,
      getThemeType,
    )
    return { creator, ptyPool }
  }

  it('launches interactive Claude Code with the light ANSI theme when Manifold is light', async () => {
    vi.mocked(gitExec).mockResolvedValueOnce('main\n')
    const { creator, ptyPool } = createInteractiveClaude(() => 'light')

    await creator.create({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'hi',
      branchName: 'main',
      noWorktree: true,
      stayOnBranch: true,
    })

    expect(ptyPool.spawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--settings', '{"theme":"light-ansi"}']),
      expect.anything(),
    )
  })

  it('injects agent env (from ~/.manifold/agent.env) into the interactive spawn', async () => {
    vi.mocked(gitExec).mockResolvedValueOnce('main\n')
    const { creator, ptyPool } = createInteractiveClaude()

    await creator.create({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'hi',
      branchName: 'main',
      noWorktree: true,
      stayOnBranch: true,
    })

    expect(ptyPool.spawn).toHaveBeenCalledWith(
      'claude',
      expect.anything(),
      expect.objectContaining({ env: { AGENT_ENV_INJECTED: '1' } }),
    )
  })

  it('defaults to the dark ANSI theme when no Manifold theme is known', async () => {
    vi.mocked(gitExec).mockResolvedValueOnce('main\n')
    const { creator, ptyPool } = createInteractiveClaude()

    await creator.create({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'hi',
      branchName: 'main',
      noWorktree: true,
      stayOnBranch: true,
    })

    expect(ptyPool.spawn).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--settings', '{"theme":"dark-ansi"}']),
      expect.anything(),
    )
  })

  it('wires PTY listeners with no await gap so a fast-exiting runtime is not stranded (#496)', async () => {
    // Model the real pool/wirer contract: spawn registers a live pty id, and
    // wiring a pty that is no longer live throws 'PTY not found'.
    const livePtys = new Set<string>()
    const ptyPool = {
      spawn: vi.fn(() => {
        livePtys.add('pty-1')
        return { id: 'pty-1', pid: 123 }
      }),
    } as unknown as PtyPool
    const requireLive = (ptyId: string) => {
      if (!livePtys.has(ptyId)) throw new Error('PTY not found')
    }
    const streamWirer = {
      wireOutputStreaming: vi.fn((ptyId: string) => requireLive(ptyId)),
      wireExitHandling: vi.fn((ptyId: string) => requireLive(ptyId)),
      wireStreamJsonOutput: vi.fn((ptyId: string) => requireLive(ptyId)),
      wirePrintModeInitialExitHandling: vi.fn((ptyId: string) => requireLive(ptyId)),
    } as unknown as SessionStreamWirer
    const worktreeManager = {
      createWorktree: vi.fn().mockResolvedValue({
        branch: 'manifold/oslo',
        path: '/repo/.manifold/worktrees/manifold-oslo',
      }),
    } as unknown as WorktreeManager

    // Simulate the spawned process exiting during the worktree-meta read: its
    // pool entry is deleted in the await window, before listeners are wired.
    vi.mocked(readWorktreeMeta).mockImplementationOnce(async () => {
      livePtys.delete('pty-1')
      return { runtimeId: 'codex', additionalDirs: [] }
    })

    const creator = new SessionCreator(
      worktreeManager,
      ptyPool,
      createProjectRegistry(),
      streamWirer,
      () => null,
    )

    const session = await creator.create({
      projectId: 'proj-1',
      runtimeId: 'codex',
      prompt: 'test',
    })

    // Session is returned and tracks the freshly created worktree; listeners
    // were wired against the live pty spawned after the meta read.
    expect(session.worktreePath).toBe('/repo/.manifold/worktrees/manifold-oslo')
    expect(streamWirer.wireOutputStreaming).toHaveBeenCalledWith('pty-1', expect.anything())
  })
})
