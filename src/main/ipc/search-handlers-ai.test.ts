import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    executeSearchQuery: vi.fn(),
    answerSearchQuestion: vi.fn(),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
  },
}))

vi.mock('../search/search-query-service', () => ({
  executeSearchQuery: mocks.executeSearchQuery,
}))

vi.mock('../search/ai-search-service', () => ({
  answerSearchQuestion: mocks.answerSearchQuestion,
}))

describe('registerSearchHandlers AI flow', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('routes search:ask through retrieval and grounded answer synthesis', async () => {
    const { registerSearchHandlers } = await import('./search-handlers')
    mocks.executeSearchQuery.mockResolvedValue({
      results: [{ id: 'code-1', source: 'code', title: 'auth.ts', snippet: 'token', filePath: '/repo/auth.ts', rootPath: '/repo', relativePath: 'auth.ts', line: 1 }],
      total: 1,
      tookMs: 10,
    })
    mocks.answerSearchQuestion.mockResolvedValue({
      answer: 'The auth file changed [S1].',
      citations: [],
      tookMs: 22,
    })

    const deps = {
      sessionManager: { getSession: vi.fn(), discoverSessionsForProject: vi.fn() },
      memoryStore: {},
      settingsStore: {},
      projectRegistry: {},
      gitOps: {},
    }

    registerSearchHandlers(deps as never)

    const handler = mocks.handlers.get('search:ask')
    if (!handler) {
      throw new Error('search:ask handler was not registered')
    }

    const request = {
      question: '  ',
      search: {
        projectId: 'project-1',
        activeSessionId: 'session-1',
        mode: 'everything',
        query: 'auth flow',
        scope: { kind: 'all-project-sessions', includeAdditionalDirs: true },
        matchMode: 'literal',
        caseSensitive: false,
        wholeWord: false,
      },
    }

    const response = await handler({}, request)

    expect(mocks.executeSearchQuery).toHaveBeenCalledWith(
      { sessionManager: deps.sessionManager, memoryStore: deps.memoryStore },
      request.search,
    )
    expect(mocks.answerSearchQuestion).toHaveBeenCalledWith(
      {
        settingsStore: deps.settingsStore,
        projectRegistry: deps.projectRegistry,
        sessionManager: deps.sessionManager,
        gitOps: deps.gitOps,
      },
      { ...request, question: 'auth flow' },
      expect.objectContaining({ total: 1 }),
    )
    expect(response).toMatchObject({
      answer: 'The auth file changed [S1].',
      tookMs: 22,
    })
  })
})
