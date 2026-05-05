import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parseVtt, filterRange, formatTranscript } from './vtt-parser'

let tmpFile: string
beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `vtt-${process.pid}-${Date.now()}-${Math.random()}.vtt`)
})
afterEach(() => { try { fs.unlinkSync(tmpFile) } catch { /* ignore */ } })

const VTT = `WEBVTT

00:00:01.000 --> 00:00:03.000
hello world

00:00:03.500 --> 00:00:05.000
second cue

00:00:06.000 --> 00:00:07.000
<c.colorBC>tag</c> stripping
`

describe('parseVtt', () => {
  it('parses cues with start, end, and text', () => {
    fs.writeFileSync(tmpFile, VTT)
    const segs = parseVtt(tmpFile)
    expect(segs).toHaveLength(3)
    expect(segs[0]).toEqual({ start: 1, end: 3, text: 'hello world' })
    expect(segs[1]).toEqual({ start: 3.5, end: 5, text: 'second cue' })
  })

  it('strips inline tags', () => {
    fs.writeFileSync(tmpFile, VTT)
    const segs = parseVtt(tmpFile)
    expect(segs[2].text).toBe('tag stripping')
  })

  it('dedupes rolling duplicates and prefix extensions', () => {
    fs.writeFileSync(tmpFile, `WEBVTT

00:00:01.000 --> 00:00:02.000
hello

00:00:02.000 --> 00:00:03.000
hello

00:00:03.000 --> 00:00:04.000
hello world
`)
    const segs = parseVtt(tmpFile)
    expect(segs).toHaveLength(1)
    expect(segs[0].text).toBe('hello world')
    expect(segs[0].end).toBe(4)
  })
})

describe('filterRange', () => {
  const segs = [
    { start: 0, end: 5, text: 'a' },
    { start: 5, end: 10, text: 'b' },
    { start: 10, end: 15, text: 'c' },
  ]

  it('returns all when both bounds undefined', () => {
    expect(filterRange(segs, undefined, undefined)).toEqual(segs)
  })

  it('keeps overlapping segments', () => {
    const out = filterRange(segs, 4, 11)
    expect(out.map((s) => s.text)).toEqual(['a', 'b', 'c'])
  })

  it('drops segments outside the range', () => {
    const out = filterRange(segs, 10.5, 14)
    expect(out.map((s) => s.text)).toEqual(['c'])
  })
})

describe('formatTranscript', () => {
  it('emits MM:SS timestamp prefixes', () => {
    const out = formatTranscript([
      { start: 0, end: 1, text: 'first' },
      { start: 65, end: 70, text: 'over a minute' },
    ])
    expect(out).toBe('[00:00] first\n[01:05] over a minute')
  })
})
