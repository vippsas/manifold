import { describe, expect, it } from 'vitest'
import { buildMemoryFtsQuery } from './memory-fts-query'

describe('buildMemoryFtsQuery', () => {
  it('tokenizes natural-language questions into FTS-safe terms', () => {
    expect(buildMemoryFtsQuery('How does auth work?')).toBe('"How" "does" "auth" "work"')
  })

  it('drops punctuation-only queries', () => {
    expect(buildMemoryFtsQuery('???')).toBeNull()
  })
})
