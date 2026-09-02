import { describe, it, expect } from 'vitest'
import { Terminal } from '@xterm/xterm'
import { stripTerminalQueries } from './terminal-replay'
import { filterTerminalResponses } from '../../terminal-input-filter'

describe('stripTerminalQueries', () => {
  it('drops DSR cursor-position queries, including the DEC private form', () => {
    expect(stripTerminalQueries('a\x1b[6nb\x1b[?6nc')).toBe('abc')
  })

  it('drops the device-attributes queries both runtimes send on startup', () => {
    expect(stripTerminalQueries('a\x1b[cb\x1b[0cc\x1b[>cd\x1b[>0ce')).toBe('abcde')
  })

  it('drops every query in the buffer', () => {
    expect(stripTerminalQueries('\x1b[6n1\x1b[?6n2\x1b[c3\x1b[6n')).toBe('123')
  })

  it('leaves output that has no query untouched', () => {
    const painted = 'ready\r\n\x1b[32mgreen\x1b[0m\x1b[2;1H\x1b[K'
    expect(stripTerminalQueries(painted)).toBe(painted)
  })

  it('leaves the queries xterm.js answers only with a param xterm ignores', () => {
    // DA1/DA2 with Ps > 0 draw no reply, so they are not ours to remove.
    expect(stripTerminalQueries('\x1b[1c')).toBe('\x1b[1c')
    // ESC[5n reports terminal health, not the cursor — no reply is injected today.
    expect(stripTerminalQueries('\x1b[5n')).toBe('\x1b[5n')
  })

  it('leaves the reports themselves alone — only queries are dropped', () => {
    expect(stripTerminalQueries('\x1b[2;1R\x1b[?1;2c')).toBe('\x1b[2;1R\x1b[?1;2c')
  })
})

// Drives the real emulator over the real replay path. A codex session's buffered
// output holds one ESC[6n per startup/resize plus a startup ESC[c, and xterm.js
// answers every one it parses. Unfiltered, those answers reach the live PTY as
// keystrokes and the running program renders their tails as ";1R;1R;1R;1R".
describe('replaying a buffer that contains terminal queries', () => {
  const replay = 'codex\r\n\x1b[c\x1b[6n>_ \x1b[6nready\r\n\x1b[6n\x1b[?6n'

  function collectPtyInput(data: string): Promise<string[]> {
    const terminal = new Terminal({ cols: 80, rows: 24 })
    const sentToPty: string[] = []
    terminal.onData((chunk) => {
      const filtered = filterTerminalResponses(chunk)
      if (filtered) sentToPty.push(filtered)
    })
    terminal.write(data)
    return new Promise((resolve) => setTimeout(() => resolve(sentToPty), 50))
  }

  it('sends nothing to the PTY once the queries are stripped', async () => {
    expect(await collectPtyInput(stripTerminalQueries(replay))).toEqual([])
  })

  it('would otherwise send one stale report per query', async () => {
    const sent = await collectPtyInput(replay)
    expect(sent).toEqual([
      '\x1b[?1;2c',
      '\x1b[2;1R',
      '\x1b[2;4R',
      '\x1b[3;1R',
      '\x1b[?3;1R',
    ])
  })
})
