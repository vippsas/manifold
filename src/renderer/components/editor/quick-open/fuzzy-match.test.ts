import { describe, it, expect } from 'vitest'
import { fuzzyScore, fuzzyFilter } from './fuzzy-match'

describe('fuzzyScore', () => {
  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyScore('xyz', 'src/app.ts')).toBeNull()
  })

  it('returns null when the query is longer than the target', () => {
    expect(fuzzyScore('toolong', 'ab')).toBeNull()
  })

  it('matches a subsequence case-insensitively', () => {
    expect(fuzzyScore('apts', 'src/App.ts')).not.toBeNull()
  })

  it('ranks a basename match above a scattered match', () => {
    const basename = fuzzyScore('codeview', 'src/components/editor/CodeViewer.tsx')!
    const scattered = fuzzyScore('codeview', 'c/o/d/e/v/i/e/w/other.ts')!
    expect(basename).toBeGreaterThan(scattered)
  })
})

describe('fuzzyFilter', () => {
  const files = ['src/CodeViewer.tsx', 'src/code-viewer-diff.ts', 'README.md']

  it('returns all items (capped) for an empty query', () => {
    expect(fuzzyFilter('', files)).toEqual(files)
  })

  it('keeps only matching items, best-first', () => {
    const out = fuzzyFilter('codeview', files)
    expect(out).toContain('src/CodeViewer.tsx')
    expect(out).not.toContain('README.md')
    expect(out[0]).toBe('src/CodeViewer.tsx')
  })

  it('respects the limit', () => {
    expect(fuzzyFilter('', files, 2)).toHaveLength(2)
  })
})
