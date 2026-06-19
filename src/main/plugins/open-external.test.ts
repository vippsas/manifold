import { describe, it, expect } from 'vitest'
import { isExternallyOpenable } from './open-external'

describe('isExternallyOpenable', () => {
  it('accepts http and https URLs', () => {
    expect(isExternallyOpenable('https://github.com/o/r/pull/1')).toBe(true)
    expect(isExternallyOpenable('http://example.com')).toBe(true)
  })

  it('rejects non-http(s) schemes that could reach the shell or local files', () => {
    expect(isExternallyOpenable('file:///etc/passwd')).toBe(false)
    expect(isExternallyOpenable('javascript:alert(1)')).toBe(false)
    expect(isExternallyOpenable('vscode://extension')).toBe(false)
    expect(isExternallyOpenable('mailto:a@b.c')).toBe(false)
  })

  it('rejects malformed input', () => {
    expect(isExternallyOpenable('not a url')).toBe(false)
    expect(isExternallyOpenable('')).toBe(false)
  })
})
