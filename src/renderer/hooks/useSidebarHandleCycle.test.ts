import { describe, it, expect } from 'vitest'
import { nextSidebarFraction } from './useSidebarHandleCycle'

const SIXTH = 1 / 6

describe('nextSidebarFraction', () => {
  it('advances through the 1/6 → 2/6 → 3/6 → 0 → 1/6 cycle', () => {
    expect(nextSidebarFraction(1 * SIXTH)).toBeCloseTo(2 * SIXTH)
    expect(nextSidebarFraction(2 * SIXTH)).toBeCloseTo(3 * SIXTH)
    expect(nextSidebarFraction(3 * SIXTH)).toBe(0)
    expect(nextSidebarFraction(0)).toBeCloseTo(1 * SIXTH)
  })

  it('snaps a manually dragged width to the nearest step before advancing', () => {
    // ~0.47 is closest to 3/6, so the next step collapses to 0.
    expect(nextSidebarFraction(0.47)).toBe(0)
    // A sliver is closest to 0, so the next step restores the 1/6 default.
    expect(nextSidebarFraction(0.04)).toBeCloseTo(1 * SIXTH)
  })
})
