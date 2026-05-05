import { describe, it, expect } from 'vitest'
import { autoFps, autoFpsFocus, formatTime, parseTime, MAX_FPS } from './frame-extractor'

describe('parseTime', () => {
  it('parses SS', () => { expect(parseTime('45')).toBe(45) })
  it('parses MM:SS', () => { expect(parseTime('2:15')).toBe(135) })
  it('parses HH:MM:SS', () => { expect(parseTime('1:02:15')).toBe(3735) })
  it('returns undefined for empty input', () => { expect(parseTime('')).toBeUndefined() })
  it('passes numbers through', () => { expect(parseTime(99)).toBe(99) })
  it('throws on garbage', () => { expect(() => parseTime('1:2:3:4')).toThrow() })
})

describe('formatTime', () => {
  it('drops the hour when zero', () => { expect(formatTime(45)).toBe('00:45') })
  it('formats minutes:seconds', () => { expect(formatTime(135)).toBe('02:15') })
  it('includes hour when above an hour', () => { expect(formatTime(3735)).toBe('1:02:15') })
})

describe('autoFps', () => {
  it('targets 12 frames for very short videos', () => {
    const { fps, target } = autoFps(10)
    expect(target).toBe(12)
    expect(fps).toBeGreaterThan(0)
    expect(fps).toBeLessThanOrEqual(MAX_FPS)
  })

  it('targets 40 frames for ~1 minute videos', () => {
    expect(autoFps(60).target).toBe(40)
  })

  it('targets 60 frames for ~3 minute videos', () => {
    expect(autoFps(180).target).toBe(60)
  })

  it('targets 80 frames for ~10 minute videos', () => {
    expect(autoFps(600).target).toBe(80)
  })

  it('caps at maxFrames for very long videos', () => {
    expect(autoFps(60 * 60).target).toBe(100)
  })

  it('never exceeds MAX_FPS', () => {
    expect(autoFps(2).fps).toBeLessThanOrEqual(MAX_FPS)
  })

  it('handles zero duration safely', () => {
    expect(autoFps(0)).toEqual({ fps: 1, target: 1 })
  })
})

describe('autoFpsFocus', () => {
  it('uses dense budgets on tiny ranges', () => {
    expect(autoFpsFocus(5).target).toBeGreaterThanOrEqual(10)
  })

  it('still caps at MAX_FPS', () => {
    expect(autoFpsFocus(3).fps).toBeLessThanOrEqual(MAX_FPS)
  })

  it('caps frames at maxFrames for long ranges', () => {
    expect(autoFpsFocus(60 * 5).target).toBe(100)
  })
})
