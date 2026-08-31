import { beforeEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
    fromWebContents: vi.fn(),
  }
})

const processMocks = vi.hoisted(() => ({
  execFile: vi.fn((_: string, __: string[], ___: unknown, callback?: (error: Error | null, stdout?: string, stderr?: string) => void) => {
    callback?.(null, '', '')
  }),
  spawn: vi.fn(),
}))

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
}))

const runtimeMocks = vi.hoisted(() => ({
  getRuntimeById: vi.fn(() => undefined),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: electronMocks.handle,
  },
  dialog: {
    showSaveDialog: electronMocks.showSaveDialog,
    showOpenDialog: electronMocks.showOpenDialog,
  },
  BrowserWindow: {
    fromWebContents: electronMocks.fromWebContents,
  },
}))

vi.mock('node:child_process', () => ({
  default: {
    execFile: processMocks.execFile,
    spawn: processMocks.spawn,
  },
  execFile: processMocks.execFile,
  spawn: processMocks.spawn,
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: fsMocks.existsSync,
    mkdirSync: fsMocks.mkdirSync,
    writeFileSync: fsMocks.writeFileSync,
    rmSync: fsMocks.rmSync,
  },
  existsSync: fsMocks.existsSync,
  mkdirSync: fsMocks.mkdirSync,
  writeFileSync: fsMocks.writeFileSync,
  rmSync: fsMocks.rmSync,
}))

vi.mock('../agent/runtimes', () => ({
  getRuntimeById: runtimeMocks.getRuntimeById,
}))

