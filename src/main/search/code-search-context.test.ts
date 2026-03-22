import { describe, expect, it } from 'vitest'
import type { CodeSearchResult } from '../../shared/search-types'
import { applyContextToCodeResult } from './code-search-context'

function createResult(overrides: Partial<CodeSearchResult> = {}): CodeSearchResult {
  return {
    id: 'result-1',
    source: 'code',
    title: 'src/file.ts',
    snippet: 'const fallback = true',
    filePath: '/repo/src/file.ts',
    rootPath: '/repo',
    relativePath: 'src/file.ts',
    line: 3,
    column: 7,
    sessionId: 'session-1',
    branchName: 'feature/search',
    runtimeId: 'claude',
    ...overrides,
  }
}

describe('applyContextToCodeResult', () => {
  it('adds surrounding lines and refreshes the snippet from file contents', () => {
    const result = applyContextToCodeResult(
      createResult(),
      [
        'function alpha() {',
        '  const before = true',
        '  const matched = searchTerm()',
        '  const after = true',
        '}',
      ],
      1,
    )

    expect(result.snippet).toBe('  const matched = searchTerm()')
    expect(result.contextBefore).toEqual(['  const before = true'])
    expect(result.contextAfter).toEqual(['  const after = true'])
  })

  it('leaves the result unchanged when file contents are unavailable', () => {
    const original = createResult()
    expect(applyContextToCodeResult(original, null, 1)).toEqual(original)
  })
})
