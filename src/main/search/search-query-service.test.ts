import { beforeEach, describe, expect, it, vi } from 'vitest'

const searchCodeInSessionsMock = vi.hoisted(() => vi.fn())

vi.mock('./code-search-service', () => ({
  searchCodeInSessions: searchCodeInSessionsMock,
}))

describe('executeSearchQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses explicit workspace session ids and project ids for all-agent search', async () => {
    const { executeSearchQuery } = await import('./search-query-service')

    searchCodeInSessionsMock.mockResolvedValue({
      results: [{
        id: 'code-1',
        source: 'code',
        title: 'CLAUDE.md',
        snippet: 'This repo is about Trancefjord',
        projectId: 'project-2',
        filePath: '/trancefjord/CLAUDE.md',
        rootPath: '/trancefjord',
        relativePath: 'CLAUDE.md',
        line: 5,
      }],
      warnings: [],
    })

    const searchInteractions = vi.fn(() => [])
    const memoryStore = {
      search: vi.fn((projectId: string) => (
        projectId === 'project-2'
          ? {
              results: [{
                id: 'sum-1',
                type: 'task_summary',
                source: 'session_summary',
                title: 'Trancefjord summary',
                summary: 'The Trancefjord repo contains the landing and app scaffolding.',
                sessionId: 'session-2',
                runtimeId: 'claude',
                branchName: 'larvik',
                worktreePath: '/trancefjord/.manifold/worktrees/larvik',
                createdAt: 123,
                rank: 0.2,
              }],
              total: 1,
            }
          : { results: [], total: 0 }
      )),
      getDb: vi.fn(() => ({
        prepare: vi.fn(() => ({
          all: searchInteractions,
        })),
      })),
    }

    const sessionById = {
      'session-1': {
        id: 'session-1',
        projectId: 'project-1',
        runtimeId: 'codex',
        branchName: 'cilium',
        worktreePath: '/cloud-platform-decisions/.manifold/worktrees/cilium',
        status: 'running',
        pid: 1,
        additionalDirs: [],
      },
      'session-2': {
        id: 'session-2',
        projectId: 'project-2',
        runtimeId: 'claude',
        branchName: 'larvik',
        worktreePath: '/trancefjord/.manifold/worktrees/larvik',
        status: 'waiting',
        pid: 2,
        additionalDirs: ['/trancefjord/docs'],
      },
    }

    const response = await executeSearchQuery({
      sessionManager: {
        getSession: vi.fn((sessionId: string) => sessionById[sessionId as keyof typeof sessionById] ?? null),
        discoverSessionsForProject: vi.fn(async () => []),
      },
      memoryStore,
    } as never, {
      projectId: 'project-1',
      activeSessionId: 'session-1',
      mode: 'everything',
      query: 'trancefjord',
      scope: {
        kind: 'all-project-sessions',
        sessionIds: ['session-1', 'session-2'],
        projectIds: ['project-1', 'project-2'],
        includeAdditionalDirs: true,
      },
      matchMode: 'literal',
      caseSensitive: false,
      wholeWord: false,
      limit: 100,
    })

    expect(searchCodeInSessionsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'session-1', projectId: 'project-1' }),
        expect.objectContaining({ id: 'session-2', projectId: 'project-2' }),
      ]),
      expect.objectContaining({
        scope: expect.objectContaining({
          sessionIds: ['session-1', 'session-2'],
          projectIds: ['project-1', 'project-2'],
        }),
      }),
    )
    expect(memoryStore.search).toHaveBeenCalledWith('project-1', 'trancefjord', expect.any(Object))
    expect(memoryStore.search).toHaveBeenCalledWith('project-2', 'trancefjord', expect.any(Object))
    expect(response.results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'code-1',
        projectId: 'project-2',
        source: 'code',
      }),
      expect.objectContaining({
        id: 'project-2:sum-1',
        projectId: 'project-2',
        source: 'memory',
      }),
    ]))
  })
})
