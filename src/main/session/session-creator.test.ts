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

  it('creates a new branch in place when noWorktree is set without stayOnBranch', async () => {
    vi.mocked(gitExec).mockResolvedValueOnce('') // assertCleanWorkingTree: clean tree
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
      branchName: 'feature-inplace',
      noWorktree: true,
    })

    expect(gitExec).toHaveBeenCalledWith(['status', '--porcelain'], '/repo')
    // A typed name cuts a new branch off the base branch (project base 'main').
    expect(gitExec).toHaveBeenCalledWith(['checkout', '-b', 'feature-inplace', 'main'], '/repo')
    expect(session.branchName).toBe('feature-inplace')
    expect(session.baseBranch).toBe('main')
    expect(session.worktreePath).toBe('/repo')
    expect(session.noWorktree).toBe(true)
    expect(readWorktreeMeta).not.toHaveBeenCalled()
    expect(writeWorktreeMeta).not.toHaveBeenCalled()
  })

  it('works directly on the base branch (no new branch, no task) when autoName is set', async () => {
    vi.mocked(gitExec).mockResolvedValueOnce('') // assertCleanWorkingTree: clean tree
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
      prompt: 'Oslo', // auto-generated placeholder, ignored
      noWorktree: true,
      autoName: true,
    })

    // No typed name → assert a clean tree, then check out the base branch directly
    // (no `-b`), name = base, no random-city task, base is the session's diff/PR base.
    expect(gitExec).toHaveBeenCalledWith(['status', '--porcelain'], '/repo')
    expect(gitExec).toHaveBeenCalledWith(['checkout', 'main'], '/repo')
    expect(session.branchName).toBe('main')
    expect(session.baseBranch).toBe('main')
    expect(session.taskDescription).toBeUndefined()
  })

  it('asserts a clean tree on the work-directly-on-base (autoName) path unless allowDirtyWorktree', async () => {
    vi.mocked(gitExec).mockResolvedValueOnce(' M src/x.ts\n') // status --porcelain: dirty
    const creator = new SessionCreator(
      {} as WorktreeManager,
      createPtyPool(),
      createProjectRegistry(),
      createStreamWirer(),
      () => null,
    )

    // Dirty tree + no confirmation → don't silently carry changes onto the base.
    await expect(creator.create({
      projectId: 'proj-1',
      runtimeId: 'codex',
      prompt: 'Oslo',
      noWorktree: true,
      autoName: true,
    })).rejects.toThrow(/uncommitted changes/)
    expect(gitExec).not.toHaveBeenCalledWith(['checkout', 'main'], '/repo')
  })

  it('cuts a new branch off a selected base branch and uses it as the session base', async () => {
    vi.mocked(gitExec).mockResolvedValueOnce('') // assertCleanWorkingTree: clean tree
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
      prompt: 'my feature',
      branchName: 'feature-x',
      baseBranch: 'develop', // selected in the New Agent form
      noWorktree: true,
    })

    expect(gitExec).toHaveBeenCalledWith(['checkout', '-b', 'feature-x', 'develop'], '/repo')
    expect(session.branchName).toBe('feature-x')
    expect(session.baseBranch).toBe('develop')
  })

  it('keeps the prompt as the task for a worktree agent even with autoName', async () => {
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
      prompt: 'Oslo',
      branchName: 'main',
      noWorktree: true,
      stayOnBranch: true,
      autoName: false,
    })

    expect(session.taskDescription).toBe('Oslo')
  })

  it('skips the clean-tree check on the new-branch path when allowDirtyWorktree is set', async () => {
    // No status --porcelain result is queued: if assertCleanWorkingTree ran, the
    // default gitExec mock ('manifold/oslo\n') would be non-empty and it would throw.
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
      branchName: 'feature-dirty',
      noWorktree: true,
      allowDirtyWorktree: true,
    })

    expect(gitExec).not.toHaveBeenCalledWith(['status', '--porcelain'], '/repo')
    expect(gitExec).toHaveBeenCalledWith(['checkout', '-b', 'feature-dirty', 'main'], '/repo')
    expect(session.branchName).toBe('feature-dirty')
    expect(session.noWorktree).toBe(true)
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

  it('passes --session-id matching the session id for interactive Claude', async () => {
    vi.mocked(gitExec).mockResolvedValueOnce('main\n')
    const { creator, ptyPool } = createInteractiveClaude()

    const session = await creator.create({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'hi',
      branchName: 'main',
      noWorktree: true,
      stayOnBranch: true,
    })

    const spawnArgs = vi.mocked(ptyPool.spawn).mock.calls[0][1] as string[]
    const idx = spawnArgs.indexOf('--session-id')
    expect(idx).toBeGreaterThan(-1)
    expect(spawnArgs[idx + 1]).toBe(session.id)
  })

  it('persists the session id in worktree meta so it survives a restart', async () => {
    const worktreeManager = {
      createWorktree: vi.fn(async () => ({
        branch: 'manifold/oslo',
        path: '/repo/.manifold/worktrees/manifold-oslo',
      })),
    } as unknown as WorktreeManager
    const creator = new SessionCreator(
      worktreeManager,
      createPtyPool(),
      createProjectRegistry(),
      createStreamWirer(),
      () => null,
    )

    const session = await creator.create({
      projectId: 'proj-1',
      runtimeId: 'codex',
      prompt: 'do work',
    })

    expect(writeWorktreeMeta).toHaveBeenCalledWith(
      '/repo/.manifold/worktrees/manifold-oslo',
      expect.objectContaining({ sessionId: session.id }),
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
