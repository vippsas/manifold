import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
  },
}))

describe('registerAgentHandlers', () => {
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

  it('keeps blocking when an active no-worktree session still has a process', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
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
        createSession: vi.fn(),
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

    await expect(handler({}, {
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'build a clock',
      noWorktree: true,
    })).rejects.toThrow(
      'A no-worktree agent is already running for this project. Only one no-worktree agent can run at a time per project.',
    )

    expect(deps.sessionManager.killSession).not.toHaveBeenCalled()
    expect(deps.sessionManager.createSession).not.toHaveBeenCalled()
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
})
