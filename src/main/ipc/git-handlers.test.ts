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
