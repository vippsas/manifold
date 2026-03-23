import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const events = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    events,
    gitExec: vi.fn(async () => ''),
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn)),
    on: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => events.set(channel, fn)),
  }
})

vi.mock('electron', () => ({
  BrowserWindow: class {},
  ipcMain: { handle: mocks.handle, on: mocks.on },
  nativeTheme: { themeSource: 'dark' },
}))

vi.mock('../git/git-exec', () => ({
  gitExec: mocks.gitExec,
}))

function createWindow() {
  return {
    destroy: vi.fn(),
    setBackgroundColor: vi.fn(),
    webContents: { once: vi.fn(), send: vi.fn() },
  }
}

describe('ModeSwitcher', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.events.clear()
    mocks.gitExec.mockResolvedValue('')
  })

  it('returns a pending simple launch after resetting the project state', async () => {
    const { ModeSwitcher } = await import('./mode-switcher')
    const oldWindow = createWindow()
    const newWindow = createWindow()
    let currentWindow: ReturnType<typeof createWindow> | null = oldWindow
    const deps = {
      settingsStore: {
        updateSettings: vi.fn(),
        getSettings: vi.fn(() => ({ storagePath: '/Users/me/.manifold', defaultRuntime: 'claude' })),
      },
      chatStore: { delete: vi.fn() },
      projectRegistry: {
        getProject: vi.fn(() => ({
          id: 'proj-1',
          name: 'clock',
          path: '/Users/me/.manifold/projects/clock',
          baseBranch: 'main',
        })),
      },
      sessionManager: {
        getSession: vi.fn(() => ({
          id: 'active',
          projectId: 'proj-1',
          branchName: 'clock/task-1',
          runtimeId: 'codex',
          noWorktree: false,
          taskDescription: 'clock',
        })),
        getInternalSession: vi.fn((id: string) => (
          id === 'active' || id === 'stale' || id === 'other' ? { nonInteractive: false } : undefined
        )),
        discoverSessionsForProject: vi.fn(async () => []),
        listSessions: vi.fn(() => [
          {
            id: 'active',
            projectId: 'proj-1',
            branchName: 'clock/task-1',
            runtimeId: 'codex',
            noWorktree: false,
            worktreePath: '/wt/1',
            status: 'running',
            pid: 1,
            additionalDirs: [],
            taskDescription: 'clock',
          },
          {
            id: 'stale',
            projectId: 'proj-1',
            branchName: 'clock/task-1',
            runtimeId: 'claude',
            noWorktree: false,
            worktreePath: '/wt/2',
            status: 'done',
            pid: null,
            additionalDirs: [],
            taskDescription: 'old',
          },
          {
            id: 'other',
            projectId: 'proj-1',
            branchName: 'clock/other',
            runtimeId: 'claude',
            noWorktree: false,
            worktreePath: '/wt/3',
            status: 'done',
            pid: null,
            additionalDirs: [],
            taskDescription: 'other',
          },
        ]),
        killNonInteractiveSessions: vi.fn(async () => ({ killedIds: [] })),
        killInteractiveSession: vi.fn(async (id: string) => ({
          projectPath: '/Users/me/.manifold/projects/clock',
          branchName: 'clock/task-1',
          taskDescription: id === 'active' ? 'clock' : 'old',
        })),
        startDevServerSession: vi.fn(async () => ({ sessionId: 'simple-1' })),
      },
    }

    const switcher = new ModeSwitcher(deps as never)
    switcher.register(
      () => { currentWindow = newWindow },
      () => currentWindow as never,
      (win) => { currentWindow = win as never },
    )

    const switchMode = mocks.handlers.get('app:switch-mode')
    const consumeLaunch = mocks.handlers.get('app:consume-pending-launch')
    if (!switchMode || !consumeLaunch) throw new Error('required IPC handlers were not registered')

    await switchMode({}, 'simple', 'proj-1', 'active', 'codex')

    expect(deps.sessionManager.killInteractiveSession).toHaveBeenCalledWith('stale')
    expect(deps.sessionManager.killInteractiveSession).toHaveBeenCalledWith('active')
    expect(deps.sessionManager.killInteractiveSession).not.toHaveBeenCalledWith('other')
    expect(deps.chatStore.delete).toHaveBeenCalledWith('proj-1')
    expect(await consumeLaunch()).toEqual({
      kind: 'simple',
      app: expect.objectContaining({
        sessionId: 'simple-1',
        projectId: 'proj-1',
        runtimeId: 'codex',
        branchName: 'clock/task-1',
        name: 'clock',
      }),
    })
    expect(await consumeLaunch()).toBeNull()
  })

  it('returns a pending developer launch and restores the project base branch after simple mode', async () => {
    const { ModeSwitcher } = await import('./mode-switcher')
    const oldWindow = createWindow()
    const newWindow = createWindow()
    let currentWindow: ReturnType<typeof createWindow> | null = oldWindow
    const deps = {
      settingsStore: {
        updateSettings: vi.fn(),
        getSettings: vi.fn(() => ({ storagePath: '/Users/me/.manifold', defaultRuntime: 'claude' })),
      },
      chatStore: { delete: vi.fn() },
      projectRegistry: {
        getProject: vi.fn(() => ({
          id: 'proj-1',
          name: 'clock',
          path: '/Users/me/.manifold/projects/clock',
          baseBranch: 'main',
        })),
      },
      sessionManager: {
        getSession: vi.fn(() => ({
          id: 'simple-1',
          projectId: 'proj-1',
          branchName: 'clock/task-1',
          runtimeId: 'codex',
          noWorktree: true,
        })),
        getInternalSession: vi.fn((id: string) => (
          id === 'simple-1' ? { nonInteractive: true } : undefined
        )),
        discoverSessionsForProject: vi.fn(async () => []),
        listSessions: vi.fn(() => [
          {
            id: 'simple-1',
            projectId: 'proj-1',
            branchName: 'clock/task-1',
            runtimeId: 'codex',
            noWorktree: true,
            worktreePath: '/Users/me/.manifold/projects/clock',
            status: 'done',
            pid: null,
            additionalDirs: [],
          },
        ]),
        killNonInteractiveSessions: vi.fn(async () => ({
          killedIds: ['simple-1'],
          branchName: 'clock/task-1',
          noWorktree: true,
        })),
        killInteractiveSession: vi.fn(async () => ({ projectPath: '/tmp', branchName: 'clock/task-1' })),
      },
    }

    const switcher = new ModeSwitcher(deps as never)
    switcher.register(
      () => { currentWindow = newWindow },
      () => currentWindow as never,
      (win) => { currentWindow = win as never },
    )

    const switchMode = mocks.handlers.get('app:switch-mode')
    const consumeLaunch = mocks.handlers.get('app:consume-pending-launch')
    if (!switchMode || !consumeLaunch) throw new Error('required IPC handlers were not registered')

    await switchMode({}, 'developer', 'proj-1', 'simple-1', 'codex')

    expect(deps.sessionManager.killNonInteractiveSessions).toHaveBeenCalledWith('proj-1')
    expect(deps.sessionManager.killInteractiveSession).not.toHaveBeenCalled()
    expect(deps.chatStore.delete).toHaveBeenCalledWith('proj-1')
    expect(mocks.gitExec).toHaveBeenCalledWith(['checkout', 'main'], '/Users/me/.manifold/projects/clock')
    expect(await consumeLaunch()).toEqual({
      kind: 'developer',
      projectId: 'proj-1',
      branchName: 'clock/task-1',
      runtimeId: 'codex',
    })
  })
})
