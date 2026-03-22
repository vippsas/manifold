import { describe, expect, it } from 'vitest'
import { splitHighlightedText } from './search-highlight'

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
