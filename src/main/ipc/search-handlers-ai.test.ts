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
    maybeRerankSearchResults: vi.fn(),
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

vi.mock('../search/search-rerank-service', () => ({
  maybeRerankSearchResults: mocks.maybeRerankSearchResults,
}))

describe('registerSearchHandlers AI flow', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.maybeRerankSearchResults.mockImplementation(async (_deps, _request, retrieval) => retrieval)
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

  it('routes search:query through optional AI reranking', async () => {
    const { registerSearchHandlers } = await import('./search-handlers')
    mocks.executeSearchQuery.mockResolvedValue({
      results: [],
      total: 0,
      tookMs: 5,
    })
    mocks.maybeRerankSearchResults.mockResolvedValue({
      results: [{ id: 'reranked' }],
      total: 1,
      tookMs: 7,
    })

    const deps = {
      sessionManager: {},
      memoryStore: {},
      settingsStore: {},
      projectRegistry: {},
      gitOps: {},
    }

    registerSearchHandlers(deps as never)

    const handler = mocks.handlers.get('search:query')
    if (!handler) {
      throw new Error('search:query handler was not registered')
    }

    const request = {
      projectId: 'project-1',
      activeSessionId: 'session-1',
      mode: 'code',
      query: 'auth flow',
      scope: { kind: 'active-session' },
      matchMode: 'literal',
      caseSensitive: false,
      wholeWord: false,
    }

    const response = await handler({}, request)

    expect(mocks.maybeRerankSearchResults).toHaveBeenCalledWith(
      {
        settingsStore: deps.settingsStore,
        projectRegistry: deps.projectRegistry,
        sessionManager: deps.sessionManager,
        gitOps: deps.gitOps,
      },
      request,
      expect.objectContaining({ tookMs: 5 }),
    )
    expect(response).toMatchObject({
      results: [{ id: 'reranked' }],
      total: 1,
    })
  })

  it('retries ask retrieval with keyword fallback when the natural-language query has no exact hits', async () => {
    const { registerSearchHandlers } = await import('./search-handlers')
    mocks.executeSearchQuery
      .mockResolvedValueOnce({
        results: [],
        total: 0,
        tookMs: 4,
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: 'code-linkerd',
            source: 'code',
            title: 'docs/security.md',
            snippet: 'Linkerd mTLS decision',
            filePath: '/repo/docs/security.md',
            rootPath: '/repo',
            relativePath: 'docs/security.md',
            line: 8,
          },
        ],
        total: 1,
        tookMs: 6,
      })
      .mockResolvedValueOnce({
        results: [
          {
            id: 'memory-linkerd',
            source: 'memory',
            memorySource: 'session_summary',
            title: 'Decision summary',
            snippet: 'We chose Linkerd mTLS over Cilium mTLS for this service mesh rollout.',
            createdAt: 123,
          },
        ],
        total: 1,
        tookMs: 5,
      })
    mocks.answerSearchQuestion.mockResolvedValue({
      answer: 'We chose Linkerd for operational reasons [S1].',
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
      question: 'Why did we choose Linkerd mtls over Cilium mtls?',
      search: {
        projectId: 'project-1',
        activeSessionId: 'session-1',
        mode: 'everything',
        query: 'Why did we choose Linkerd mtls over Cilium mtls?',
        scope: { kind: 'all-project-sessions', includeAdditionalDirs: true },
        matchMode: 'literal',
        caseSensitive: false,
        wholeWord: false,
      },
    }

    await handler({}, request)

    expect(mocks.executeSearchQuery).toHaveBeenNthCalledWith(
      1,
      { sessionManager: deps.sessionManager, memoryStore: deps.memoryStore },
      request.search,
    )
    expect(mocks.executeSearchQuery).toHaveBeenNthCalledWith(
      2,
      { sessionManager: deps.sessionManager, memoryStore: deps.memoryStore },
      expect.objectContaining({
        mode: 'code',
        query: 'Linkerd|mtls|Cilium',
        matchMode: 'regex',
      }),
    )
    expect(mocks.executeSearchQuery).toHaveBeenNthCalledWith(
      3,
      { sessionManager: deps.sessionManager, memoryStore: deps.memoryStore },
      expect.objectContaining({
        mode: 'memory',
        query: 'Linkerd mtls Cilium',
        scope: { kind: 'memory-only' },
        matchMode: 'literal',
      }),
    )
    expect(mocks.answerSearchQuestion).toHaveBeenCalledWith(
      {
        settingsStore: deps.settingsStore,
        projectRegistry: deps.projectRegistry,
        sessionManager: deps.sessionManager,
        gitOps: deps.gitOps,
      },
      request,
      expect.objectContaining({
        total: 2,
        results: expect.arrayContaining([
          expect.objectContaining({ id: 'code-linkerd' }),
          expect.objectContaining({ id: 'memory-linkerd' }),
        ]),
      }),
    )
  })
})