describe('registerProjectHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    electronMocks.handlers.clear()
    fsMocks.existsSync.mockReturnValue(false)
    processMocks.execFile.mockImplementation((_: string, __: string[], ___: unknown, callback?: (error: Error | null, stdout?: string, stderr?: string) => void) => {
      callback?.(null, '', '')
    })
    runtimeMocks.getRuntimeById.mockReturnValue(undefined)
  })

  // Joining the workspace is what makes the folder visible: a repo the registry
  // holds but no workspace does has no row to appear in, so a failed join that
  // left the registration behind read as "the click did nothing".
  it('projects:add unregisters a newly added folder when joining the workspace fails', async () => {
    const { registerProjectHandlers } = await import('./project-handlers')
    const project = { id: 'project-1', name: 'api', path: '/repo/api', baseBranch: 'main', addedAt: '2026-04-01T00:00:00.000Z' }
    const deps = {
      settingsStore: { getSettings: vi.fn(() => ({ storagePath: '/workspace', defaultRuntime: 'claude' })) },
      projectRegistry: {
        listProjects: vi.fn(() => []),
        addProject: vi.fn(async () => project),
        removeProject: vi.fn(),
      },
      workspaceManager: {
        get: vi.fn(() => ({ id: 'ws-1' })),
        addProject: vi.fn(async () => { throw new Error("fatal: a branch named 'manifold/auth' already exists") }),
        adoptProject: vi.fn(),
      },
    }

    registerProjectHandlers(deps as never)
    const handler = electronMocks.handlers.get('projects:add')
    if (!handler) throw new Error('projects:add handler was not registered')

    await expect(handler({}, '/repo/api', 'ws-1')).rejects.toThrow('already exists')
    expect(deps.projectRegistry.removeProject).toHaveBeenCalledWith('project-1')
  })

  it('projects:add keeps a folder that was already registered when joining fails', async () => {
    const { registerProjectHandlers } = await import('./project-handlers')
    const project = { id: 'project-1', name: 'api', path: '/repo/api', baseBranch: 'main', addedAt: '2026-04-01T00:00:00.000Z' }
    const deps = {
      settingsStore: { getSettings: vi.fn(() => ({ storagePath: '/workspace', defaultRuntime: 'claude' })) },
      projectRegistry: {
        listProjects: vi.fn(() => [project]),
        addProject: vi.fn(async () => project),
        removeProject: vi.fn(),
      },
      workspaceManager: {
        get: vi.fn(() => ({ id: 'ws-1' })),
        addProject: vi.fn(async () => { throw new Error('worktree add failed') }),
        adoptProject: vi.fn(),
      },
    }

    registerProjectHandlers(deps as never)
    const handler = electronMocks.handlers.get('projects:add')
    if (!handler) throw new Error('projects:add handler was not registered')

    await expect(handler({}, '/repo/api', 'ws-1')).rejects.toThrow('worktree add failed')
    expect(deps.projectRegistry.removeProject).not.toHaveBeenCalled()
  })

  it('creates a repository with the chosen name and initializes main as the default branch', async () => {
    const { registerProjectHandlers } = await import('./project-handlers')
    const project = {
      id: 'project-1',
      name: 'timer-app',
      path: '/workspace/projects/timer-app',
      baseBranch: 'main',
      addedAt: '2026-04-01T00:00:00.000Z',
    }
    const deps = {
      settingsStore: {
        getSettings: vi.fn(() => ({
          storagePath: '/workspace',
          defaultRuntime: 'claude',
        })),
      },
      projectRegistry: {
        listProjects: vi.fn(() => []),
        addProject: vi.fn(async () => project),
      },
      workspaceManager: { adoptProject: vi.fn() },
    }

    registerProjectHandlers(deps as never)
    const handler = electronMocks.handlers.get('projects:create-new')
    if (!handler) throw new Error('projects:create-new handler was not registered')

    const result = await handler({}, {
      description: 'Build a timer app',
      repoName: 'timer-app',
    })

    expect(fsMocks.mkdirSync).toHaveBeenCalledWith('/workspace/projects/timer-app', { recursive: true })
    expect(fsMocks.writeFileSync).not.toHaveBeenCalled()
    expect(processMocks.execFile).toHaveBeenNthCalledWith(
      1,
      'git',
      ['init', '--initial-branch=main'],
      { cwd: '/workspace/projects/timer-app' },
      expect.any(Function)
    )
    expect(processMocks.execFile).toHaveBeenNthCalledWith(
      2,
      'git',
      ['-c', 'user.email=manifold@local', '-c', 'user.name=Manifold', 'commit', '--allow-empty', '-m', 'Initial commit'],
      { cwd: '/workspace/projects/timer-app' },
      expect.any(Function)
    )
    expect(deps.projectRegistry.addProject).toHaveBeenCalledWith('/workspace/projects/timer-app', {})
    expect(result).toEqual(project)
  })

  it('clones a GitHub repository from copied instructions into an automatically named project directory', async () => {
    const { registerProjectHandlers } = await import('./project-handlers')
    const project = {
      id: 'project-cloned',
      name: 'copied-app',
      path: '/workspace/projects/copied-app',
      baseBranch: 'main',
      addedAt: '2026-04-01T00:00:00.000Z',
      kind: 'git',
    }
    const deps = {
      settingsStore: {
        getSettings: vi.fn(() => ({
          storagePath: '/workspace',
          defaultRuntime: 'claude',
        })),
      },
      projectRegistry: {
        listProjects: vi.fn(() => []),
        addProject: vi.fn(async () => project),
      },
      workspaceManager: { adoptProject: vi.fn() },
    }

    registerProjectHandlers(deps as never)
    const handler = electronMocks.handlers.get('projects:create-new')
    if (!handler) throw new Error('projects:create-new handler was not registered')

    const result = await handler({}, {
      description: 'Clone https://github.com/sven/copied-app.git and continue.',
      projectKind: 'folder',
    })

    expect(fsMocks.mkdirSync).toHaveBeenCalledWith('/workspace/projects', { recursive: true })
    expect(processMocks.execFile).toHaveBeenCalledWith(
      'git',
      ['clone', '--', 'https://github.com/sven/copied-app.git', '/workspace/projects/copied-app'],
      {},
      expect.any(Function)
    )
    expect(processMocks.spawn).not.toHaveBeenCalled()
    expect(deps.projectRegistry.addProject).toHaveBeenCalledWith('/workspace/projects/copied-app', {})
    expect(result).toEqual(project)
  })

  it('creates a plain folder project without initializing git when copied instructions have no repository URL', async () => {
    const { registerProjectHandlers } = await import('./project-handlers')
    const project = {
      id: 'project-plain',
      name: 'copied-app',
      path: '/workspace/projects/clone-the-prepared-repository',
      baseBranch: '',
      addedAt: '2026-04-01T00:00:00.000Z',
      kind: 'folder',
    }
    const deps = {
      settingsStore: {
        getSettings: vi.fn(() => ({
          storagePath: '/workspace',
          defaultRuntime: 'claude',
        })),
      },
      projectRegistry: {
        listProjects: vi.fn(() => []),
        addProject: vi.fn(async () => project),
      },
      workspaceManager: { adoptProject: vi.fn() },
    }

    registerProjectHandlers(deps as never)
    const handler = electronMocks.handlers.get('projects:create-new')
    if (!handler) throw new Error('projects:create-new handler was not registered')

    const result = await handler({}, {
      description: 'Clone the prepared repository.',
      projectKind: 'folder',
    })

    expect(fsMocks.mkdirSync).toHaveBeenCalledWith('/workspace/projects/clone-the-prepared-repository', { recursive: true })
    expect(processMocks.execFile).not.toHaveBeenCalled()
    expect(processMocks.spawn).not.toHaveBeenCalled()
    expect(deps.projectRegistry.addProject).toHaveBeenCalledWith('/workspace/projects/clone-the-prepared-repository', { kind: 'folder' })
    expect(result).toEqual(project)
  })

  it('adds a selected folder through projects:add without extra git validation', async () => {
    const { registerProjectHandlers } = await import('./project-handlers')
    const project = {
      id: 'project-2',
      name: 'plain-folder',
      path: '/workspace/plain-folder',
      baseBranch: '',
      addedAt: '2026-04-01T00:00:00.000Z',
      kind: 'folder',
    }
    const deps = {
      projectRegistry: {
        listProjects: vi.fn(() => []),
        addProject: vi.fn(async () => project),
      },
      workspaceManager: { adoptProject: vi.fn() },
    }

    registerProjectHandlers(deps as never)
    const handler = electronMocks.handlers.get('projects:add')
    if (!handler) throw new Error('projects:add handler was not registered')

    const result = await handler({}, '/workspace/plain-folder')

    expect(processMocks.execFile).not.toHaveBeenCalled()
    expect(deps.projectRegistry.addProject).toHaveBeenCalledWith('/workspace/plain-folder', {})
    expect(result).toEqual(project)
  })

  it('adds a git repository through projects:add when the registry returns one', async () => {
    const { registerProjectHandlers } = await import('./project-handlers')
    const project = {
      id: 'project-3',
      name: 'repo',
      path: '/workspace/repo',
      baseBranch: 'main',
      addedAt: '2026-04-01T00:00:00.000Z',
      kind: 'git',
    }

    const deps = {
      projectRegistry: {
        listProjects: vi.fn(() => []),
        addProject: vi.fn(async () => project),
      },
      workspaceManager: { adoptProject: vi.fn() },
    }

    registerProjectHandlers(deps as never)
    const handler = electronMocks.handlers.get('projects:add')
    if (!handler) throw new Error('projects:add handler was not registered')

    await expect(handler({}, '/workspace/repo')).resolves.toEqual(project)
    expect(deps.projectRegistry.addProject).toHaveBeenCalledWith('/workspace/repo', {})
    // A repo is only reachable through a workspace, so registering one adopts it.
    expect(deps.workspaceManager.adoptProject).toHaveBeenCalledWith(project)
  })

  // Adopting first and joining second would leave the folder in two workspaces,
  // so it shows twice in the sidebar: as its own row and inside the workspace.
  it('projects:add joins the given workspace instead of minting a home one', async () => {
    const { registerProjectHandlers } = await import('./project-handlers')
    const project = {
      id: 'project-4',
      name: 'joined',
      path: '/workspace/joined',
      baseBranch: 'main',
      addedAt: '2026-04-01T00:00:00.000Z',
      kind: 'git',
    }

    const deps = {
      projectRegistry: {
        listProjects: vi.fn(() => []),
        addProject: vi.fn(async () => project),
      },
      workspaceManager: {
        adoptProject: vi.fn(),
        addProject: vi.fn(async () => undefined),
        get: vi.fn(() => ({ id: 'ws-1', name: 'jacob-co-2', projectIds: ['api'] })),
      },
    }

    registerProjectHandlers(deps as never)
    const handler = electronMocks.handlers.get('projects:add')
    if (!handler) throw new Error('projects:add handler was not registered')

    await expect(handler({}, '/workspace/joined', 'ws-1')).resolves.toEqual(project)
    expect(deps.workspaceManager.addProject).toHaveBeenCalledWith('ws-1', 'project-4')
    expect(deps.workspaceManager.adoptProject).not.toHaveBeenCalled()
  })

  // A workspace removed between render and click must not leave the folder held
  // by nothing — a repo no workspace holds has no row to appear in.
  it('projects:add falls back to a home workspace when the target is gone', async () => {
    const { registerProjectHandlers } = await import('./project-handlers')
    const project = {
      id: 'project-5',
      name: 'orphan',
      path: '/workspace/orphan',
      baseBranch: 'main',
      addedAt: '2026-04-01T00:00:00.000Z',
      kind: 'git',
    }

    const deps = {
      projectRegistry: {
        listProjects: vi.fn(() => []),
        addProject: vi.fn(async () => project),
      },
      workspaceManager: {
        adoptProject: vi.fn(),
        addProject: vi.fn(async () => undefined),
        get: vi.fn(() => undefined),
      },
    }

    registerProjectHandlers(deps as never)
    const handler = electronMocks.handlers.get('projects:add')
    if (!handler) throw new Error('projects:add handler was not registered')

    await handler({}, '/workspace/orphan', 'ws-gone')
    expect(deps.workspaceManager.addProject).not.toHaveBeenCalled()
    expect(deps.workspaceManager.adoptProject).toHaveBeenCalledWith(project)
  })

  it('rejects duplicate explicit repository names instead of silently renaming them', async () => {
    const { registerProjectHandlers } = await import('./project-handlers')
    fsMocks.existsSync.mockImplementation((target: string) => target === '/workspace/projects/timer-app')

    const deps = {
      settingsStore: {
        getSettings: vi.fn(() => ({
          storagePath: '/workspace',
          defaultRuntime: 'claude',
        })),
      },
      projectRegistry: {
        listProjects: vi.fn(() => []),
        addProject: vi.fn(),
      },
    }

    registerProjectHandlers(deps as never)
    const handler = electronMocks.handlers.get('projects:create-new')
    if (!handler) throw new Error('projects:create-new handler was not registered')

    await expect(handler({}, {
      description: 'Build a timer app',
      repoName: 'timer-app',
    })).rejects.toThrow('A repository named "timer-app" already exists')

    expect(fsMocks.mkdirSync).not.toHaveBeenCalled()
    expect(processMocks.execFile).not.toHaveBeenCalled()
    expect(deps.projectRegistry.addProject).not.toHaveBeenCalled()
  })

  it('projects:remove detaches the project from every workspace so no dangling id is left behind', async () => {
    const { registerProjectHandlers } = await import('./project-handlers')
    const deps = {
      settingsStore: {
        getSettings: vi.fn(() => ({
          storagePath: '/workspace',
          defaultRuntime: 'claude',
        })),
      },
      projectRegistry: {
        listProjects: vi.fn(() => []),
        removeProject: vi.fn(() => true),
      },
      verdictStore: { deleteByProject: vi.fn() },
      chatStore: { deleteByProject: vi.fn() },
      memoryStore: { deleteProject: vi.fn() },
      workspaceManager: { removeProjectFromAllWorkspaces: vi.fn() },
      dismissedAgents: { deleteProject: vi.fn() },
    }

    registerProjectHandlers(deps as never)
    const handler = electronMocks.handlers.get('projects:remove')
    if (!handler) throw new Error('projects:remove handler was not registered')

    expect(await handler({}, 'proj-1')).toBe(true)
    expect(deps.workspaceManager.removeProjectFromAllWorkspaces).toHaveBeenCalledWith('proj-1')
    expect(deps.dismissedAgents.deleteProject).toHaveBeenCalledWith('proj-1')
    expect(deps.projectRegistry.removeProject).toHaveBeenCalledWith('proj-1')
  })
})
