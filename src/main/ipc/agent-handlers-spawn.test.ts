import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    generateBranchName: vi.fn(async () => 'repo/oslo'),
    pickRandomNorwegianCityName: vi.fn(() => 'Oslo'),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
  },
}))

vi.mock('../git/branch-namer', () => ({
  generateBranchName: mocks.generateBranchName,
}))

vi.mock('../../shared/norwegian-cities', () => ({
  pickRandomNorwegianCityName: mocks.pickRandomNorwegianCityName,
}))

describe('registerAgentHandlers — spawn and branch suggestion', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('clears dormant no-worktree sessions before spawning a replacement', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const createSession = vi.fn(async () => ({
      id: 'new-session',
      projectId: 'proj-1',
      runtimeId: 'claude',
      branchName: 'feature/clock',
      worktreePath: '/repo',
      status: 'running',
      pid: 1,
      additionalDirs: [],
      noWorktree: true,
    }))
    const deps = {
      projectRegistry: {
        getProject: vi.fn(() => ({ id: 'proj-1', name: 'repo', path: '/repo', baseBranch: 'main' })),
      },
      sessionManager: {
        listSessions: vi.fn(() => [{
          id: 'old-session',
          projectId: 'proj-1',
          runtimeId: 'claude',
          branchName: 'feature/clock',
          worktreePath: '/repo',
          status: 'done',
          pid: null,
          additionalDirs: [],
          noWorktree: true,
        }]),
        getInternalSession: vi.fn(() => ({
          id: 'old-session',
          projectId: 'proj-1',
          branchName: 'feature/clock',
          worktreePath: '/repo',
          status: 'done',
          ptyId: '',
          devServerPtyId: undefined,
          noWorktree: true,
        })),
        killSession: vi.fn(async () => undefined),
        createSession,
      },
      fileWatcher: {
        unwatch: vi.fn(async () => undefined),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:spawn')
    if (!handler) throw new Error('agent:spawn handler was not registered')

    const result = await handler({}, {
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'build a clock',
      noWorktree: true,
    })

    expect(deps.fileWatcher.unwatch).toHaveBeenCalledWith('/repo')
    expect(deps.sessionManager.killSession).toHaveBeenCalledWith('old-session')
    expect(createSession).toHaveBeenCalledWith({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'build a clock',
      noWorktree: true,
    })
    expect(result).toMatchObject({ id: 'new-session' })
  })

  it('focuses the existing in-place agent instead of creating a second (one per repo)', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const createSession = vi.fn()
    const deps = {
      projectRegistry: {
        getProject: vi.fn(() => ({ id: 'proj-1', name: 'repo', path: '/repo', baseBranch: 'main' })),
      },
      sessionManager: {
        listSessions: vi.fn(() => [{
          id: 'active-session',
          projectId: 'proj-1',
          runtimeId: 'claude',
          branchName: 'feature/clock',
          worktreePath: '/repo',
          status: 'running',
          pid: 42,
          additionalDirs: [],
          noWorktree: true,
        }]),
        getInternalSession: vi.fn(() => ({
          id: 'active-session',
          projectId: 'proj-1',
          branchName: 'feature/clock',
          worktreePath: '/repo',
          status: 'running',
          ptyId: 'pty-1',
          devServerPtyId: undefined,
          noWorktree: true,
        })),
        killSession: vi.fn(),
        createSession,
      },
      fileWatcher: {
        unwatch: vi.fn(),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:spawn')
    if (!handler) throw new Error('agent:spawn handler was not registered')

    const result = await handler({}, {
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'build a clock',
      noWorktree: true,
    })

    // One in-place agent per repo: the existing active agent is returned (focused);
    // no new session is created and the existing one is left untouched.
    expect(deps.sessionManager.killSession).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
    expect(result).toMatchObject({ id: 'active-session' })
  })

  it('clears dormant no-worktree sessions before spawning a worktree-backed agent', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const createSession = vi.fn(async () => ({
      id: 'interactive-session',
      projectId: 'proj-1',
      runtimeId: 'codex',
      branchName: 'clock/task-1',
      worktreePath: '/worktrees/clock-task-1',
      status: 'running',
      pid: 2,
      additionalDirs: [],
      noWorktree: false,
    }))
    const deps = {
      projectRegistry: {
        getProject: vi.fn(() => ({ id: 'proj-1', name: 'repo', path: '/repo', baseBranch: 'main' })),
      },
      sessionManager: {
        listSessions: vi.fn(() => [{
          id: 'dormant-simple',
          projectId: 'proj-1',
          runtimeId: '',
          branchName: 'clock/you-are-starting',
          worktreePath: '/repo',
          status: 'done',
          pid: null,
          additionalDirs: [],
          noWorktree: true,
        }]),
        getInternalSession: vi.fn(() => ({
          id: 'dormant-simple',
          projectId: 'proj-1',
          branchName: 'clock/you-are-starting',
          worktreePath: '/repo',
          status: 'done',
          ptyId: '',
          devServerPtyId: undefined,
          noWorktree: true,
        })),
        killSession: vi.fn(async () => undefined),
        createSession,
      },
      fileWatcher: {
        unwatch: vi.fn(async () => undefined),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:spawn')
    if (!handler) throw new Error('agent:spawn handler was not registered')

    const result = await handler({}, {
      projectId: 'proj-1',
      runtimeId: 'codex',
      prompt: '',
      existingBranch: 'clock/task-1',
      noWorktree: false,
    })

    expect(deps.fileWatcher.unwatch).toHaveBeenCalledWith('/repo')
    expect(deps.sessionManager.killSession).toHaveBeenCalledWith('dormant-simple')
    expect(createSession).toHaveBeenCalledWith({
      projectId: 'proj-1',
      runtimeId: 'codex',
      prompt: '',
      existingBranch: 'clock/task-1',
      noWorktree: false,
    })
    expect(result).toMatchObject({ id: 'interactive-session' })
  })

  it('uses a Norwegian city when suggesting a branch without a task description', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
      projectRegistry: {
        getProject: vi.fn(() => ({ path: '/repo' })),
      },
      sessionManager: {
        listSessions: vi.fn(() => []),
      },
      fileWatcher: {
        unwatch: vi.fn(),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('branch:suggest')
    if (!handler) throw new Error('branch:suggest handler was not registered')

    const result = await handler({}, 'proj-1')

    expect(mocks.pickRandomNorwegianCityName).toHaveBeenCalledTimes(1)
    expect(mocks.generateBranchName).toHaveBeenCalledWith('/repo', 'Oslo')
    expect(result).toBe('repo/oslo')
  })

  it('uses the provided task description when suggesting a branch', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
      projectRegistry: {
        getProject: vi.fn(() => ({ path: '/repo' })),
      },
      sessionManager: {
        listSessions: vi.fn(() => []),
      },
      fileWatcher: {
        unwatch: vi.fn(),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('branch:suggest')
    if (!handler) throw new Error('branch:suggest handler was not registered')

    await handler({}, 'proj-1', 'Ship launch checklist')

    expect(mocks.pickRandomNorwegianCityName).not.toHaveBeenCalled()
    expect(mocks.generateBranchName).toHaveBeenCalledWith('/repo', 'Ship launch checklist')
  })
})
