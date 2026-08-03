import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    gitExec: vi.fn(),
    gitStatus: vi.fn(),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
  },
}))

vi.mock('../git/git-exec', () => ({ gitExec: mocks.gitExec }))

vi.mock('../fs/file-watcher-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../fs/file-watcher-utils')>()),
  gitStatus: mocks.gitStatus,
}))

describe('registerDiffHandler', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('returns an empty diff when the session is already gone', async () => {
    const { registerDiffHandler } = await import('./git-handlers')

    registerDiffHandler({
      sessionManager: {
        getSession: vi.fn(() => null),
      },
      projectRegistry: {
        getProject: vi.fn(),
      },
      diffProvider: {
        getDiff: vi.fn(),
        getChangedFiles: vi.fn(),
      },
    } as never)

    const diffHandler = mocks.handlers.get('diff:get')
    if (!diffHandler) {
      throw new Error('diff:get handler was not registered')
    }

    await expect(diffHandler({}, 'missing-session')).resolves.toEqual({
      diff: '',
      changedFiles: [],
    })
  })

  it('diffs against the session base branch when set, else the project base', async () => {
    const { registerDiffHandler } = await import('./git-handlers')
    const getDiff = vi.fn(async () => '')
    const getChangedFiles = vi.fn(async () => [])
    const deps = {
      sessionManager: { getSession: vi.fn() },
      projectRegistry: { getProject: vi.fn(() => ({ id: 'p1', path: '/p1', baseBranch: 'main' })) },
      diffProvider: { getDiff, getChangedFiles },
    }
    registerDiffHandler(deps as never)
    const diffHandler = mocks.handlers.get('diff:get')!

    // Session with its own base branch → compare against it.
    deps.sessionManager.getSession = vi.fn(() => ({ id: 's1', projectId: 'p1', worktreePath: '/wt', baseBranch: 'develop' }))
    await diffHandler({}, 's1')
    expect(getDiff).toHaveBeenLastCalledWith('/wt', 'develop')

    // Session without a base branch → fall back to the project base.
    deps.sessionManager.getSession = vi.fn(() => ({ id: 's2', projectId: 'p1', worktreePath: '/wt2' }))
    await diffHandler({}, 's2')
    expect(getDiff).toHaveBeenLastCalledWith('/wt2', 'main')
  })
})

describe('registerGitHandlers git:staleness', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('returns the behind count for a git project', async () => {
    const { registerGitHandlers } = await import('./git-handlers')
    const getRemoteBehindCount = vi.fn(async () => 3)
    registerGitHandlers({
      gitOps: { getRemoteBehindCount },
      sessionManager: {},
      projectRegistry: {
        getProject: vi.fn(() => ({ id: 'p1', path: '/p1', baseBranch: 'main', kind: 'git' })),
      },
    } as never)

    const handler = mocks.handlers.get('git:staleness')!
    const result = await handler({}, 'p1')

    expect(result).toEqual({ baseBranch: 'main', behindCount: 3 })
    expect(getRemoteBehindCount).toHaveBeenCalledWith('/p1', 'main')
  })

  it('returns 0 for a non-git project without probing', async () => {
    const { registerGitHandlers } = await import('./git-handlers')
    const getRemoteBehindCount = vi.fn()
    registerGitHandlers({
      gitOps: { getRemoteBehindCount },
      sessionManager: {},
      projectRegistry: {
        getProject: vi.fn(() => ({ id: 'p1', path: '/p1', baseBranch: 'main', kind: 'folder' })),
      },
    } as never)

    const handler = mocks.handlers.get('git:staleness')!
    const result = await handler({}, 'p1')

    expect(result).toEqual({ baseBranch: '', behindCount: 0 })
    expect(getRemoteBehindCount).not.toHaveBeenCalled()
  })

  it('throws when the project is missing', async () => {
    const { registerGitHandlers } = await import('./git-handlers')
    registerGitHandlers({
      gitOps: { getRemoteBehindCount: vi.fn() },
      sessionManager: {},
      projectRegistry: { getProject: vi.fn(() => undefined) },
    } as never)

    const handler = mocks.handlers.get('git:staleness')!
    await expect(handler({}, 'nope')).rejects.toThrow('Project not found: nope')
  })
})

