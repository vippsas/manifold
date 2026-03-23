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
