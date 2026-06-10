import { describe, it, expect } from 'vitest'
import { setBounded, addBounded } from './bounded-cache'

describe('setBounded', () => {
  it('evicts the oldest entries past the cap', () => {
    const m = new Map<string, number>()
    setBounded(m, 'a', 1, 2)
    setBounded(m, 'b', 2, 2)
    setBounded(m, 'c', 3, 2)
    expect(m.size).toBe(2)
    expect(m.has('a')).toBe(false)
    expect([...m.keys()]).toEqual(['b', 'c'])
  })

  it('refreshes recency on re-insert so a touched key survives', () => {
    const m = new Map<string, number>()
    setBounded(m, 'a', 1, 2)
    setBounded(m, 'b', 2, 2)
    setBounded(m, 'a', 11, 2) // touch 'a' -> now most recent
    setBounded(m, 'c', 3, 2) // evicts 'b', not 'a'
    expect(m.get('a')).toBe(11)
    expect(m.has('b')).toBe(false)
    expect(m.has('c')).toBe(true)
  })
})

describe('addBounded', () => {
  it('evicts the oldest member past the cap', () => {
    const s = new Set<string>()
    addBounded(s, 'a', 2)
    addBounded(s, 'b', 2)
    addBounded(s, 'c', 2)
    expect(s.size).toBe(2)
    expect(s.has('a')).toBe(false)
    expect([...s]).toEqual(['b', 'c'])
  })
})
