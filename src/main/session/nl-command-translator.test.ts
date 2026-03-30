import { describe, it, expect } from 'vitest'
import { NlInputBuffer } from './nl-command-translator'

describe('NlInputBuffer', () => {
  it('detects # prefix when Enter is pressed', () => {
    const buf = new NlInputBuffer()
    buf.feed('# please install')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'nl-query', query: 'please install' })
  })

  it('returns passthrough for normal commands', () => {
    const buf = new NlInputBuffer()
    buf.feed('ls -la')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'passthrough' })
  })

  it('returns passthrough for bare #', () => {
    const buf = new NlInputBuffer()
    buf.feed('#')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'passthrough' })
  })

  it('returns passthrough for #word without space', () => {
    const buf = new NlInputBuffer()
    buf.feed('#nospc')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'passthrough' })
  })

  it('resets buffer after Enter', () => {
    const buf = new NlInputBuffer()
    buf.feed('# hello')
    buf.feed('\r')
    buf.feed('ls')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'passthrough' })
  })

  it('handles character-by-character input', () => {
    const buf = new NlInputBuffer()
    buf.feed('#')
    buf.feed(' ')
    buf.feed('h')
    buf.feed('i')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'nl-query', query: 'hi' })
  })

  it('handles backspace (0x7f) correctly', () => {
    const buf = new NlInputBuffer()
    buf.feed('# helloo')
    buf.feed('\x7f') // backspace
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'nl-query', query: 'hello' })
  })

  it('handles Ctrl+U (kill line) correctly', () => {
    const buf = new NlInputBuffer()
    buf.feed('# something')
    buf.feed('\x15') // Ctrl+U
    buf.feed('ls')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'passthrough' })
  })

  it('returns accumulate for non-Enter keys', () => {
    const buf = new NlInputBuffer()
    const result = buf.feed('a')
    expect(result).toEqual({ type: 'accumulate' })
  })

  it('trims whitespace from query', () => {
    const buf = new NlInputBuffer()
    buf.feed('#   install stuff   ')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'nl-query', query: 'install stuff' })
  })

  it('returns passthrough for empty query after #', () => {
    const buf = new NlInputBuffer()
    buf.feed('#    ')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'passthrough' })
  })
})
