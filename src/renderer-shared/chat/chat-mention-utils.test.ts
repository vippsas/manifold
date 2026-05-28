import { describe, expect, it } from 'vitest'
import { findActiveMention, applyMention, insertMentionAtCursor, rankMentionPaths } from './chat-mention-utils'

describe('findActiveMention', () => {
  it('detects a mention at the start of the input', () => {
    expect(findActiveMention('@src', 4)).toEqual({ start: 0, end: 4, query: 'src' })
  })

  it('detects a mention after whitespace', () => {
    expect(findActiveMention('look at @comp', 13)).toEqual({ start: 8, end: 13, query: 'comp' })
  })

  it('returns the bare trigger with an empty query', () => {
    expect(findActiveMention('hi @', 4)).toEqual({ start: 3, end: 4, query: '' })
  })

  it('ignores an @ that is not at a word boundary (e.g. emails)', () => {
    expect(findActiveMention('mail me@host', 12)).toBeNull()
  })

  it('returns null when the token before the cursor has whitespace', () => {
    expect(findActiveMention('@src/app file', 13)).toBeNull()
  })

  it('only considers the token ending at the cursor', () => {
    expect(findActiveMention('@a @b', 5)).toEqual({ start: 3, end: 5, query: 'b' })
  })
})

describe('applyMention', () => {
  it('replaces the active token with @path and a trailing space', () => {
    const mention = { start: 8, end: 13, query: 'comp' }
    expect(applyMention('look at @comp', mention, 'src/components/App.tsx')).toEqual({
      text: 'look at @src/components/App.tsx ',
      cursor: 32,
    })
  })

  it('preserves text after the cursor', () => {
    const mention = { start: 0, end: 2, query: 'a' }
    expect(applyMention('@a rest', mention, 'a.ts')).toEqual({ text: '@a.ts  rest', cursor: 6 })
  })
})

describe('insertMentionAtCursor', () => {
  it('inserts at an empty input without a leading space', () => {
    expect(insertMentionAtCursor('', 0, 'a.ts')).toEqual({ text: '@a.ts ', cursor: 6 })
  })

  it('adds a leading space when the preceding char is not whitespace', () => {
    expect(insertMentionAtCursor('see', 3, 'a.ts')).toEqual({ text: 'see @a.ts ', cursor: 10 })
  })

  it('does not double a leading space', () => {
    expect(insertMentionAtCursor('see ', 4, 'a.ts')).toEqual({ text: 'see @a.ts ', cursor: 10 })
  })
})

describe('rankMentionPaths', () => {
  const paths = ['src/App.tsx', 'src/app/main.ts', 'docs/app-notes.md', 'README.md']

  it('returns all paths (capped) when the query is empty', () => {
    expect(rankMentionPaths(paths, '', 2)).toEqual(['src/App.tsx', 'src/app/main.ts'])
  })

  it('ranks basename-prefix matches first', () => {
    expect(rankMentionPaths(paths, 'app', 10)[0]).toBe('src/App.tsx')
  })

  it('includes full-path matches after basename matches', () => {
    const result = rankMentionPaths(paths, 'app', 10)
    expect(result).toContain('src/app/main.ts')
  })

  it('excludes non-matching paths', () => {
    expect(rankMentionPaths(paths, 'app', 10)).not.toContain('README.md')
  })
})
