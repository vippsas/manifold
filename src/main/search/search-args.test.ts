import { describe, expect, it } from 'vitest'
import type { SearchQueryRequest } from '../../shared/search-types'
import { buildGitGrepArgs } from './gitgrep-fallback'
import { buildRipgrepArgs } from './ripgrep-engine'

function createRequest(overrides: Partial<SearchQueryRequest> = {}): SearchQueryRequest {
  return {
    projectId: 'project-1',
    activeSessionId: 'session-1',
    mode: 'code',
    query: 'TODO',
    scope: { kind: 'active-session' },
    matchMode: 'literal',
    caseSensitive: false,
    wholeWord: false,
    ...overrides,
  }
}

describe('search arg builders', () => {
  it('passes the full requested limit to ripgrep', () => {
    expect(buildRipgrepArgs(createRequest(), 100)).toContain('100')
  })

  it('passes the full requested limit to git grep fallback', () => {
    expect(buildGitGrepArgs(createRequest(), 100)).toContain('100')
  })

  it('places a dashed ripgrep query after a -- separator so it is a literal pattern', () => {
    for (const query of ['-x', '--pre=/tmp/x']) {
      const args = buildRipgrepArgs(createRequest({ query }), 100)
      const separatorIndex = args.indexOf('--')
      const queryIndex = args.indexOf(query)
      expect(separatorIndex).toBeGreaterThanOrEqual(0)
      expect(queryIndex).toBeGreaterThan(separatorIndex)
    }
  })
})