describe('registerGitHandlers git:workspace-status', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  async function registerWithWorkspace(workspace: unknown, projects: Record<string, unknown>): Promise<(...args: unknown[]) => unknown> {
    const { registerGitHandlers } = await import('./git-handlers')
    registerGitHandlers({
      gitOps: {},
      sessionManager: {},
      projectRegistry: { getProject: vi.fn((id: string) => projects[id]) },
      workspaceManager: { get: vi.fn(() => workspace) },
    } as never)
    return mocks.handlers.get('git:workspace-status')!
  }

  it('reports each git repo checkout with its branch and parsed changes', async () => {
    mocks.gitExec.mockResolvedValue('manifold/feature\n')
    mocks.gitStatus.mockResolvedValue(' M src/a.ts\n?? b.ts\n')
    const handler = await registerWithWorkspace(
      {
        id: 'ws-1',
        projectIds: ['p1', 'p2'],
        worktreePaths: { p1: '/worktrees/repo-one', p2: '/plain-folder' },
      },
      {
        p1: { id: 'p1', name: 'repo-one', path: '/repos/repo-one', kind: 'git' },
        p2: { id: 'p2', name: 'plain', path: '/plain-folder', kind: 'folder' },
      },
    )

    const result = await handler({}, 'ws-1')

    // The plain folder is skipped; the git repo answers from its worktree.
    expect(result).toEqual([
      {
        projectId: 'p1',
        projectName: 'repo-one',
        checkoutPath: '/worktrees/repo-one',
        branch: 'manifold/feature',
        changes: [
          { path: 'src/a.ts', type: 'modified' },
          { path: 'b.ts', type: 'added' },
        ],
      },
    ])
    expect(mocks.gitExec).toHaveBeenCalledWith(['rev-parse', '--abbrev-ref', 'HEAD'], '/worktrees/repo-one')
    expect(mocks.gitStatus).toHaveBeenCalledWith('/worktrees/repo-one')
  })

  it('reads a home workspace from the clones themselves', async () => {
    mocks.gitExec.mockResolvedValue('main\n')
    mocks.gitStatus.mockResolvedValue('')
    const handler = await registerWithWorkspace(
      { id: 'ws-home', projectIds: ['p1'] },
      { p1: { id: 'p1', name: 'repo-one', path: '/repos/repo-one', kind: 'git' } },
    )

    const result = await handler({}, 'ws-home')

    expect(result).toEqual([
      { projectId: 'p1', projectName: 'repo-one', checkoutPath: '/repos/repo-one', branch: 'main', changes: [] },
    ])
    expect(mocks.gitStatus).toHaveBeenCalledWith('/repos/repo-one')
  })

  it('returns an empty status for a repo whose git calls fail, not an error', async () => {
    mocks.gitExec.mockRejectedValue(new Error('no HEAD'))
    mocks.gitStatus.mockRejectedValue(new Error('timeout'))
    const handler = await registerWithWorkspace(
      { id: 'ws-1', projectIds: ['p1'] },
      { p1: { id: 'p1', name: 'repo-one', path: '/repos/repo-one', kind: 'git' } },
    )

    await expect(handler({}, 'ws-1')).resolves.toEqual([
      { projectId: 'p1', projectName: 'repo-one', checkoutPath: '/repos/repo-one', branch: '', changes: [] },
    ])
  })

  it('returns [] for a missing workspace', async () => {
    const handler = await registerWithWorkspace(undefined, {})
    await expect(handler({}, 'gone')).resolves.toEqual([])
  })
})

describe('registerGitHandlers workspace commit and checkout', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  const workspace = {
    id: 'ws-1',
    projectIds: ['p1'],
    worktreePaths: { p1: '/worktrees/repo-one' },
  }

  async function registerHandlers(overrides: Record<string, unknown> = {}): Promise<{ commit: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> }> {
    const { registerGitHandlers } = await import('./git-handlers')
    const commit = vi.fn(async () => {})
    const send = vi.fn()
    registerGitHandlers({
      gitOps: { commit },
      sessionManager: {},
      projectRegistry: {
        getProject: vi.fn(() => ({ id: 'p1', name: 'repo-one', path: '/repos/repo-one', kind: 'git' })),
      },
      workspaceManager: { get: vi.fn(() => workspace) },
      send,
      ...overrides,
    } as never)
    return { commit, send }
  }

  it('git:workspace-commit commits the workspace checkout via gitOps', async () => {
    const { commit } = await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-commit')!

    await handler({}, 'ws-1', 'p1', 'fix: adjust checkout flow')

    expect(commit).toHaveBeenCalledWith('/worktrees/repo-one', 'fix: adjust checkout flow')
  })

  it('git:workspace-checkout switches an existing branch and pokes the sidebar', async () => {
    mocks.gitExec.mockResolvedValue('')
    const { send } = await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-checkout')!

    await handler({}, 'ws-1', 'p1', 'feature/login', false)

    expect(mocks.gitExec).toHaveBeenCalledWith(['checkout', 'feature/login'], '/worktrees/repo-one')
    expect(send).toHaveBeenCalledWith('workspace:list-changed')
  })

  it('git:workspace-checkout creates a new branch with checkout -b', async () => {
    mocks.gitExec.mockResolvedValue('')
    await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-checkout')!

    await handler({}, 'ws-1', 'p1', 'feature/new-thing', true)

    expect(mocks.gitExec).toHaveBeenCalledWith(['checkout', '-b', 'feature/new-thing'], '/worktrees/repo-one')
  })

  it('git:workspace-checkout surfaces git failures and does not poke the sidebar', async () => {
    mocks.gitExec.mockRejectedValue(new Error('local changes would be overwritten'))
    const { send } = await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-checkout')!

    await expect(handler({}, 'ws-1', 'p1', 'main', false)).rejects.toThrow('local changes would be overwritten')
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects plain-folder projects', async () => {
    await registerHandlers({
      projectRegistry: {
        getProject: vi.fn(() => ({ id: 'p1', name: 'plain', path: '/plain', kind: 'folder' })),
      },
    })
    const handler = mocks.handlers.get('git:workspace-commit')!
    await expect(handler({}, 'ws-1', 'p1', 'msg')).rejects.toThrow('not a git repository')
  })
})
