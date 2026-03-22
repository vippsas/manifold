import { describe, expect, it } from 'vitest'
import { buildMemoryFtsQuery } from './memory-fts-query'

describe('buildMemoryFtsQuery', () => {
  it('tokenizes natural-language questions into FTS-safe terms', () => {
    expect(buildMemoryFtsQuery('How does auth work?')).toBe('"auth" "work"')
  })

  it('drops punctuation-only queries', () => {
    expect(buildMemoryFtsQuery('???')).toBeNull()
  })

  it('falls back to the original tokens when every token is low-signal', () => {
    expect(buildMemoryFtsQuery('to be or not to be')).toBe('"to" "be" "or" "not" "to" "be"')
  })
})
