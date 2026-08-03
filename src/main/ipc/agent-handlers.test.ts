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

describe('registerAgentHandlers — kill, rename, delete-app', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('renames an agent through IPC', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
      sessionManager: {
        listSessions: vi.fn(() => []),
        renameSession: vi.fn(async () => ({
          id: 'sess-1',
          projectId: 'proj-1',
          runtimeId: 'codex',
          branchName: 'manifold/oslo',
          worktreePath: '/wt',
          status: 'running',
          pid: 1,
          displayName: 'Release agent',
          additionalDirs: [],
        })),
      },
      fileWatcher: {
        unwatch: vi.fn(),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:rename')
    if (!handler) throw new Error('agent:rename handler was not registered')

    const result = await handler({}, 'sess-1', 'Release agent')

    expect(deps.sessionManager.renameSession).toHaveBeenCalledWith('sess-1', 'Release agent')
    expect(result).toMatchObject({ displayName: 'Release agent' })
  })

  it('configures an agent runtime and view through IPC', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const settings = { displayName: 'Review agent', runtimeId: 'codex', viewMode: 'chat' as const }
    const deps = {
      sessionManager: {
        listSessions: vi.fn(() => []),
        configureSession: vi.fn(async () => ({
          id: 'sess-2', projectId: 'proj-1', runtimeId: 'codex',
          branchName: 'manifold/oslo', worktreePath: '/wt', status: 'waiting',
          pid: null, displayName: 'Review agent', nonInteractive: true, additionalDirs: [],
        })),
      },
      fileWatcher: { unwatch: vi.fn(), watch: vi.fn() },
      viewStateStore: { delete: vi.fn() },
      dockLayoutStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:configure')
    if (!handler) throw new Error('agent:configure handler was not registered')

    const result = await handler({}, 'sess-1', settings)

    expect(deps.sessionManager.configureSession).toHaveBeenCalledWith('sess-1', settings)
    expect(result).toMatchObject({ runtimeId: 'codex', nonInteractive: true })
    expect(deps.viewStateStore.delete).toHaveBeenCalledWith('sess-1')
  })

  it('agent:kill tolerates an already-removed session and still cleans up view-state', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
      sessionManager: {
        listSessions: vi.fn(() => []),
        getSession: vi.fn(() => undefined),
        hasSession: vi.fn(() => false),
        killSession: vi.fn(async () => { throw new Error('Session not found') }),
      },
      fileWatcher: {
        unwatch: vi.fn(async () => undefined),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
      dockLayoutStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:kill')
    if (!handler) throw new Error('agent:kill handler was not registered')

    // Should not throw even though the session is gone
    await expect(handler({}, 'already-gone')).resolves.toBeUndefined()
    expect(deps.sessionManager.killSession).not.toHaveBeenCalled()
    expect(deps.viewStateStore.delete).toHaveBeenCalledWith('already-gone')
  })

  it('agent:kill kills a present session and removes its view-state', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
      sessionManager: {
        listSessions: vi.fn(() => []),
        getSession: vi.fn(() => ({ id: 'sess-1', worktreePath: '/wt', noWorktree: false })),
        hasSession: vi.fn(() => true),
        killSession: vi.fn(async () => undefined),
      },
      fileWatcher: {
        unwatch: vi.fn(async () => undefined),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
      dockLayoutStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:kill')
    if (!handler) throw new Error('agent:kill handler was not registered')

    await handler({}, 'sess-1')
    // #534: agent:kill no longer unwatches directly — killSession →
    // SessionKiller.cleanupSession does the guarded unwatch (killSession is mocked here,
    // and the guarded-unwatch behavior is covered by session-manager-kill tests).
    expect(deps.fileWatcher.unwatch).not.toHaveBeenCalled()
    expect(deps.sessionManager.killSession).toHaveBeenCalledWith('sess-1')
    expect(deps.viewStateStore.delete).toHaveBeenCalledWith('sess-1')
  })

  it('agent:kill records a dismissal for a deleted noWorktree agent (#679)', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
      sessionManager: {
        listSessions: vi.fn(() => []),
        getSession: vi.fn(() => ({
          id: 'sess-1',
          projectId: 'proj-1',
          branchName: 'feature-x',
          worktreePath: '/repo',
          noWorktree: true,
        })),
        hasSession: vi.fn(() => true),
        killSession: vi.fn(async () => undefined),
      },
      fileWatcher: {
        unwatch: vi.fn(async () => undefined),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
      dockLayoutStore: { delete: vi.fn() },
      dismissedAgents: { add: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:kill')
    if (!handler) throw new Error('agent:kill handler was not registered')

    await handler({}, 'sess-1')

    expect(deps.dismissedAgents.add).toHaveBeenCalledWith('proj-1', 'feature-x')
    expect(deps.sessionManager.killSession).toHaveBeenCalledWith('sess-1')
  })

  it('agent:kill does not record a dismissal for worktree-backed agents', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
      sessionManager: {
        listSessions: vi.fn(() => []),
        getSession: vi.fn(() => ({
          id: 'sess-1',
          projectId: 'proj-1',
          branchName: 'manifold/oslo',
          worktreePath: '/wt',
          noWorktree: false,
        })),
        hasSession: vi.fn(() => true),
        killSession: vi.fn(async () => undefined),
      },
      fileWatcher: {
        unwatch: vi.fn(async () => undefined),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
      dockLayoutStore: { delete: vi.fn() },
      dismissedAgents: { add: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:kill')
    if (!handler) throw new Error('agent:kill handler was not registered')

    await handler({}, 'sess-1')

    expect(deps.dismissedAgents.add).not.toHaveBeenCalled()
    expect(deps.sessionManager.killSession).toHaveBeenCalledWith('sess-1')
  })

  it('agent:delete-app detaches the project from every workspace so no dangling id is left behind', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
      projectRegistry: {
        getProject: vi.fn(() => undefined),
        removeProject: vi.fn(() => true),
      },
      sessionManager: {
        getSession: vi.fn(() => undefined),
      },
      fileWatcher: {
        unwatch: vi.fn(async () => undefined),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
      dockLayoutStore: { delete: vi.fn() },
      chatStore: { deleteByProject: vi.fn() },
      memoryStore: { deleteProject: vi.fn() },
      verdictStore: { deleteByProject: vi.fn() },
      workspaceManager: { removeProjectFromAllWorkspaces: vi.fn() },
      dismissedAgents: { add: vi.fn(), deleteProject: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:delete-app')
    if (!handler) throw new Error('agent:delete-app handler was not registered')

    await handler({}, 'sess-1', 'proj-1')
    expect(deps.workspaceManager.removeProjectFromAllWorkspaces).toHaveBeenCalledWith('proj-1')
    expect(deps.dismissedAgents.deleteProject).toHaveBeenCalledWith('proj-1')
    expect(deps.projectRegistry.removeProject).toHaveBeenCalledWith('proj-1')
  })

  it('agent:set-locked sets the locked flag through the session manager', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
      sessionManager: {
        listSessions: vi.fn(() => []),
        setSessionLocked: vi.fn(async () => ({
          id: 'sess-1',
          projectId: 'proj-1',
          runtimeId: 'codex',
          branchName: 'manifold/oslo',
          worktreePath: '/wt',
          status: 'running',
          pid: 1,
          additionalDirs: [],
          locked: true,
        })),
      },
      fileWatcher: { unwatch: vi.fn(), watch: vi.fn() },
      viewStateStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:set-locked')
    if (!handler) throw new Error('agent:set-locked handler was not registered')

    const result = await handler({}, 'sess-1', true)
    expect(deps.sessionManager.setSessionLocked).toHaveBeenCalledWith('sess-1', true)
    expect(result).toMatchObject({ locked: true })
  })

  it('agent:kill deletes sessions persisted with the retired locked flag', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
      sessionManager: {
        listSessions: vi.fn(() => []),
        getSession: vi.fn(() => ({ id: 'sess-1', worktreePath: '/wt', noWorktree: false, locked: true })),
        hasSession: vi.fn(() => true),
        killSession: vi.fn(async () => undefined),
      },
      fileWatcher: { unwatch: vi.fn(async () => undefined), watch: vi.fn() },
      viewStateStore: { delete: vi.fn() },
      dockLayoutStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:kill')
    if (!handler) throw new Error('agent:kill handler was not registered')

    await handler({}, 'sess-1')
    expect(deps.sessionManager.killSession).toHaveBeenCalledWith('sess-1')
    expect(deps.viewStateStore.delete).toHaveBeenCalledWith('sess-1')
  })

  // Deleting a checkout is a workspace action now, so no agent channel offers it.
  it('registers no channel that deletes a worktree', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')

    registerAgentHandlers({
      sessionManager: { listSessions: vi.fn(() => []) },
      fileWatcher: { unwatch: vi.fn(async () => undefined), watch: vi.fn() },
      viewStateStore: { delete: vi.fn() },
    } as never)

    expect(mocks.handlers.has('agent:kill-worktree')).toBe(false)
  })
})
