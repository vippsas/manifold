import { describe, it, expect } from 'vitest'
import { formatTimestamp } from './watch-format'

describe('formatTimestamp', () => {
  it('formats seconds < 1 minute', () => {
    expect(formatTimestamp(7)).toBe('00:07')
  })
  it('formats minutes:seconds', () => {
    expect(formatTimestamp(135)).toBe('02:15')
  })
  it('includes hour when above an hour', () => {
    expect(formatTimestamp(3735)).toBe('1:02:15')
  })
  it('clamps negatives to zero', () => {
    expect(formatTimestamp(-5)).toBe('00:00')
  })
})
