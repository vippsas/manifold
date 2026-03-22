import { describe, expect, it } from 'vitest'
import type { SearchQueryRequest } from '../../shared/search-types'
import type { AgentSession } from '../../shared/types'
import {
  buildCodeSearchRoots,
  createCodeSearchResult,
  sortAndLimitCodeResults,
} from './search-engine'

function createSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'session-1',
    projectId: 'project-1',
    runtimeId: 'claude',
    branchName: 'feature/search',
    worktreePath: '/repo/.manifold/worktrees/feature-search',
    status: 'running',
    pid: 123,
    additionalDirs: ['/repo/docs', '/repo/design'],
    ...overrides,
  }
}

function createRequest(overrides: Partial<SearchQueryRequest> = {}): SearchQueryRequest {
  return {
    projectId: 'project-1',
    activeSessionId: 'session-1',
    mode: 'code',
    query: 'search',
    scope: { kind: 'active-session' },
    matchMode: 'literal',
    caseSensitive: false,
    wholeWord: false,
    ...overrides,
  }
}

describe('search-engine', () => {
  it('uses only the active worktree for active-session scope', () => {
    const roots = buildCodeSearchRoots(
      [createSession()],
      createRequest({ scope: { kind: 'active-session' } }),
    )

    expect(roots).toEqual([
      expect.objectContaining({
        path: '/repo/.manifold/worktrees/feature-search',
        kind: 'worktree',
      }),
    ])
  })

  it('includes additional directories for visible-roots scope', () => {
    const roots = buildCodeSearchRoots(
      [createSession()],
      createRequest({ scope: { kind: 'visible-roots' } }),
    )

    expect(roots.map((root) => ({ path: root.path, kind: root.kind }))).toEqual([
      { path: '/repo/.manifold/worktrees/feature-search', kind: 'worktree' },
      { path: '/repo/docs', kind: 'additional-dir' },
      { path: '/repo/design', kind: 'additional-dir' },
    ])
  })

  it('labels additional-dir results and deduplicates repeated hits', () => {
    const session = createSession()
    const extraRoot = {
      path: '/repo/docs',
      kind: 'additional-dir' as const,
      session,
    }

    const first = createCodeSearchResult(extraRoot, 'guide.md', 12, 4, 'search guide', 0)
    const duplicate = createCodeSearchResult(extraRoot, 'guide.md', 12, 4, 'search guide', 1)
    const later = createCodeSearchResult(extraRoot, 'guide.md', 20, 1, 'later result', 2)

    expect(first.title).toBe('[docs] guide.md')
    expect(first.filePath).toBe('/repo/docs/guide.md')

    expect(
      sortAndLimitCodeResults([later, duplicate, first], 10).map((result) => ({
        title: result.title,
        filePath: result.filePath,
        line: result.line,
        column: result.column,
      })),
    ).toEqual([
      {
        title: '[docs] guide.md',
        filePath: '/repo/docs/guide.md',
        line: 12,
        column: 4,
      },
      {
        title: '[docs] guide.md',
        filePath: '/repo/docs/guide.md',
        line: 20,
        column: 1,
      },
    ])
  })
})
