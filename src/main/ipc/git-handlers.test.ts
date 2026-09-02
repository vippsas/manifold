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
    stagePaths: vi.fn(),
    unstagePaths: vi.fn(),
    discardPaths: vi.fn(),
    commitIndex: vi.fn(),
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

// The index operations run real git against a real repo in
// managed-worktree.staging.test.ts; here we only care that each channel is
// wired to the right one with the right checkout.
vi.mock('../git/managed-worktree', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../git/managed-worktree')>()),
  stageManagedWorktreePaths: mocks.stagePaths,
  unstageManagedWorktreePaths: mocks.unstagePaths,
  discardManagedWorktreePaths: mocks.discardPaths,
  commitManagedWorktreeIndex: mocks.commitIndex,
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
    mocks.gitExec.mockImplementation(async (args: string[]) => args[0] === 'rev-list' ? '2 3\n' : 'manifold/feature\n')
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
        upstreamAheadBehind: { behind: 2, ahead: 3 },
        staged: [],
        unstaged: [{ path: 'src/a.ts', type: 'modified' }],
        untracked: [{ path: 'b.ts', type: 'added' }],
      },
    ])
    expect(mocks.gitExec).toHaveBeenCalledWith(['rev-parse', '--abbrev-ref', 'HEAD'], '/worktrees/repo-one')
    expect(mocks.gitExec).toHaveBeenCalledWith(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], '/worktrees/repo-one')
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
      { projectId: 'p1', projectName: 'repo-one', checkoutPath: '/repos/repo-one', branch: 'main', staged: [], unstaged: [], untracked: [] },
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
      { projectId: 'p1', projectName: 'repo-one', checkoutPath: '/repos/repo-one', branch: '', staged: [], unstaged: [], untracked: [] },
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

  it('git:workspace-commit commits only the index when the panel staged explicitly', async () => {
    const { commit } = await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-commit')!

    await handler({}, 'ws-1', 'p1', 'fix: adjust checkout flow', false)

    expect(mocks.commitIndex).toHaveBeenCalledWith('/worktrees/repo-one', 'fix: adjust checkout flow')
    // The stage-all path is a different commit entirely; it must not run here.
    expect(commit).not.toHaveBeenCalled()
  })

  it('git:workspace-commit stages everything first when the panel asked to', async () => {
    const { commit } = await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-commit')!

    await handler({}, 'ws-1', 'p1', 'wip', true)

    expect(commit).toHaveBeenCalledWith('/worktrees/repo-one', 'wip')
    expect(mocks.commitIndex).not.toHaveBeenCalled()
  })

  it('git:workspace-stage, -unstage and -discard address the workspace checkout', async () => {
    await registerHandlers()

    await mocks.handlers.get('git:workspace-stage')!({}, 'ws-1', 'p1', ['src/a.ts'])
    await mocks.handlers.get('git:workspace-unstage')!({}, 'ws-1', 'p1', ['src/b.ts'])
    await mocks.handlers.get('git:workspace-discard')!({}, 'ws-1', 'p1', ['src/c.ts'])

    expect(mocks.stagePaths).toHaveBeenCalledWith('/worktrees/repo-one', ['src/a.ts'])
    expect(mocks.unstagePaths).toHaveBeenCalledWith('/worktrees/repo-one', ['src/b.ts'])
    expect(mocks.discardPaths).toHaveBeenCalledWith('/worktrees/repo-one', ['src/c.ts'])
  })

  it('git:workspace-checkout switches an existing branch and pokes the sidebar', async () => {
    mocks.gitExec.mockResolvedValue('')
    const { send } = await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-checkout')!

    await handler({}, 'ws-1', 'p1', 'feature/login', 'switch')

    expect(mocks.gitExec).toHaveBeenCalledWith(['checkout', 'feature/login'], '/worktrees/repo-one')
    expect(send).toHaveBeenCalledWith('workspace:list-changed')
  })

  it('git:workspace-checkout creates a new branch with checkout -b', async () => {
    mocks.gitExec.mockResolvedValue('')
    await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-checkout')!

    await handler({}, 'ws-1', 'p1', 'feature/new-thing', 'create')

    expect(mocks.gitExec).toHaveBeenCalledWith(['checkout', '-b', 'feature/new-thing'], '/worktrees/repo-one')
  })

  it('git:workspace-checkout creates from a selected ref', async () => {
    mocks.gitExec.mockResolvedValue('')
    await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-checkout')!

    await handler({}, 'ws-1', 'p1', 'feature/new-thing', 'create', 'origin/develop')

    expect(mocks.gitExec).toHaveBeenCalledWith(
      ['checkout', '-b', 'feature/new-thing', 'origin/develop'],
      '/worktrees/repo-one',
    )
  })

  it('git:workspace-checkout can checkout a ref detached', async () => {
    mocks.gitExec.mockResolvedValue('')
    await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-checkout')!

    await handler({}, 'ws-1', 'p1', 'origin/release', 'detach')

    expect(mocks.gitExec).toHaveBeenCalledWith(['checkout', '--detach', 'origin/release'], '/worktrees/repo-one')
  })

  it('git:workspace-checkout surfaces git failures and does not poke the sidebar', async () => {
    mocks.gitExec.mockRejectedValue(new Error('local changes would be overwritten'))
    const { send } = await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-checkout')!

    await expect(handler({}, 'ws-1', 'p1', 'main', 'switch')).rejects.toThrow('local changes would be overwritten')
    expect(send).not.toHaveBeenCalled()
  })

  it('git:workspace-pull fast-forwards, pushes, and refreshes the renderer', async () => {
    mocks.gitExec
      .mockResolvedValueOnce('Already up to date.')
      .mockResolvedValueOnce('Everything up-to-date')
    const { send } = await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-pull')!

    const result = await handler({}, 'ws-1', 'p1')

    expect(mocks.gitExec).toHaveBeenNthCalledWith(1, ['pull', '--ff-only'], '/worktrees/repo-one')
    expect(mocks.gitExec).toHaveBeenNthCalledWith(2, ['push'], '/worktrees/repo-one')
    expect(result).toEqual({
      ok: true,
      output: 'Repository: /worktrees/repo-one\n\n$ git pull --ff-only\nAlready up to date.\n\n$ git push\nEverything up-to-date',
    })
    expect(send).toHaveBeenCalledWith('workspace:list-changed')
  })

  it('git:workspace-pull returns pull failures with command output and skips push', async () => {
    mocks.gitExec.mockRejectedValue(new Error('Not possible to fast-forward'))
    const { send } = await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-pull')!

    await expect(handler({}, 'ws-1', 'p1')).resolves.toEqual({
      ok: false,
      failedCommand: 'pull',
      message: 'Not possible to fast-forward',
      output: 'Repository: /worktrees/repo-one\n\n$ git pull --ff-only\nNot possible to fast-forward',
    })
    expect(mocks.gitExec).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('workspace:list-changed')
  })

  it('git:workspace-pull returns push failures after a successful pull', async () => {
    mocks.gitExec
      .mockResolvedValueOnce('Already up to date.')
      .mockRejectedValueOnce(new Error('remote rejected the push'))
    const { send } = await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-pull')!

    await expect(handler({}, 'ws-1', 'p1')).resolves.toEqual({
      ok: false,
      failedCommand: 'push',
      message: 'remote rejected the push',
      output: 'Repository: /worktrees/repo-one\n\n$ git pull --ff-only\nAlready up to date.\n\n$ git push\nremote rejected the push',
    })
    expect(send).toHaveBeenCalledWith('workspace:list-changed')
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

  it('git:workspace-file-diff diffs an unstaged row against the index', async () => {
    mocks.gitExec.mockImplementation(async (args: string[]) => {
      if (args[0] === 'show') return 'index content'
      return 'diff --git a/src/app.ts b/src/app.ts\n-old\n+new'
    })
    await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-file-diff')!

    const result = await handler({}, 'ws-1', 'p1', 'src/app.ts', false)

    // `:path` is the index version — the left side an unstaged change is
    // actually measured against once something else is staged.
    expect(mocks.gitExec).toHaveBeenCalledWith(['show', ':src/app.ts'], '/worktrees/repo-one')
    expect(mocks.gitExec).toHaveBeenCalledWith(['diff', '--', 'src/app.ts'], '/worktrees/repo-one')
    expect(result).toEqual({ diff: 'diff --git a/src/app.ts b/src/app.ts\n-old\n+new', original: 'index content' })
  })

  it('git:workspace-file-diff diffs a staged row against HEAD', async () => {
    mocks.gitExec.mockImplementation(async (args: string[]) => {
      if (args[0] === 'show') return 'head content'
      return 'diff --git a/src/app.ts b/src/app.ts\n-head\n+staged'
    })
    await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-file-diff')!

    const result = await handler({}, 'ws-1', 'p1', 'src/app.ts', true)

    expect(mocks.gitExec).toHaveBeenCalledWith(['show', 'HEAD:src/app.ts'], '/worktrees/repo-one')
    expect(mocks.gitExec).toHaveBeenCalledWith(['diff', '--cached', '--', 'src/app.ts'], '/worktrees/repo-one')
    expect(result).toEqual({ diff: 'diff --git a/src/app.ts b/src/app.ts\n-head\n+staged', original: 'head content' })
  })

  it('git:workspace-file-diff treats a file the base side lacks as a full add', async () => {
    mocks.gitExec.mockImplementation(async (args: string[]) => {
      if (args[0] === 'show') throw new Error('does not exist in HEAD')
      return ''
    })
    await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-file-diff')!

    const result = await handler({}, 'ws-1', 'p1', 'src/new-file.ts', false)

    expect(result).toEqual({ diff: '', original: '' })
  })

  it('git:workspace-file-diff returns nulls when the file has no uncommitted change', async () => {
    mocks.gitExec.mockImplementation(async (args: string[]) => {
      if (args[0] === 'show') return 'unchanged content'
      return '\n'
    })
    await registerHandlers()
    const handler = mocks.handlers.get('git:workspace-file-diff')!

    const result = await handler({}, 'ws-1', 'p1', 'src/app.ts', false)

    expect(result).toEqual({ diff: null, original: null })
  })
})
