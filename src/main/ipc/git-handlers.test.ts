import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    status: vi.fn(),
    exec: vi.fn(),
    mutate: vi.fn(),
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

vi.mock('../git/git-exec', () => ({ gitExec: mocks.exec }))
vi.mock('../fs/file-watcher-utils', async (importOriginal) => ({
  ...await importOriginal<typeof import('../fs/file-watcher-utils')>(),
  gitStatus: mocks.status,
  buildChangeFingerprint: async () => 'fixture',
}))
vi.mock('../git/managed-worktree', () => ({
  stageManagedWorktreePaths: mocks.mutate,
  unstageManagedWorktreePaths: mocks.mutate,
  discardManagedWorktreePaths: mocks.mutate,
  commitManagedWorktreeIndex: mocks.mutate,
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

describe('registerGitHandlers session reads', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('resolves ahead/behind to zero before discovery and reads it after registration', async () => {
    const { registerGitHandlers } = await import('./git-handlers')
    const sessions = new Map<string, { projectId: string; worktreePath: string; baseBranch: string }>()
    const getAheadBehind = vi.fn(async () => ({ ahead: 2, behind: 3 }))
    const getProject = vi.fn(() => ({ kind: 'git', baseBranch: 'main' }))
    registerGitHandlers({
      sessionManager: { getSession: (id: string) => sessions.get(id) },
      projectRegistry: { getProject },
      gitOps: { getAheadBehind },
    } as never)
    const handler = mocks.handlers.get('git:ahead-behind')!

    await expect(handler({}, 'restored')).resolves.toEqual({ ahead: 0, behind: 0 })
    expect(getProject).not.toHaveBeenCalled()
    expect(getAheadBehind).not.toHaveBeenCalled()

    sessions.set('restored', { projectId: 'p1', worktreePath: '/wt', baseBranch: 'develop' })
    await expect(handler({}, 'restored')).resolves.toEqual({ ahead: 2, behind: 3 })
    expect(getAheadBehind).toHaveBeenCalledWith('/wt', 'develop')
  })

  it.each([
    ['git:commit', ['message']],
    ['git:resolve-conflict', ['file.ts', 'resolved']],
  ])('still rejects an unknown session for %s', async (channel, args) => {
    const { registerGitHandlers } = await import('./git-handlers')
    const commit = vi.fn()
    const resolveConflict = vi.fn()
    registerGitHandlers({
      sessionManager: { getSession: () => undefined },
      gitOps: { commit, resolveConflict },
    } as never)

    await expect(mocks.handlers.get(channel)!({}, 'missing', ...args))
      .rejects.toThrow('Session not found: missing')
    expect(commit).not.toHaveBeenCalled()
    expect(resolveConflict).not.toHaveBeenCalled()
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

describe('git mutations invalidate shared workspace status', () => {
  let poller: import('../fs/checkout-status-poller').CheckoutStatusPoller

  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    mocks.handlers.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    poller?.unwatchAll()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it.each([
    ['git:workspace-stage', ['ws', 'p1', ['file.ts']], 'M  file.ts\n'],
    ['git:workspace-unstage', ['ws', 'p1', ['file.ts']], '?? new.ts\n'],
    ['git:workspace-discard', ['ws', 'p1', ['file.ts']], ''],
    ['git:workspace-commit', ['ws', 'p1', 'commit', false], ''],
    ['git:workspace-commit', ['ws', 'p1', 'commit', true], ''],
    ['git:workspace-checkout', ['ws', 'p1', 'feature', 'switch'], '?? new.ts\n'],
    ['git:workspace-pull', ['ws', 'p1'], '?? new.ts\n'],
    ['git:commit', ['session', 'commit'], ''],
    ['git:resolve-conflict', ['session', 'file.ts', 'resolved'], 'M  file.ts\n'],
  ])('%s forces a fresh read with the resulting status groups', async (channel, args, next) => {
    // An in-memory Git adapter makes status and mutation use the same checkout state.
    let porcelain = ' M file.ts\n'
    mocks.status.mockImplementation(async () => porcelain)
    mocks.mutate.mockImplementation(async () => { porcelain = next })
    mocks.exec.mockImplementation(async (command: string[]) => {
      if (['checkout', 'pull'].includes(command[0])) porcelain = next
      return command[0] === 'rev-list' ? '2 3' : 'main'
    })
    const { CheckoutStatusPoller } = await import('../fs/checkout-status-poller')
    const { registerGitHandlers } = await import('./git-handlers')
    registerGitHandlers({
      gitOps: { commit: mocks.mutate, resolveConflict: mocks.mutate },
      sessionManager: { getSession: () => ({ projectId: 'p1', worktreePath: '/wt/../wt/' }) },
      projectRegistry: { getProject: () => ({ name: 'repo', path: '/repo', kind: 'git' }) },
      workspaceManager: { get: () => ({ projectIds: ['p1'], worktreePaths: { p1: '/wt' } }) },
    } as never)
    poller = new CheckoutStatusPoller(mocks.status, async () => 'main', {
      primary: () => {}, additional: () => {}, branch: () => {},
    })
    poller.watch('/wt/', 'session')
    await vi.advanceTimersByTimeAsync(0)
    const status = () => mocks.handlers.get('git:workspace-status')!({}, 'ws')
    await expect(status()).resolves.toMatchObject([{ unstaged: [{ path: 'file.ts' }] }])
    expect(mocks.status).toHaveBeenCalledTimes(1)

    await mocks.handlers.get(channel)!({}, ...args)
    await expect(status()).resolves.toMatchObject([{
      staged: next.startsWith('M ') ? [{ path: 'file.ts', type: 'modified' }] : [],
      unstaged: [],
      untracked: next.startsWith('??') ? [{ path: 'new.ts', type: 'added' }] : [],
      upstreamAheadBehind: { behind: 2, ahead: 3 },
    }])
    expect(mocks.status).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
  })
})
