import { describe, it, expect } from 'vitest'
import { relativeTime, splitBranch } from './format'

const NOW = new Date('2026-06-14T00:00:00Z').getTime()

describe('relativeTime', () => {
  it('returns an em dash for null', () => expect(relativeTime(null, NOW)).toBe('—'))
  it('buckets recent days', () => {
    expect(relativeTime('2026-06-14T00:00:00Z', NOW)).toBe('today')
    expect(relativeTime('2026-06-13T00:00:00Z', NOW)).toBe('yesterday')
    expect(relativeTime('2026-06-08T00:00:00Z', NOW)).toBe('6d ago')
  })
  it('buckets weeks, months, years', () => {
    expect(relativeTime('2026-05-28T00:00:00Z', NOW)).toBe('2w ago')
    expect(relativeTime('2026-03-15T00:00:00Z', NOW)).toBe('3mo ago')
    expect(relativeTime('2024-06-14T00:00:00Z', NOW)).toBe('2y ago')
  })
})

describe('splitBranch', () => {
  it('splits the namespace prefix off', () =>
    expect(splitBranch('manifold/gh-issues-2')).toEqual({ ns: 'manifold/', rest: 'gh-issues-2' }))
  it('keeps a slashless branch whole', () => expect(splitBranch('main')).toEqual({ ns: '', rest: 'main' }))
})
