import { describe, expect, it } from 'vitest'
import { fuzzyScore } from './fuzzy-match'

describe('fuzzyScore', () => {
  it('returns null when the query is not a subsequence of the target', () => {
    expect(fuzzyScore('xyz', 'release.sh')).toBeNull()
  })

  it('returns null for an empty query', () => {
    expect(fuzzyScore('', 'release.sh')).toBeNull()
  })

  it('returns null when the query is longer than the target', () => {
    expect(fuzzyScore('release.sh.extra', 'release.sh')).toBeNull()
  })

  it('matches an abbreviation as a subsequence', () => {
    const match = fuzzyScore('rsh', 'release.sh')
    expect(match).not.toBeNull()
    // Indices must be ascending and point at the matched characters.
    expect(match!.indices).toEqual([...match!.indices].sort((a, b) => a - b))
    for (const [i, charIndex] of match!.indices.entries()) {
      expect('release.sh'[charIndex]).toBe('rsh'[i])
    }
  })

  it('highlights a contiguous substring in the basename, not the directory', () => {
    // "scripts/release.sh" — the basename "release" starts at index 8, and the
    // 'r' in "scripts" (index 2) must NOT be where the match lands.
    const match = fuzzyScore('release', 'scripts/release.sh')
    expect(match).not.toBeNull()
    expect(match!.indices).toEqual([8, 9, 10, 11, 12, 13, 14])
  })

  it('ranks a basename match above a directory match', () => {
    const basename = fuzzyScore('app', 'src/app.ts')
    const directory = fuzzyScore('app', 'app/index.ts')
    expect(basename).not.toBeNull()
    expect(directory).not.toBeNull()
    expect(basename!.score).toBeGreaterThan(directory!.score)
  })

  it('ranks a contiguous substring above a scattered subsequence', () => {
    const contiguous = fuzzyScore('abc', 'abc.ts')
    const scattered = fuzzyScore('abc', 'aXbXc.ts')
    expect(contiguous).not.toBeNull()
    expect(scattered).not.toBeNull()
    expect(contiguous!.score).toBeGreaterThan(scattered!.score)
  })

  it('matches case-insensitively', () => {
    expect(fuzzyScore('readme', 'README.md')).not.toBeNull()
    expect(fuzzyScore('REL', 'release.sh')).not.toBeNull()
  })
})
