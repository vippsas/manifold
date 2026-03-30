import { describe, it, expect } from 'vitest'
import {
  NlInputBuffer,
  stripAnsiForContext,
  RollingOutputBuffer,
  buildNlTranslationPrompt,
} from './nl-command-translator'

describe('NlInputBuffer', () => {
  it('detects # prefix when Enter is pressed', () => {
    const buf = new NlInputBuffer()
    buf.feed('# please install')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'nl-query', query: 'please install' })
  })

  it('returns passthrough for normal commands', () => {
    const buf = new NlInputBuffer()
    buf.feed('ls -la')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'passthrough' })
  })

  it('returns passthrough for bare #', () => {
    const buf = new NlInputBuffer()
    buf.feed('#')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'passthrough' })
  })

  it('returns passthrough for #word without space', () => {
    const buf = new NlInputBuffer()
    buf.feed('#nospc')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'passthrough' })
  })

  it('resets buffer after Enter', () => {
    const buf = new NlInputBuffer()
    buf.feed('# hello')
    buf.feed('\r')
    buf.feed('ls')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'passthrough' })
  })

  it('handles character-by-character input', () => {
    const buf = new NlInputBuffer()
    buf.feed('#')
    buf.feed(' ')
    buf.feed('h')
    buf.feed('i')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'nl-query', query: 'hi' })
  })

  it('handles backspace (0x7f) correctly', () => {
    const buf = new NlInputBuffer()
    buf.feed('# helloo')
    buf.feed('\x7f') // backspace
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'nl-query', query: 'hello' })
  })

  it('handles Ctrl+U (kill line) correctly', () => {
    const buf = new NlInputBuffer()
    buf.feed('# something')
    buf.feed('\x15') // Ctrl+U
    buf.feed('ls')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'passthrough' })
  })

  it('returns accumulate for non-Enter keys', () => {
    const buf = new NlInputBuffer()
    const result = buf.feed('a')
    expect(result).toEqual({ type: 'accumulate' })
  })

  it('trims whitespace from query', () => {
    const buf = new NlInputBuffer()
    buf.feed('#   install stuff   ')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'nl-query', query: 'install stuff' })
  })

  it('returns passthrough for empty query after #', () => {
    const buf = new NlInputBuffer()
    buf.feed('#    ')
    const result = buf.feed('\r')
    expect(result).toEqual({ type: 'passthrough' })
  })
})

describe('stripAnsiForContext', () => {
  it('strips color codes', () => {
    expect(stripAnsiForContext('\x1b[32mhello\x1b[0m')).toBe('hello')
  })

  it('strips cursor movement sequences', () => {
    expect(stripAnsiForContext('\x1b[2;5Htext\x1b[K')).toBe('text')
  })

  it('strips OSC sequences', () => {
    expect(stripAnsiForContext('\x1b]0;title\x07hello')).toBe('hello')
  })

  it('preserves plain text', () => {
    expect(stripAnsiForContext('just plain text')).toBe('just plain text')
  })

  it('handles empty string', () => {
    expect(stripAnsiForContext('')).toBe('')
  })
})

describe('RollingOutputBuffer', () => {
  it('stores lines up to the limit', () => {
    const buf = new RollingOutputBuffer(3)
    buf.append('line1\nline2\nline3\n')
    expect(buf.getLines()).toEqual(['line1', 'line2', 'line3'])
  })

  it('drops oldest lines when limit exceeded', () => {
    const buf = new RollingOutputBuffer(2)
    buf.append('a\nb\nc\n')
    expect(buf.getLines()).toEqual(['b', 'c'])
  })

  it('handles partial lines across appends', () => {
    const buf = new RollingOutputBuffer(10)
    buf.append('hel')
    buf.append('lo\nworld\n')
    expect(buf.getLines()).toEqual(['hello', 'world'])
  })

  it('strips ANSI before storing', () => {
    const buf = new RollingOutputBuffer(10)
    buf.append('\x1b[32mcolored\x1b[0m\n')
    expect(buf.getLines()).toEqual(['colored'])
  })

  it('skips empty lines', () => {
    const buf = new RollingOutputBuffer(10)
    buf.append('a\n\n\nb\n')
    expect(buf.getLines()).toEqual(['a', 'b'])
  })

  it('returns text block via getText()', () => {
    const buf = new RollingOutputBuffer(10)
    buf.append('line1\nline2\n')
    expect(buf.getText()).toBe('line1\nline2')
  })
})

describe('buildNlTranslationPrompt', () => {
  it('includes query and terminal output in prompt', () => {
    const prompt = buildNlTranslationPrompt({
      query: 'please install typescript',
      terminalOutput: 'sh: tsc: command not found',
      cwd: '/Users/dev/my-project',
      gitStatus: '## main\n M src/index.ts',
      os: 'darwin',
      shell: 'zsh',
    })
    expect(prompt).toContain('please install typescript')
    expect(prompt).toContain('sh: tsc: command not found')
    expect(prompt).toContain('/Users/dev/my-project')
    expect(prompt).toContain('M src/index.ts')
    expect(prompt).toContain('darwin')
    expect(prompt).toContain('zsh')
    expect(prompt).toContain('ONLY the shell command')
  })

  it('handles empty terminal output', () => {
    const prompt = buildNlTranslationPrompt({
      query: 'list files',
      terminalOutput: '',
      cwd: '/tmp',
      gitStatus: '',
      os: 'darwin',
      shell: 'zsh',
    })
    expect(prompt).toContain('list files')
    expect(prompt).toContain('(no recent output)')
  })
})
