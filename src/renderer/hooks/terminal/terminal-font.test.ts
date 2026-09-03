import { describe, it, expect } from 'vitest'
import { buildTerminalOptions } from './terminal-font'
import { clampUiScale, UI_SCALE_MIN, UI_SCALE_MAX } from '../../../shared/defaults'

describe('buildTerminalOptions uiScale', () => {
  it('defaults fontSize to 13 when no scale is given', () => {
    expect(buildTerminalOptions(1000).fontSize).toBe(13)
  })

  it.each([
    [0.85, 11],
    [1, 13],
    [1.15, 15],
    [1.5, 20],
    [2, 26],
  ])('rounds 13 * %s to %s', (scale, expected) => {
    expect(buildTerminalOptions(1000, undefined, undefined, scale).fontSize).toBe(expected)
  })
})

describe('buildTerminalOptions legibility', () => {
  // An agent painting `ESC[47m` (Claude Code's ANSI-palette highlight) on a dark
  // theme puts near-white `ansiWhite` behind the near-white default foreground.
  // xterm only re-derives a readable foreground when a minimum ratio is set.
  it('asks xterm to enforce a readable foreground against any cell background', () => {
    expect(buildTerminalOptions(1000).minimumContrastRatio).toBe(4.5)
  })
})

describe('clampUiScale', () => {
  it('passes through an in-range value', () => {
    expect(clampUiScale(1.25)).toBe(1.25)
  })

  it.each([undefined, NaN, Infinity])('falls back to 1 for %s', (value) => {
    expect(clampUiScale(value as number)).toBe(1)
  })

  it('clamps below the minimum and above the maximum', () => {
    expect(clampUiScale(-5)).toBe(UI_SCALE_MIN)
    expect(clampUiScale(0)).toBe(UI_SCALE_MIN)
    expect(clampUiScale(500)).toBe(UI_SCALE_MAX)
  })
})
