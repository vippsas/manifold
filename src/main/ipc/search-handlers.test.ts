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

vi.mock('../search/code-search-service', () => ({
  searchCodeInSessions: vi.fn(async () => ({
    results: [],
    warnings: [],
  })),
}))

describe('registerSearchHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('skips memory search for regex everything queries', async () => {
    const { registerSearchHandlers } = await import('./search-handlers')

    const memoryStore = {
      search: vi.fn(),
      getDb: vi.fn(() => ({
        prepare: vi.fn(() => ({
          all: vi.fn(() => []),
        })),
      })),
    }

    registerSearchHandlers({
      sessionManager: {
        getSession: vi.fn(() => ({
          id: 'session-1',
          projectId: 'project-1',
          runtimeId: 'claude',
          branchName: 'feature/search',
          worktreePath: '/repo',
          status: 'running',
          pid: 1,
          additionalDirs: [],
        })),
        discoverSessionsForProject: vi.fn(async () => []),
      },
      memoryStore,
    } as never)

    const queryHandler = mocks.handlers.get('search:query')
    if (!queryHandler) {
      throw new Error('search:query handler was not registered')
    }

    const response = await queryHandler({}, {
      projectId: 'project-1',
      activeSessionId: 'session-1',
      mode: 'everything',
      query: '^TODO',
      scope: { kind: 'active-session' },
      matchMode: 'regex',
      caseSensitive: false,
      wholeWord: false,
      limit: 100,
    })

    expect(memoryStore.search).not.toHaveBeenCalled()
    expect(response).toMatchObject({
      warnings: ['Memory search does not support regex. Showing code results only.'],
    })
  })
})
