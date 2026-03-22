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

  it('passes memory filters through to the memory backend', async () => {
    const { registerSearchHandlers } = await import('./search-handlers')

    const memoryStore = {
      search: vi.fn(() => ({ results: [], total: 0 })),
      getDb: vi.fn(() => ({
        prepare: vi.fn(() => ({
          all: vi.fn(() => []),
        })),
      })),
    }

    registerSearchHandlers({
      sessionManager: {
        getSession: vi.fn(() => null),
        discoverSessionsForProject: vi.fn(async () => []),
      },
      memoryStore,
    } as never)

    const queryHandler = mocks.handlers.get('search:query')
    if (!queryHandler) {
      throw new Error('search:query handler was not registered')
    }

    await queryHandler({}, {
      projectId: 'project-1',
      activeSessionId: 'session-1',
      mode: 'memory',
      query: 'architecture',
      scope: { kind: 'memory-only' },
      matchMode: 'literal',
      caseSensitive: false,
      wholeWord: false,
      limit: 100,
      memoryFilters: {
        type: 'architecture',
        concepts: ['how-it-works'],
      },
    })

    expect(memoryStore.search).toHaveBeenCalledWith('project-1', 'architecture', {
      type: 'architecture',
      runtimeId: undefined,
      concepts: ['how-it-works'],
      limit: 100,
    })
  })

  it('skips memory search for regex memory queries', async () => {
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
        getSession: vi.fn(() => null),
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
      mode: 'memory',
      query: '^TODO',
      scope: { kind: 'memory-only' },
      matchMode: 'regex',
      caseSensitive: false,
      wholeWord: false,
      limit: 100,
    })

    expect(memoryStore.search).not.toHaveBeenCalled()
    expect(response).toMatchObject({
      warnings: ['Memory search does not support regex. Switch to literal mode.'],
    })
  })

  it('keeps interaction hits when filtering memory search to summaries', async () => {
    const { registerSearchHandlers } = await import('./search-handlers')

    const memoryStore = {
      search: vi.fn(() => ({ results: [], total: 0 })),
      getDb: vi.fn(() => ({
        prepare: vi.fn(() => ({
          all: vi.fn(() => [{
            id: 17,
            sessionId: 'session-1',
            role: 'assistant',
            text: 'Summarized the auth changes and why they matter',
            timestamp: 123,
            runtimeId: 'codex',
            branchName: 'feature/auth-summary',
            worktreePath: '/repo/.manifold/worktrees/feature-auth-summary',
            rank: 0.2,
          }]),
        })),
      })),
    }

    registerSearchHandlers({
      sessionManager: {
        getSession: vi.fn(() => null),
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
      mode: 'memory',
      query: 'auth changes',
      scope: { kind: 'memory-only' },
      matchMode: 'literal',
      caseSensitive: false,
      wholeWord: false,
      limit: 100,
      memoryFilters: {
        type: 'task_summary',
      },
    })

    expect(memoryStore.search).toHaveBeenCalledWith('project-1', 'auth changes', {
      type: 'task_summary',
      runtimeId: undefined,
      concepts: undefined,
      limit: 100,
    })
    expect(response).toMatchObject({
      total: 1,
      results: [{
        id: 'interaction-17',
        source: 'memory',
        memorySource: 'interaction',
        observationType: 'task_summary',
        sessionId: 'session-1',
        runtimeId: 'codex',
        branchName: 'feature/auth-summary',
        worktreePath: '/repo/.manifold/worktrees/feature-auth-summary',
      }],
    })
  })

  it('sanitizes punctuation before querying interaction FTS rows', async () => {
    const { registerSearchHandlers } = await import('./search-handlers')
    const interactionQuery = vi.fn(() => [])

    const memoryStore = {
      search: vi.fn(() => ({ results: [], total: 0 })),
      getDb: vi.fn(() => ({
        prepare: vi.fn(() => ({
          all: interactionQuery,
        })),
      })),
    }

    registerSearchHandlers({
      sessionManager: {
        getSession: vi.fn(() => null),
        discoverSessionsForProject: vi.fn(async () => []),
      },
      memoryStore,
    } as never)

    const queryHandler = mocks.handlers.get('search:query')
    if (!queryHandler) {
      throw new Error('search:query handler was not registered')
    }

    await queryHandler({}, {
      projectId: 'project-1',
      activeSessionId: 'session-1',
      mode: 'memory',
      query: 'How does auth work?',
      scope: { kind: 'memory-only' },
      matchMode: 'literal',
      caseSensitive: false,
      wholeWord: false,
      limit: 100,
    })

    expect(interactionQuery).toHaveBeenCalledWith('"How" "does" "auth" "work"', 100)
  })
})
