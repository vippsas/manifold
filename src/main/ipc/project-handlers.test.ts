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
    }

    registerProjectHandlers(deps as never)
    const handler = electronMocks.handlers.get('projects:create-new')
    if (!handler) throw new Error('projects:create-new handler was not registered')

    const result = await handler({}, {
      description: 'Build a timer app',
      repoName: 'timer-app',
    })

    expect(fsMocks.mkdirSync).toHaveBeenCalledWith('/workspace/projects/timer-app', { recursive: true })
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      '/workspace/projects/timer-app/README.md',
      '# Build a timer app\n\nBuild a timer app\n',
      'utf-8'
    )
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
      ['add', 'README.md'],
      { cwd: '/workspace/projects/timer-app' },
      expect.any(Function)
    )
    expect(processMocks.execFile).toHaveBeenNthCalledWith(
      3,
      'git',
      ['-c', 'user.email=manifold@local', '-c', 'user.name=Manifold', 'commit', '-m', 'Initial commit'],
      { cwd: '/workspace/projects/timer-app' },
      expect.any(Function)
    )
    expect(deps.projectRegistry.addProject).toHaveBeenCalledWith('/workspace/projects/timer-app')
    expect(result).toEqual(project)
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
})
