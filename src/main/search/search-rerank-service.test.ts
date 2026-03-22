import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRuntimeByIdMock = vi.hoisted(() => vi.fn())

vi.mock('../agent/runtimes', () => ({
  getRuntimeById: getRuntimeByIdMock,
}))

describe('maybeRerankSearchResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reorders top results when AI reranking returns source ids', async () => {
    const { maybeRerankSearchResults } = await import('./search-rerank-service')
    getRuntimeByIdMock.mockReturnValue({
      id: 'claude',
      binary: 'claude',
      aiModelArgs: ['--model', 'haiku'],
    })

    const deps = createDeps()
    deps.gitOps.aiGenerate.mockResolvedValue('S2 S1')

    const response = await maybeRerankSearchResults(deps, createRequest(), createRetrieval())

    expect(response.results.map((result) => result.id)).toEqual(['memory-1', 'code-1', 'code-2'])
    expect(response.warnings).toBeUndefined()
  })

  it('returns exact results when reranking is disabled', async () => {
    const { maybeRerankSearchResults } = await import('./search-rerank-service')
    const deps = createDeps({
      settingsStore: {
        getSettings: vi.fn(() => ({
          defaultRuntime: 'claude',
          search: {
            ai: {
              enabled: true,
              mode: 'answer',
              runtimeId: 'default',
              citationLimit: 6,
              maxContextResults: 4,
            },
          },
        })),
      },
    })

    const retrieval = createRetrieval()
    const response = await maybeRerankSearchResults(deps, createRequest(), retrieval)

    expect(response).toEqual(retrieval)
  })
})

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    settingsStore: {
      getSettings: vi.fn(() => ({
        defaultRuntime: 'claude',
        search: {
          ai: {
            enabled: true,
            mode: 'rerank',
            runtimeId: 'default',
            citationLimit: 6,
            maxContextResults: 3,
          },
        },
      })),
    },
    projectRegistry: {
      getProject: vi.fn(() => ({
        id: 'project-1',
        path: '/repo',
      })),
    },
    sessionManager: {
      getSession: vi.fn(() => ({
        runtimeId: 'claude',
        worktreePath: '/repo/.manifold/worktrees/feature-search',
      })),
    },
    gitOps: {
      aiGenerate: vi.fn(),
    },
    ...overrides,
  }
}

function createRequest() {
  return {
    projectId: 'project-1',
    activeSessionId: 'session-1',
    mode: 'everything' as const,
    query: 'auth flow',
    scope: { kind: 'all-project-sessions' as const, includeAdditionalDirs: true },
    matchMode: 'literal' as const,
    caseSensitive: false,
    wholeWord: false,
  }
}

function createRetrieval() {
  return {
    total: 3,
    tookMs: 14,
    results: [
      {
        id: 'code-1',
        source: 'code' as const,
        title: 'auth.ts',
        snippet: 'validateToken(token)',
        filePath: '/repo/src/auth.ts',
        rootPath: '/repo',
        relativePath: 'src/auth.ts',
        line: 42,
      },
      {
        id: 'memory-1',
        source: 'memory' as const,
        memorySource: 'session_summary' as const,
        title: 'Auth summary',
        snippet: 'The auth flow now validates refreshed tokens before reuse.',
        createdAt: 123,
      },
      {
        id: 'code-2',
        source: 'code' as const,
        title: 'routes.ts',
        snippet: 'router.post(\"/login\")',
        filePath: '/repo/src/routes.ts',
        rootPath: '/repo',
        relativePath: 'src/routes.ts',
        line: 12,
      },
    ],
  }
}
