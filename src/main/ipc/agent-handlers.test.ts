import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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

  it('keeps blocking when an active no-worktree session still has a process', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
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

  it('reads saved chat images from the temp image directory', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const tempRoot = await mkdtemp(join(tmpdir(), 'manifold-chat-images-test-'))
    const safeSessionDir = join(tempRoot, 'manifold-chat-images', 'sess-1')
    const imagePath = join(safeSessionDir, 'attachment.png')

    try {
      await mkdir(safeSessionDir, { recursive: true })
      await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const deps = {
        sessionManager: {
          listSessions: vi.fn(() => []),
        },
        fileWatcher: {
          unwatch: vi.fn(),
          watch: vi.fn(),
        },
        viewStateStore: { delete: vi.fn() },
      }

      vi.stubEnv('TMPDIR', tempRoot)
      registerAgentHandlers(deps as never)
      const handler = mocks.handlers.get('chat:read-pasted-image')
      if (!handler) throw new Error('chat:read-pasted-image handler was not registered')

      const result = await handler({}, imagePath)

      expect(result).toBe('data:image/png;base64,iVBORw==')
    } finally {
      vi.unstubAllEnvs()
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('reads Codex generated images from CODEX_HOME', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const tempRoot = await mkdtemp(join(tmpdir(), 'manifold-codex-images-test-'))
    const codexHome = join(tempRoot, 'codex-home')
    const imageDir = join(codexHome, 'generated_images', 'turn-1')
    const imagePath = join(imageDir, 'generated.png')

    try {
      await mkdir(imageDir, { recursive: true })
      await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const deps = {
        sessionManager: {
          listSessions: vi.fn(() => []),
        },
        fileWatcher: {
          unwatch: vi.fn(),
          watch: vi.fn(),
        },
        viewStateStore: { delete: vi.fn() },
      }

      vi.stubEnv('CODEX_HOME', codexHome)
      registerAgentHandlers(deps as never)
      const handler = mocks.handlers.get('chat:read-pasted-image')
      if (!handler) throw new Error('chat:read-pasted-image handler was not registered')

      const result = await handler({}, imagePath)

      expect(result).toBe('data:image/png;base64,iVBORw==')
    } finally {
      vi.unstubAllEnvs()
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('reads generated images stored in the active project', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const worktreePath = await mkdtemp(join(tmpdir(), 'manifold-project-images-test-'))
    const imageDir = join(worktreePath, 'public', 'generated-images')
    const imagePath = join(imageDir, 'generated.png')

    try {
      await mkdir(imageDir, { recursive: true })
      await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const deps = {
        projectRegistry: {
          listProjects: vi.fn(() => []),
        },
        sessionManager: {
          listSessions: vi.fn(() => []),
          getSession: vi.fn(() => ({ id: 'sess-1', projectId: 'proj-1', worktreePath })),
        },
        fileWatcher: {
          unwatch: vi.fn(),
          watch: vi.fn(),
        },
        viewStateStore: { delete: vi.fn() },
      }

      registerAgentHandlers(deps as never)
      const handler = mocks.handlers.get('chat:read-pasted-image')
      if (!handler) throw new Error('chat:read-pasted-image handler was not registered')

      const result = await handler({}, imagePath, 'sess-1')

      expect(result).toBe('data:image/png;base64,iVBORw==')
    } finally {
      await rm(worktreePath, { recursive: true, force: true })
    }
  })

  it('reads image paths relative to the active session worktree', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const worktreePath = await mkdtemp(join(tmpdir(), 'manifold-project-image-path-test-'))
    const imageDir = join(worktreePath, 'assets')
    const imagePath = join(imageDir, 'bike.png')

    try {
      await mkdir(imageDir, { recursive: true })
      await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const deps = {
        projectRegistry: {
          listProjects: vi.fn(() => []),
        },
        sessionManager: {
          listSessions: vi.fn(() => []),
          getSession: vi.fn(() => ({ id: 'sess-1', projectId: 'proj-1', worktreePath })),
        },
        fileWatcher: {
          unwatch: vi.fn(),
          watch: vi.fn(),
        },
        viewStateStore: { delete: vi.fn() },
      }

      registerAgentHandlers(deps as never)
      const handler = mocks.handlers.get('chat:read-pasted-image')
      if (!handler) throw new Error('chat:read-pasted-image handler was not registered')

      const result = await handler({}, 'assets/bike.png', 'sess-1')

      expect(result).toBe('data:image/png;base64,iVBORw==')
    } finally {
      await rm(worktreePath, { recursive: true, force: true })
    }
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

  it('rejects relative image paths outside the active session worktree', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const worktreePath = await mkdtemp(join(tmpdir(), 'manifold-project-image-path-test-'))
    const outsidePath = await mkdtemp(join(tmpdir(), 'manifold-outside-image-test-'))
    const imagePath = join(outsidePath, 'bike.png')

    try {
      await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const deps = {
        projectRegistry: {
          listProjects: vi.fn(() => []),
        },
        sessionManager: {
          listSessions: vi.fn(() => []),
          getSession: vi.fn(() => ({ id: 'sess-1', projectId: 'proj-1', worktreePath })),
        },
        fileWatcher: {
          unwatch: vi.fn(),
          watch: vi.fn(),
        },
        viewStateStore: { delete: vi.fn() },
      }

      registerAgentHandlers(deps as never)
      const handler = mocks.handlers.get('chat:read-pasted-image')
      if (!handler) throw new Error('chat:read-pasted-image handler was not registered')

      await expect(handler({}, join('..', '..', imagePath), 'sess-1')).rejects.toThrow('Image path is outside')
    } finally {
      await rm(worktreePath, { recursive: true, force: true })
      await rm(outsidePath, { recursive: true, force: true })
    }
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
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('agent:delete-app')
    if (!handler) throw new Error('agent:delete-app handler was not registered')

    await handler({}, 'sess-1', 'proj-1')
    expect(deps.workspaceManager.removeProjectFromAllWorkspaces).toHaveBeenCalledWith('proj-1')
    expect(deps.projectRegistry.removeProject).toHaveBeenCalledWith('proj-1')
  })
})
