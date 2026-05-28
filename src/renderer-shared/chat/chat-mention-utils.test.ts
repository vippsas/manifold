import { describe, expect, it } from 'vitest'
import {
  findActiveMention,
  applyMention,
  insertMentionAtCursor,
  rankMentionPaths,
  findActiveCommand,
  applyCommand,
  rankCommands,
} from './chat-mention-utils'

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

describe('findActiveCommand', () => {
  it('detects a command at the start of the input', () => {
    expect(findActiveCommand('/rev', 4)).toEqual({ start: 0, end: 4, query: 'rev' })
  })

  it('returns the bare trigger with an empty query', () => {
    expect(findActiveCommand('/', 1)).toEqual({ start: 0, end: 1, query: '' })
  })

  it('reads only up to the cursor', () => {
    expect(findActiveCommand('/review', 4)).toEqual({ start: 0, end: 4, query: 'rev' })
  })

  it('returns null when the slash is not at the start of the input', () => {
    expect(findActiveCommand('hello /rev', 10)).toBeNull()
  })

  it('returns null once the command token contains whitespace (it has args now)', () => {
    expect(findActiveCommand('/rev arg', 8)).toBeNull()
  })

  it('returns null when there is no slash', () => {
    expect(findActiveCommand('rev', 3)).toBeNull()
  })
})

describe('applyCommand', () => {
  it('replaces the active token with /name and a trailing space', () => {
    const command = { start: 0, end: 4, query: 'rev' }
    expect(applyCommand('/rev', command, 'review')).toEqual({ text: '/review ', cursor: 8 })
  })

  it('preserves text after the cursor', () => {
    const command = { start: 0, end: 2, query: 'r' }
    expect(applyCommand('/r rest', command, 'review')).toEqual({ text: '/review  rest', cursor: 8 })
  })

  it('keeps a plugin-namespaced command name intact', () => {
    const command = { start: 0, end: 4, query: 'com' }
    expect(applyCommand('/com', command, 'commit-commands:commit')).toEqual({
      text: '/commit-commands:commit ',
      cursor: 24,
    })
  })
})

describe('rankCommands', () => {
  const commands = ['review', 'compact', 'clear', 'commit-commands:commit', 'superpowers:brainstorming']

  it('returns all commands (capped) when the query is empty', () => {
    expect(rankCommands(commands, '', 2)).toEqual(['review', 'compact'])
  })

  it('ranks name-prefix matches first, shortest name wins ties', () => {
    expect(rankCommands(commands, 'co', 10)[0]).toBe('compact')
  })

  it('matches the part after a plugin namespace', () => {
    expect(rankCommands(commands, 'brain', 10)[0]).toBe('superpowers:brainstorming')
  })

  it('excludes non-matching commands', () => {
    expect(rankCommands(commands, 'co', 10)).not.toContain('review')
  })
})
