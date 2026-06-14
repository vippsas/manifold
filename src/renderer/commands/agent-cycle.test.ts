import { describe, it, expect } from 'vitest'
import { cycleAgent } from './agent-cycle'

const a = { id: 'a' }
const b = { id: 'b' }
const c = { id: 'c' }

describe('cycleAgent', () => {
  it('returns null for an empty list', () => {
    expect(cycleAgent([], null, 1)).toBeNull()
    expect(cycleAgent([], 'a', -1)).toBeNull()
  })

  it('steps forward and wraps around', () => {
    expect(cycleAgent([a, b, c], 'a', 1)).toBe(b)
    expect(cycleAgent([a, b, c], 'c', 1)).toBe(a)
  })

  it('steps backward and wraps around', () => {
    expect(cycleAgent([a, b, c], 'b', -1)).toBe(a)
    expect(cycleAgent([a, b, c], 'a', -1)).toBe(c)
  })

  it('starts at the first agent going forward when nothing is active', () => {
    expect(cycleAgent([a, b, c], null, 1)).toBe(a)
  })

  it('starts at the last agent going backward when nothing is active', () => {
    expect(cycleAgent([a, b, c], null, -1)).toBe(c)
  })

  it('treats an unknown active id like no active agent', () => {
    expect(cycleAgent([a, b, c], 'gone', 1)).toBe(a)
  })

  it('stays on the only agent', () => {
    expect(cycleAgent([a], 'a', 1)).toBe(a)
  })
})
