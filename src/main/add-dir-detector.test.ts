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
})
