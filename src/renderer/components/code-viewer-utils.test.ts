import { describe, it, expect } from 'vitest'
import { parseDiffToLineRanges } from './code-viewer-utils'

describe('parseDiffToLineRanges', () => {
  it('returns empty ranges for empty diff', () => {
    expect(parseDiffToLineRanges('')).toEqual({ added: [], modified: [], deleted: [] })
  })

  it('detects added lines', () => {
    const diff = [
      'diff --git a/foo.ts b/foo.ts',
      'index abc..def 100644',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,3 +1,5 @@',
      ' line1',
      ' line2',
      '+newline3',
      '+newline4',
      ' line3',
    ].join('\n')
    const result = parseDiffToLineRanges(diff)
    expect(result.added).toEqual([{ startLine: 3, endLine: 4 }])
    expect(result.modified).toEqual([])
    expect(result.deleted).toEqual([])
  })

  it('detects modified lines (adjacent remove + add)', () => {
    const diff = [
      'diff --git a/foo.ts b/foo.ts',
      'index abc..def 100644',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-old line2',
      '+new line2',
      ' line3',
    ].join('\n')
    const result = parseDiffToLineRanges(diff)
    expect(result.added).toEqual([])
    expect(result.modified).toEqual([{ startLine: 2, endLine: 2 }])
    expect(result.deleted).toEqual([])
  })

  it('detects deleted lines', () => {
    const diff = [
      'diff --git a/foo.ts b/foo.ts',
      'index abc..def 100644',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,4 +1,3 @@',
      ' line1',
      '-removed',
      ' line2',
      ' line3',
    ].join('\n')
    const result = parseDiffToLineRanges(diff)
    expect(result.added).toEqual([])
    expect(result.modified).toEqual([])
    expect(result.deleted).toEqual([1])
  })

  it('handles multiple hunks', () => {
    const diff = [
      'diff --git a/foo.ts b/foo.ts',
      'index abc..def 100644',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,3 +1,4 @@',
      ' line1',
      '+added',
      ' line2',
      ' line3',
      '@@ -10,3 +11,4 @@',
      ' line10',
      '+added2',
      ' line11',
      ' line12',
    ].join('\n')
    const result = parseDiffToLineRanges(diff)
    expect(result.added).toEqual([
      { startLine: 2, endLine: 2 },
      { startLine: 12, endLine: 12 },
    ])
  })
})
