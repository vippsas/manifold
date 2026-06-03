import { describe, expect, it } from 'vitest'
import { substringScore } from './substring-match'

describe('substringScore', () => {
  it('returns null when the query is not a contiguous substring', () => {
    expect(substringScore('xyz', 'release.sh')).toBeNull()
  })

  it('returns null for an empty query', () => {
    expect(substringScore('', 'release.sh')).toBeNull()
  })

  it('returns null when the query is longer than the target', () => {
    expect(substringScore('release.sh.extra', 'release.sh')).toBeNull()
  })

  it('does not match scattered letters of the query', () => {
    // The whole point: "lidl" must not match because l-i-d-l only appear
    // scattered across "linkedin-article.md".
    expect(substringScore('lidl', 'stories/jira/linkedin-article.md')).toBeNull()
    expect(substringScore('rsh', 'release.sh')).toBeNull()
    expect(substringScore('abc', 'aXbXc.ts')).toBeNull()
  })

  it('matches a contiguous substring and points at the matched characters', () => {
    const match = substringScore('lease', 'release.sh')
    expect(match).not.toBeNull()
    expect(match!.indices).toEqual([2, 3, 4, 5, 6])
    for (const [i, charIndex] of match!.indices.entries()) {
      expect('release.sh'[charIndex]).toBe('lease'[i])
    }
  })

  it('highlights a contiguous substring in the basename, not the directory', () => {
    // "scripts/release.sh" — the basename "release" starts at index 8, and the
    // 'r' in "scripts" (index 2) must NOT be where the match lands.
    const match = substringScore('release', 'scripts/release.sh')
    expect(match).not.toBeNull()
    expect(match!.indices).toEqual([8, 9, 10, 11, 12, 13, 14])
  })

  it('ranks a basename match above a directory match', () => {
    const basename = substringScore('app', 'src/app.ts')
    const directory = substringScore('app', 'app/index.ts')
    expect(basename).not.toBeNull()
    expect(directory).not.toBeNull()
    expect(basename!.score).toBeGreaterThan(directory!.score)
  })

  it('matches case-insensitively', () => {
    expect(substringScore('readme', 'README.md')).not.toBeNull()
    expect(substringScore('REL', 'release.sh')).not.toBeNull()
  })
})
