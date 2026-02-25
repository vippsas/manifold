import { describe, it, expect } from 'vitest'
import { detectAddDir } from './add-dir-detector'

describe('detectAddDir', () => {
  it('returns the path when output contains the success line', () => {
    const output = 'Added /Users/sven/git/landingpage/ as a working directory for this session'
    expect(detectAddDir(output)).toBe('/Users/sven/git/landingpage')
  })

  it('returns null when output does not contain the pattern', () => {
    expect(detectAddDir('some random output')).toBeNull()
  })

  it('strips trailing slash from detected path', () => {
    const output = 'Added /tmp/mydir/ as a working directory for this session'
    expect(detectAddDir(output)).toBe('/tmp/mydir')
  })

  it('handles path without trailing slash', () => {
    const output = 'Added /tmp/mydir as a working directory for this session'
    expect(detectAddDir(output)).toBe('/tmp/mydir')
  })

  it('extracts path from multi-line output', () => {
    const output = [
      'some previous output',
      '└ Added /Users/sven/git/landingpage/ as a working directory for this session · /permissions to manage',
      '❯ ',
    ].join('\n')
    expect(detectAddDir(output)).toBe('/Users/sven/git/landingpage')
  })

  it('handles paths with spaces', () => {
    const output = 'Added /Users/sven/my project/ as a working directory for this session'
    expect(detectAddDir(output)).toBe('/Users/sven/my project')
  })

  it('handles ANSI escape codes in PTY output', () => {
    // Raw PTY data has color/formatting codes around text
    const output =
      '\x1b[1mAdded\x1b[0m \x1b[4m/Users/sven/git/landingpage/\x1b[0m as a working directory for this session'
    expect(detectAddDir(output)).toBe('/Users/sven/git/landingpage')
  })

  it('handles ANSI codes with box-drawing prefix', () => {
    const output =
      '\x1b[90m└\x1b[0m \x1b[1mAdded\x1b[0m \x1b[4m/Users/sven/git/landingpage/\x1b[0m as a working directory for this session \x1b[90m·\x1b[0m /permissions to manage'
    expect(detectAddDir(output)).toBe('/Users/sven/git/landingpage')
  })

  it('handles cursor-forward escape codes used as spaces (real Claude Code PTY output)', () => {
    // Claude Code uses \x1b[1C (cursor forward 1) instead of space characters
    const output =
      'Added\x1b[1C\x1b[1m/Users/sven/git/landingpage/\x1b[1C\x1b[22mas\x1b[1Ca\x1b[1Cworking\x1b[1Cdirectory\x1b[1Cfor\x1b[1Cthis\x1b[1Csession'
    expect(detectAddDir(output)).toBe('/Users/sven/git/landingpage')
  })
})
