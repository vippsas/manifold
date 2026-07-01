import { describe, it, expect } from 'vitest'
import { nextSidebarFraction } from './useSidebarHandleCycle'

const SIXTH = 1 / 6

describe('nextSidebarFraction', () => {
  it('advances through the 1/6 → 2/6 → 3/6 → 1/6 cycle', () => {
    expect(nextSidebarFraction(1 * SIXTH)).toBeCloseTo(2 * SIXTH)
    expect(nextSidebarFraction(2 * SIXTH)).toBeCloseTo(3 * SIXTH)
    expect(nextSidebarFraction(3 * SIXTH)).toBeCloseTo(1 * SIXTH)
  })

  it('never collapses to 0 in either direction, from any starting width', () => {
    for (const start of [0, 0.04, 1 * SIXTH, 2 * SIXTH, 0.47, 3 * SIXTH, 0.9]) {
      expect(nextSidebarFraction(start)).toBeGreaterThan(0)
      expect(nextSidebarFraction(start, true)).toBeGreaterThan(0)
    }
  })

  it('snaps a manually dragged width to the nearest step before advancing', () => {
    // ~0.47 is closest to 3/6, so the next step wraps to the 1/6 default.
    expect(nextSidebarFraction(0.47)).toBeCloseTo(1 * SIXTH)
    // A sliver is closest to 1/6, so the next step advances to 2/6.
    expect(nextSidebarFraction(0.04)).toBeCloseTo(2 * SIXTH)
  })

  it('walks the reverse 1/6 → 3/6 → 2/6 → 1/6 cycle when reversed', () => {
    expect(nextSidebarFraction(1 * SIXTH, true)).toBeCloseTo(3 * SIXTH)
    expect(nextSidebarFraction(3 * SIXTH, true)).toBeCloseTo(2 * SIXTH)
    expect(nextSidebarFraction(2 * SIXTH, true)).toBeCloseTo(1 * SIXTH)
  })
})
