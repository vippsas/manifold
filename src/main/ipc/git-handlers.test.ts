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
