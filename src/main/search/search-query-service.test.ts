import { beforeEach, describe, expect, it, vi } from 'vitest'

const searchCodeInSessionsMock = vi.hoisted(() => vi.fn())
const searchFilesInSessionsMock = vi.hoisted(() => vi.fn())

vi.mock('./code-search-service', () => ({
  searchCodeInSessions: searchCodeInSessionsMock,
}))

vi.mock('./file-search-service', () => ({
  searchFilesInSessions: searchFilesInSessionsMock,
}))

describe('executeSearchQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchCodeInSessionsMock.mockResolvedValue({ results: [], warnings: [] })
    searchFilesInSessionsMock.mockResolvedValue({ results: [], warnings: [] })
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

  it('returns only filename matches in files mode and skips code and memory', async () => {
    const { executeSearchQuery } = await import('./search-query-service')

    searchFilesInSessionsMock.mockResolvedValue({
      results: [{
        id: 'file-1',
        source: 'file',
        title: 'scripts/release.sh',
        snippet: '',
        score: 1130,
        filePath: '/repo/scripts/release.sh',
        rootPath: '/repo',
        relativePath: 'scripts/release.sh',
        matchedIndices: [8, 9, 10, 11, 12, 13, 14],
        sessionId: 'session-1',
        projectId: 'project-1',
      }],
      warnings: [],
    })

    const memoryStore = { search: vi.fn(), getDb: vi.fn() }
    const session = {
      id: 'session-1',
      projectId: 'project-1',
      runtimeId: 'codex',
      branchName: 'larvik',
      worktreePath: '/repo',
      status: 'running',
      pid: 1,
      additionalDirs: [],
    }

    const response = await executeSearchQuery({
      sessionManager: {
        getSession: vi.fn(() => session),
        discoverSessionsForProject: vi.fn(async () => []),
      },
      memoryStore,
    } as never, {
      projectId: 'project-1',
      activeSessionId: 'session-1',
      mode: 'files',
      query: 'release.sh',
      scope: { kind: 'active-session' },
      matchMode: 'literal',
      caseSensitive: false,
      wholeWord: false,
      limit: 100,
    })

    expect(searchCodeInSessionsMock).not.toHaveBeenCalled()
    expect(memoryStore.search).not.toHaveBeenCalled()
    expect(response.results).toEqual([expect.objectContaining({ id: 'file-1', source: 'file' })])
  })

  it('orders filename matches ahead of code and memory in everything mode', async () => {
    const { executeSearchQuery } = await import('./search-query-service')

    searchFilesInSessionsMock.mockResolvedValue({
      results: [{
        id: 'file-1',
        source: 'file',
        title: 'release.sh',
        snippet: '',
        score: 1100,
        filePath: '/repo/release.sh',
        rootPath: '/repo',
        relativePath: 'release.sh',
        matchedIndices: [],
        sessionId: 'session-1',
        projectId: 'project-1',
      }],
      warnings: [],
    })
    searchCodeInSessionsMock.mockResolvedValue({
      results: [{
        id: 'code-1',
        source: 'code',
        title: 'README.md',
        snippet: 'release notes',
        projectId: 'project-1',
        filePath: '/repo/README.md',
        rootPath: '/repo',
        relativePath: 'README.md',
        line: 1,
      }],
      warnings: [],
    })

    const memoryStore = {
      search: vi.fn(() => ({
        results: [{
          id: 'mem-1',
          type: 'task_summary',
          source: 'session_summary',
          title: 'note',
          summary: 'release notes',
          sessionId: 'session-1',
          runtimeId: 'claude',
          branchName: 'larvik',
          worktreePath: '/repo',
          createdAt: 1,
          rank: 0.1,
        }],
        total: 1,
      })),
      getDb: vi.fn(() => ({ prepare: vi.fn(() => ({ all: vi.fn(() => []) })) })),
    }
    const session = {
      id: 'session-1',
      projectId: 'project-1',
      runtimeId: 'claude',
      branchName: 'larvik',
      worktreePath: '/repo',
      status: 'running',
      pid: 1,
      additionalDirs: [],
    }

    const response = await executeSearchQuery({
      sessionManager: {
        getSession: vi.fn(() => session),
        discoverSessionsForProject: vi.fn(async () => [session]),
      },
      memoryStore,
    } as never, {
      projectId: 'project-1',
      activeSessionId: 'session-1',
      mode: 'everything',
      query: 'release',
      scope: { kind: 'active-session' },
      matchMode: 'literal',
      caseSensitive: false,
      wholeWord: false,
      limit: 100,
    })

    expect(response.results.map((result) => result.source)).toEqual(['file', 'code', 'memory'])
  })
})
