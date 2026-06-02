import { describe, expect, it } from 'vitest'
import { highlightByIndices, splitHighlightedText } from './search-highlight'

describe('splitHighlightedText', () => {
  it('highlights literal matches case-insensitively by default', () => {
    expect(splitHighlightedText('Search search SEARCH', {
      query: 'search',
      matchMode: 'literal',
      caseSensitive: false,
      wholeWord: false,
    })).toEqual([
      { text: 'Search', match: true },
      { text: ' ', match: false },
      { text: 'search', match: true },
      { text: ' ', match: false },
      { text: 'SEARCH', match: true },
    ])
  })

  it('supports whole-word regex highlighting', () => {
    expect(splitHighlightedText('TODO TODOISH TODO', {
      query: 'TODO',
      matchMode: 'regex',
      caseSensitive: true,
      wholeWord: true,
    })).toEqual([
      { text: 'TODO', match: true },
      { text: ' TODOISH ', match: false },
      { text: 'TODO', match: true },
    ])
  })

  it('falls back to plain text when the regex is invalid', () => {
    expect(splitHighlightedText('TODO', {
      query: '[',
      matchMode: 'regex',
      caseSensitive: false,
      wholeWord: false,
    })).toEqual([{ text: 'TODO', match: false }])
  })
})

describe('highlightByIndices', () => {
  it('collapses contiguous matched indices into one segment', () => {
    expect(highlightByIndices('release.sh', [0, 1, 2])).toEqual([
      { text: 'rel', match: true },
      { text: 'ease.sh', match: false },
    ])
  })

  it('keeps scattered indices as separate segments', () => {
    expect(highlightByIndices('abcd', [0, 2])).toEqual([
      { text: 'a', match: true },
      { text: 'b', match: false },
      { text: 'c', match: true },
      { text: 'd', match: false },
    ])
  })

  it('returns plain text when there are no indices', () => {
    expect(highlightByIndices('abc', [])).toEqual([{ text: 'abc', match: false }])
  })
})
