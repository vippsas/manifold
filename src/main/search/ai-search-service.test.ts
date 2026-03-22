import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchAskRequest, SearchQueryResponse } from '../../shared/search-types'

const getRuntimeByIdMock = vi.hoisted(() => vi.fn())

vi.mock('../agent/runtimes', () => ({
  getRuntimeById: getRuntimeByIdMock,
}))

describe('answerSearchQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a grounded no-results answer without invoking AI', async () => {
    const { answerSearchQuestion } = await import('./ai-search-service')
    const deps = createDeps()

    const response = await answerSearchQuestion(
      deps,
      createRequest(),
      { results: [], total: 0, tookMs: 12 },
    )

    expect(response).toMatchObject({
      answer: 'No grounded search results were found for this question.',
      citations: [],
    })
    expect(deps.gitOps.aiGenerate).not.toHaveBeenCalled()
  })

  it('keeps cited sources returned by the AI answer', async () => {
    const { answerSearchQuestion } = await import('./ai-search-service')
    getRuntimeByIdMock.mockReturnValue({
      id: 'claude',
      binary: 'claude',
      aiModelArgs: ['--model', 'haiku'],
    })

    const deps = createDeps()
    deps.gitOps.aiGenerate.mockResolvedValue('The auth path changed in the service [S2].')

    const retrieval = createRetrieval()
    const response = await answerSearchQuestion(deps, createRequest(), retrieval)

    expect(deps.gitOps.aiGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'claude',
        binary: 'claude',
      }),
      expect.stringContaining('Question: auth flow'),
      '/repo/.manifold/worktrees/feature-search',
      ['--model', 'haiku'],
    )
    expect(response.citations).toEqual([retrieval.results[1]])
  })

  it('adds a source trail when the AI omits inline citations', async () => {
    const { answerSearchQuestion } = await import('./ai-search-service')
    getRuntimeByIdMock.mockReturnValue({
      id: 'claude',
      binary: 'claude',
      aiModelArgs: [],
    })

    const deps = createDeps()
    deps.gitOps.aiGenerate.mockResolvedValue('The memory summary points to the same auth change.')

    const retrieval = createRetrieval()
    const response = await answerSearchQuestion(deps, createRequest(), retrieval)

    expect(response.answer).toContain('Sources: [S1] [S2]')
    expect(response.citations).toEqual(retrieval.results.slice(0, 2))
  })
})

function createDeps() {
  return {
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
  }
}

function createRequest(): SearchAskRequest {
  return {
    question: 'auth flow',
    search: {
      projectId: 'project-1',
      activeSessionId: 'session-1',
      mode: 'everything',
      query: 'auth flow',
      scope: { kind: 'all-project-sessions', includeAdditionalDirs: true },
      matchMode: 'literal',
      caseSensitive: false,
      wholeWord: false,
      limit: 100,
      contextLines: 1,
    },
  }
}

function createRetrieval(): SearchQueryResponse {
  return {
    total: 2,
    tookMs: 14,
    results: [
      {
        id: 'code-1',
        source: 'code',
        title: 'auth service',
        snippet: 'validateToken(token)',
        filePath: '/repo/src/auth.ts',
        rootPath: '/repo',
        relativePath: 'src/auth.ts',
        line: 42,
      },
      {
        id: 'memory-1',
        source: 'memory',
        memorySource: 'session_summary',
        title: 'Auth summary',
        snippet: 'The auth flow now validates refreshed tokens before reuse.',
        createdAt: 123,
      },
    ],
  }
}
